import { SALT_FETCH_DAILY_CAP, SALT_FETCH_INTERVAL_MS, SALT_UPLOAD } from "../config.ts";
import { getDueSalts, getFetchLog, hasSalt, recordFetch, retrySalt, type SaltRow, seedSalts, setSaltStatus } from "../db/salts.ts";
import { ApiError, getKnownMatches, getStoredSalts, uploadSalts } from "../deadlock/salts.ts";
import { now } from "../helpers/now.ts";
import { logger } from "../helpers/log.ts";
import { GcResult, getGcMatchSalts } from "../steam/gc.ts";
import { SteamStore } from "../steam/SteamStore.ts";

const { log, error } = logger("Salts");

const TICK_MS = 60 * 1000;
const SEED_INTERVAL_MS = 3 * 60 * 60 * 1000;
const CHECK_BATCH = 100;
// deadlock-api allows 30 of these a minute
const CHECK_GAP_MS = 2100;
// Their salt reads from the database allow 100 a second
const SALT_READ_CONCURRENCY = 10;
const UPLOAD_BATCH = 50;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_S = 10 * 60;
const RETRY_MAX_S = 6 * 60 * 60;
const API_PAUSE_S = 5 * 60;
const GC_RATE_LIMIT_PAUSE_S = 6 * 60 * 60;
// Matches that ended this recently count as live and go ahead of the backlog
const LIVE_WINDOW_S = 6 * 60 * 60;

export const saltState = {
    apiPausedUntil: 0,
    gcPausedUntil: 0,
    lastApiError: undefined as { at: number, message: string } | undefined,
    lastSeed: undefined as { at: number, added: number } | undefined
};

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));
const message = (err : unknown) => err instanceof Error ? err.message : String(err);
const backoff = (row : SaltRow) => now() + Math.min(RETRY_BASE_S * 2 ** row.attempts, RETRY_MAX_S);

function apiFailed(err : unknown) {
    saltState.lastApiError = { at: now(), message: message(err) };
    saltState.apiPausedUntil = now() + API_PAUSE_S;
    error(`deadlock-api trouble, backing off ${API_PAUSE_S / 60}m`, err);
}

const dueRows = (status : "pending" | "missing" | "fetched", limit : number) =>
    getDueSalts(status, limit, now(), now() - LIVE_WINDOW_S);

async function seed() {
    const added = await seedSalts();
    saltState.lastSeed = { at: now(), added };
    if(added > 0) log(`Queued ${added} stored matches for salts`);
}

async function checkRow(row : SaltRow, known : Set<number>) {
    if(!known.has(row.match_id)) return await setSaltStatus(row.match_id, "missing");

    // Keeping their salts is a bonus, covered either way
    const salts = await getStoredSalts(row.match_id).catch(() => undefined);
    const stored = salts && hasSalt(salts);
    await setSaltStatus(row.match_id, "covered", stored ? salts : undefined, stored ? "deadlock-api" : undefined);
}

// Asks deadlock-api which matches it has, working through everything unchecked in one go.
// Only ever reads, so it runs even with uploading off
async function runChecks() {
    while(true) {
        if(now() < saltState.apiPausedUntil) return;
        const rows = await dueRows("pending", CHECK_BATCH);
        if(rows.length == 0) return;

        try {
            const known = await getKnownMatches(rows.map(x => x.match_id));
            for(let i = 0; i < rows.length; i += SALT_READ_CONCURRENCY) {
                await Promise.all(rows.slice(i, i + SALT_READ_CONCURRENCY).map(x => checkRow(x, known)));
            }
        } catch(err) {
            apiFailed(err);
            return;
        }
        await sleep(CHECK_GAP_MS);
    }
}

// At most one match per interval and a daily cap, the game coordinator is strict about salts
async function runFetch() {
    if(!SALT_UPLOAD || !SteamStore.get().gcReady || now() < saltState.gcPausedUntil) return;

    const fetches = await getFetchLog(now());
    if(fetches.length >= SALT_FETCH_DAILY_CAP) return;
    if(fetches.length > 0 && now() - Math.max(...fetches) < SALT_FETCH_INTERVAL_MS / 1000) return;

    const [row] = await dueRows("missing", 1);
    if(!row) return;

    let res;
    try {
        res = await getGcMatchSalts(row.match_id);
    } catch(err) {
        // Not connected means it never left, anything else may have counted against us
        if(!message(err).startsWith("Not connected")) {
            await recordFetch(now());
            await retrySalt(row.match_id, backoff(row), message(err), MAX_ATTEMPTS);
        }
        return;
    }
    await recordFetch(now());

    switch(res.result) {
        case GcResult.Success:
            if(hasSalt(res)) {
                await setSaltStatus(row.match_id, "fetched", res, "gc");
                log(`Got salts for ${row.match_id}`);
            } else {
                await setSaltStatus(row.match_id, "failed", undefined, undefined, "GC returned no salts");
            }
            break;
        case GcResult.RateLimited:
            saltState.gcPausedUntil = now() + GC_RATE_LIMIT_PAUSE_S;
            error(`GC rate limited salt fetching, pausing for ${GC_RATE_LIMIT_PAUSE_S / 3600}h`);
            break;
        case GcResult.InvalidMatch:
        case GcResult.InvalidPermission:
            await setSaltStatus(row.match_id, "failed", undefined, undefined, `GC result ${res.result}`);
            break;
        default:
            await retrySalt(row.match_id, backoff(row), `GC result ${res.result}`, MAX_ATTEMPTS);
    }
}

async function uploadOne(row : SaltRow, username : string) {
    try {
        await uploadSalts([row], username);
        await setSaltStatus(row.match_id, "uploaded");
    } catch(err) {
        if(err instanceof ApiError && err.status == 400) {
            await setSaltStatus(row.match_id, "failed", undefined, undefined, "deadlock-api rejected the salts");
        } else {
            apiFailed(err);
            await retrySalt(row.match_id, backoff(row), message(err), MAX_ATTEMPTS);
        }
    }
}

async function runUploads() {
    if(!SALT_UPLOAD || now() < saltState.apiPausedUntil) return;

    const rows = await dueRows("fetched", UPLOAD_BATCH);
    if(rows.length == 0) return;

    const username = `botlocker:${SteamStore.get().self ?? "unknown"}`;
    try {
        await uploadSalts(rows, username);
        for(const row of rows) await setSaltStatus(row.match_id, "uploaded");
        log(`Uploaded salts for ${rows.length} matches`);
    } catch(err) {
        // One bad entry fails the whole request, so find which
        if(err instanceof ApiError && err.status == 400) {
            for(const row of rows) await uploadOne(row, username);
        } else {
            apiFailed(err);
            for(const row of rows) await retrySalt(row.match_id, backoff(row), message(err), MAX_ATTEMPTS);
        }
    }
}

export function startSalts() {
    if(!SALT_UPLOAD) log("SALT_UPLOAD is off, only checking what deadlock-api has");

    let running = false;
    const tick = async () => {
        if(running) return;
        running = true;
        try {
            await runChecks();
            await runFetch();
            await runUploads();
        } catch(err) {
            error("Salt run failed", err);
        } finally {
            running = false;
        }
    };

    seed().catch(err => error("Couldn't queue stored matches", err));
    setInterval(() => seed().catch(err => error("Couldn't queue stored matches", err)), SEED_INTERVAL_MS);
    setTimeout(tick, 10000);
    setInterval(tick, TICK_MS);
}
