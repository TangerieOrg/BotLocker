import { asDbFunction } from "./connection.ts";

export interface LimitProbe {
    id: number;
    account: string;
    episode_started_at: number;
    fetched_before: number | null;
    attempt: number;
    due_at: number;
    probed_at: number | null;
    result: string | null;
}

export const getPendingProbe = asDbFunction((db, account : string) => {
    using stmt = db.prepare<LimitProbe>("SELECT * FROM salt_limit_probes WHERE account = ? AND probed_at IS NULL");
    return stmt.get(account);
});

export const startEpisode = asDbFunction((db, account : string, at : number, fetchedBefore : number, dueAt : number) => {
    db.exec(
        "INSERT INTO salt_limit_probes (account, episode_started_at, fetched_before, attempt, due_at) VALUES (?, ?, ?, 0, ?)",
        account, at, fetchedBefore, dueAt
    );
});

// Records what the probe got, and schedules the next one at nextDueAt unless fetching works again
export const finishProbe = asDbFunction((db, probe : LimitProbe, at : number, result : string, nextDueAt? : number) => {
    db.exec("UPDATE salt_limit_probes SET probed_at = ?, result = ? WHERE id = ?", at, result, probe.id);
    if(nextDueAt != undefined) {
        db.exec(
            "INSERT INTO salt_limit_probes (account, episode_started_at, fetched_before, attempt, due_at) VALUES (?, ?, ?, ?, ?)",
            probe.account, probe.episode_started_at, probe.fetched_before, probe.attempt + 1, nextDueAt
        );
    }
});

export const getRecentProbes = asDbFunction((db, limit : number) => {
    using stmt = db.prepare<LimitProbe>("SELECT * FROM salt_limit_probes WHERE probed_at IS NOT NULL ORDER BY probed_at DESC LIMIT ?");
    return stmt.all(limit);
});
