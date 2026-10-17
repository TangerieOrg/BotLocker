import { asDbFunction } from "./connection.ts";

export type RunOutcome = "open" | "rate_limited" | "cap" | "idle";

export interface FetchRun {
    id: number;
    account: string;
    interval_ms: number;
    started_at: number;
    last_at: number;
    ended_at: number | null;
    requests: number;
    ok: number;
    outcome: RunOutcome;
}

export const getOpenRun = asDbFunction((db, account : string) => {
    using stmt = db.prepare<FetchRun>("SELECT * FROM salt_fetch_runs WHERE account = ? AND outcome = 'open'");
    return stmt.get(account);
});

// Starts a run on whichever spacing has been tried the fewest times (open runs count), the list's order breaks ties
export const startRun = asDbFunction((db, account : string, intervals : number[], at : number) => {
    using stmt = db.prepare<{ interval_ms: number, n: number }>("SELECT interval_ms, COUNT(*) AS n FROM salt_fetch_runs GROUP BY interval_ms");
    const tried = new Map(stmt.all().map(x => [x.interval_ms, x.n]));
    const interval = intervals.reduce((best, x) => (tried.get(x) ?? 0) < (tried.get(best) ?? 0) ? x : best);

    db.exec("INSERT INTO salt_fetch_runs (account, interval_ms, started_at, last_at) VALUES (?, ?, ?, ?)", account, interval, at, at);
    using row = db.prepare<FetchRun>("SELECT * FROM salt_fetch_runs WHERE id = last_insert_rowid()");
    return row.get()!;
});

export const countRunRequest = asDbFunction((db, id : number, at : number, ok : boolean) => {
    db.exec("UPDATE salt_fetch_runs SET requests = requests + 1, ok = ok + ?, last_at = ? WHERE id = ?", ok ? 1 : 0, at, id);
});

export const endRun = asDbFunction((db, id : number, at : number, outcome : Exclude<RunOutcome, "open">) => {
    db.exec("UPDATE salt_fetch_runs SET ended_at = ?, outcome = ? WHERE id = ?", at, outcome, id);
});

export const getRecentRuns = asDbFunction((db, limit : number) => {
    using stmt = db.prepare<FetchRun>("SELECT * FROM salt_fetch_runs WHERE requests > 0 ORDER BY started_at DESC LIMIT ?");
    return stmt.all(limit);
});
