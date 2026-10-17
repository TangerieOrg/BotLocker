import { SALT_FETCH_DAILY_CAP, SALT_FETCH_INTERVAL_MS, SALT_UPLOAD } from "../config.ts";
import { exhaustFetchLog, getDueSalts, getFetchLog, hasSalt, recordFetch, retrySalt, type SaltRow, seedSalts, setSaltStatus } from "../db/salts.ts";
import { ApiError, getKnownMatches, getStoredSalts, uploadSalts } from "../deadlock/salts.ts";
import { now } from "../helpers/now.ts";
import { logger } from "../helpers/log.ts";
import { getAccounts, type SteamAccount } from "../steam/client.ts";
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
// Matches that ended this recently count as live and go ahead of the backlog
const LIVE_WINDOW_S = 6 * 60 * 60;

export const saltState = {
    apiPausedUntil: 0,
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

// Main's fetch log keeps the original key, the extras have their own
const logUser = (account : SteamAccount) => account.main ? undefined : account.username;

// Matches being fetched right now, so two accounts never take the same one
const inFlight = new Set<number>();

// Like deadlock-api-ingest: each account works through its daily allowance in a burst, one request every
// SALT_FETCH_INTERVAL_MS, until it's spent or Steam rate limits it (which spends the rest of it)
async function fetchLoop(account : SteamAccount) {
    while(true) {
        try {
            if(await fetchNext(account)) {
                await sleep(SALT_FETCH_INTERVAL_MS);
                continue;
            }
        } catch(err) {
            error(`Salt fetch loop failed on ${account.username}`, err);
        }
        await sleep(TICK_MS);
    }
}

// Whether a request went out
async function fetchNext(account : SteamAccount) {
    if(!SALT_UPLOAD || !account.isReady()) return false;

    const fetches = await getFetchLog(now(), logUser(account));
    if(fetches.length >= SALT_FETCH_DAILY_CAP) return false;
    if(fetches.length > 0 && now() - Math.max(...fetches) < SALT_FETCH_INTERVAL_MS / 1000) return false;

    const row = (await dueRows("missing", inFlight.size + 1)).find(x => !inFlight.has(x.match_id));
    if(!row) return false;

    inFlight.add(row.match_id);
    try {
        await fetchOne(account, row);
    } finally {
        inFlight.delete(row.match_id);
    }
    return true;
}

async function fetchOne(account : SteamAccount, row : SaltRow) {
    let res;
    try {
        res = await getGcMatchSalts(account, row.match_id);
    } catch(err) {
        // Not connected means it never left, anything else may have counted against us
        if(!message(err).startsWith("Not connected")) {
            await recordFetch(now(), logUser(account));
            await retrySalt(row.match_id, backoff(row), message(err), MAX_ATTEMPTS);
        }
        return;
    }
    await recordFetch(now(), logUser(account));

    switch(res.result) {
        case GcResult.Success:
            if(hasSalt(res)) {
                await setSaltStatus(row.match_id, "fetched", res, `gc:${account.selfId() ?? ""}`);
                log(`Got salts for ${row.match_id} (${account.username})`);
            } else {
                await setSaltStatus(row.match_id, "failed", undefined, undefined, "GC returned no salts");
            }
            break;
        case GcResult.RateLimited:
            // Same as deadlock-api-ingest: Steam's limit doesn't clear in hours, so the whole 24h allowance is spent
            await exhaustFetchLog(now(), SALT_FETCH_DAILY_CAP, logUser(account));
            error(`GC rate limited salt fetching on ${account.username}, nothing more from it for 24h`);
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

// Credited to whichever account fetched it, older rows only say "gc" and came from the main account
const uploaderOf = (row : SaltRow) => {
    const id = row.source?.startsWith("gc:") ? row.source.slice(3) : undefined;
    return `botlocker:${id || (SteamStore.get().self ?? "unknown")}`;
};

async function uploadGroup(rows : SaltRow[], username : string) {
    try {
        await uploadSalts(rows, username);
        for(const row of rows) await setSaltStatus(row.match_id, "uploaded");
        log(`Uploaded salts for ${rows.length} matches as ${username}`);
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

async function runUploads() {
    if(!SALT_UPLOAD || now() < saltState.apiPausedUntil) return;

    const rows = await dueRows("fetched", UPLOAD_BATCH);
    const groups = Map.groupBy(rows, uploaderOf);
    for(const [username, group] of groups) {
        if(now() < saltState.apiPausedUntil) return;
        await uploadGroup(group, username);
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
            await runUploads();
        } catch(err) {
            error("Salt run failed", err);
        } finally {
            running = false;
        }
    };

    seed().catch(err => error("Couldn't queue stored matches", err));
    setInterval(() => seed().catch(err => error("Couldn't queue stored matches", err)), SEED_INTERVAL_MS);
    // Accounts only exist once startSteam has run
    setTimeout(() => {
        for(const account of getAccounts()) fetchLoop(account).catch(err => error("Salt fetch loop died", err));
    }, 10000);
    setTimeout(tick, 10000);
    setInterval(tick, TICK_MS);
}
