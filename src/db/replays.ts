import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import { REPLAYS_DB_URL } from "../config.ts";

// Long enough for the LAN, short enough that a hung connection doesn't hold up a reply
const TIMEOUT_MS = 3000;

export interface DeadTotals { account_id : number, matches : number, avg_pct : number, dead_s : number }

// Time spent dead per account in standard matches, from the replays app's time_dead view. Only covers matches
// it has ingested, and rejects when it can't be reached
export async function getDeadTotals(accountIds : number[], since : number) : Promise<DeadTotals[]> {
    if(!REPLAYS_DB_URL || accountIds.length == 0) return [];

    const db = new RemoteDatabase(REPLAYS_DB_URL);
    let timer : ReturnType<typeof setTimeout> | undefined;
    try {
        const query = (async () => {
            await db.open();
            return await db.run<DeadTotals>(`--sql
                SELECT account_id, COUNT(*) AS matches, AVG(dead_pct) AS avg_pct, SUM(dead_s) AS dead_s
                FROM time_dead
                WHERE account_id IN (${accountIds.map(() => "?").join(", ")}) AND start_time >= ? AND game_mode != 4
                GROUP BY account_id
            `, ...accountIds, since);
        })();
        // Closing after a timeout fails the query too, nobody is waiting on it by then
        query.catch(() => undefined);
        const timeout = new Promise<never>((_, reject) => timer = setTimeout(() => reject(new Error("Timed out")), TIMEOUT_MS));
        return await Promise.race([query, timeout]);
    } finally {
        clearTimeout(timer);
        db.close();
    }
}
