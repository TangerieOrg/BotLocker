import type { Database } from "@db/sqlite";
import { openDbHandler } from "@tangerie/utils/sqlite";
import { DATA_DIR } from "../config.ts";

Deno.mkdirSync(DATA_DIR, { recursive: true });

export const openDb = () => openDbHandler({ path: `${DATA_DIR}/botlocker.sqlite3`, readonly: false });

export async function withDb(func : (db : Database) => unknown | Promise<unknown>) {
    const db = openDb();
    try {
        await func(db);
    } finally {
        db.close();
    }
}

export function asDbFunction<P extends unknown[], R>(func : (db : Database, ...params : P) => R) {
    return async (...params : P) : Promise<Awaited<R>> => {
        const db = openDb();
        try {
            return await func(db, ...params);
        } finally {
            db.close();
        }
    }
}

export function transaction<R>(db : Database, func : () => R) : R {
    db.exec("BEGIN");
    try {
        const r = func();
        db.exec("COMMIT");
        return r;
    } catch(err) {
        db.exec("ROLLBACK");
        throw err;
    }
}

await withDb(db => {
    db.exec(`--sql
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = normal;

        CREATE TABLE IF NOT EXISTS links (
            user_id TEXT PRIMARY KEY,
            account_id INTEGER NOT NULL UNIQUE,
            linked_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS matches (
            account_id INTEGER NOT NULL,
            match_id INTEGER NOT NULL,
            hero_id INTEGER NOT NULL,
            start_time INTEGER NOT NULL,
            duration_s INTEGER NOT NULL,
            won INTEGER NOT NULL,
            kills INTEGER NOT NULL,
            deaths INTEGER NOT NULL,
            assists INTEGER NOT NULL,
            net_worth INTEGER NOT NULL,
            last_hits INTEGER NOT NULL,
            game_mode INTEGER NOT NULL,
            match_mode INTEGER NOT NULL,
            badge INTEGER,
            ranked_delta INTEGER,
            -- Backfilled history is stored already announced so it never gets posted
            announced_at INTEGER,
            PRIMARY KEY (account_id, match_id)
        );

        CREATE INDEX IF NOT EXISTS matches_account_time ON matches (account_id, start_time);
        CREATE INDEX IF NOT EXISTS matches_unannounced ON matches (match_id) WHERE announced_at IS NULL;

        CREATE TABLE IF NOT EXISTS kv (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
});
