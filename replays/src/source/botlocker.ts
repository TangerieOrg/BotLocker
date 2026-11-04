import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import { BOTLOCKER_DB_URL } from "../config.ts";

export interface SaltSource {
    match_id: number;
    match_end_time: number;
    cluster_id: number;
    metadata_salt: number;
}

export async function withBotDb<R>(func : (db : RemoteDatabase) => Promise<R>, url = BOTLOCKER_DB_URL) {
    const db = new RemoteDatabase(url);
    await db.open();
    try {
        return await func(db);
    } finally {
        db.close();
    }
}

// Every match the bot has a metadata salt for. Only a few thousand rows, so it's pulled whole each time
export const getMetadataSalts = () => withBotDb(db => db.run<SaltSource>(`--sql
    SELECT match_id, match_end_time, cluster_id, metadata_salt FROM match_salts
    WHERE metadata_salt IS NOT NULL AND cluster_id IS NOT NULL
`));
