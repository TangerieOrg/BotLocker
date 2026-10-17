import { asDbFunction } from "./connection.ts";
import { getKv, setKv } from "./kv.ts";
import { SALT_DELAY_S } from "../config.ts";

export type SaltStatus = "pending" | "missing" | "fetched" | "uploaded" | "covered" | "failed";

export interface Salts {
    cluster_id: number | null;
    metadata_salt: number | null;
    replay_salt: number | null;
}

export interface SaltRow extends Salts {
    match_id: number;
    match_end_time: number;
    salt_check_after: number;
    next_attempt_at: number;
    status: SaltStatus;
    source: string | null;
    attempts: number;
    last_error: string | null;
    fetched_at: number | null;
    uploaded_at: number | null;
}

export const hasSalt = (x : Salts) => !!x.metadata_salt || !!x.replay_salt;

// Rows for every stored match that doesn't have one yet, returns how many were added
export const seedSalts = asDbFunction(db => {
    using stmt = db.prepare(`--sql
        INSERT OR IGNORE INTO match_salts (match_id, match_end_time, salt_check_after)
        SELECT match_id, MAX(start_time + duration_s), MAX(start_time + duration_s) + ?
        FROM matches GROUP BY match_id
    `);
    return stmt.run(SALT_DELAY_S);
});

// Matches that just ended go first, then the backlog from oldest, so the ones whose salts expire first aren't left to last
export const getDueSalts = asDbFunction((db, status : SaltStatus, limit : number, at : number, liveSince : number) => {
    using stmt = db.prepare<SaltRow>(`--sql
        SELECT * FROM match_salts
        WHERE status = ? AND salt_check_after <= ? AND next_attempt_at <= ?
        ORDER BY (match_end_time >= ?) DESC, match_end_time ASC
        LIMIT ?
    `);
    return stmt.all(status, at, at, liveSince, limit);
});

export const setSaltStatus = asDbFunction((db, matchId : number, status : SaltStatus, salts? : Salts, source? : string, error? : string) => {
    const at = Math.floor(Date.now() / 1000);
    db.exec(`--sql
        UPDATE match_salts SET status = ?, last_error = ?,
            cluster_id = COALESCE(?, cluster_id), metadata_salt = COALESCE(?, metadata_salt), replay_salt = COALESCE(?, replay_salt),
            source = COALESCE(?, source),
            fetched_at = CASE WHEN ? = 'fetched' THEN ? ELSE fetched_at END,
            uploaded_at = CASE WHEN ? = 'uploaded' THEN ? ELSE uploaded_at END
        WHERE match_id = ?
    `, status, error ?? null, salts?.cluster_id ?? null, salts?.metadata_salt ?? null, salts?.replay_salt ?? null,
        source ?? null, status, at, status, at, matchId);
});

// Counts an attempt and leaves the row where it is for another go later, or fails it once it's had enough
export const retrySalt = asDbFunction((db, matchId : number, nextAt : number, error : string, maxAttempts : number) => {
    db.exec(`--sql
        UPDATE match_salts SET attempts = attempts + 1, last_error = ?, next_attempt_at = ?,
            status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE status END
        WHERE match_id = ?
    `, error, nextAt, maxAttempts, matchId);
});

export interface SaltSummary {
    counts: Partial<Record<SaltStatus, number>>;
    // Waiting on something and past the delay, so it's the bot holding them up rather than the clock
    overdue: number;
    nextDue?: number;
    failures: Pick<SaltRow, "match_id" | "last_error" | "attempts">[];
}

export const getSaltSummary = asDbFunction((db, at : number) : SaltSummary => {
    using counts = db.prepare<{ status: SaltStatus, n: number }>("SELECT status, COUNT(*) AS n FROM match_salts GROUP BY status");
    using overdue = db.prepare<{ n: number }>(`--sql
        SELECT COUNT(*) AS n FROM match_salts WHERE status IN ('pending', 'missing', 'fetched') AND salt_check_after <= ?
    `);
    using next = db.prepare<{ at: number | null }>(`--sql
        SELECT MIN(salt_check_after) AS at FROM match_salts WHERE status = 'pending' AND salt_check_after > ?
    `);
    using failures = db.prepare<SaltSummary["failures"][number]>(`--sql
        SELECT match_id, last_error, attempts FROM match_salts WHERE status = 'failed' ORDER BY match_end_time DESC LIMIT 5
    `);

    return {
        counts: Object.fromEntries(counts.all().map(x => [x.status, x.n])),
        overdue: overdue.get(at)?.n ?? 0,
        nextDue: next.get(at)?.at ?? undefined,
        failures: failures.all()
    };
});

const FETCH_LOG_KEY = "salt_fetch_log";
const DAY_S = 24 * 60 * 60;

// Main keeps the original key so its log carries over, extra accounts each get their own
const logKey = (username? : string) => username ? `${FETCH_LOG_KEY}:${username}` : FETCH_LOG_KEY;

// When salt requests went to the game coordinator in the last 24h, kept so the limit holds across restarts
export async function getFetchLog(at : number, username? : string) {
    const raw = await getKv(logKey(username));
    const log = raw ? JSON.parse(raw) as number[] : [];
    return log.filter(x => x > at - DAY_S);
}

export async function recordFetch(at : number, username? : string) {
    await setKv(logKey(username), JSON.stringify([...await getFetchLog(at, username), at]));
}
