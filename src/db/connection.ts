import { Database, type Statement } from "@db/sqlite";
import { openDbHandler } from "@tangerie/utils/sqlite";
import { DATA_DIR } from "../config.ts";

Deno.mkdirSync(DATA_DIR, { recursive: true });

export const openDb = () => openDbHandler({ path: `${DATA_DIR}/botlocker.sqlite3`, readonly: false });

export async function withDb(func : (db : Database) => unknown | Promise<unknown>) {
    const db = await openDb();
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
            const r = await func(db, ...params);
            return r;
        } finally {
            db.close();
        }
    }
}

await withDb(db => db.exec(`--sql
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = normal;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS links (
        user_id TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL UNIQUE,
        linked_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS guilds (
        guild_id TEXT PRIMARY KEY,
        channel_id TEXT,
        period_start INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
        account_id INTEGER NOT NULL,
        match_id INTEGER NOT NULL,
        hero_id INTEGER NOT NULL,
        start_time INTEGER NOT NULL,
        won INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        deaths INTEGER NOT NULL,
        assists INTEGER NOT NULL,
        net_worth INTEGER NOT NULL,
        last_hits INTEGER NOT NULL,
        duration_s INTEGER NOT NULL,
        game_mode INTEGER NOT NULL,
        match_mode INTEGER NOT NULL,
        badge INTEGER,
        ranked_delta INTEGER,
        PRIMARY KEY (account_id, match_id)
    );

    CREATE INDEX IF NOT EXISTS matches_account_time ON matches (account_id, start_time);
`));

// Finalize every statement as soon as it's used, the handle is shared and only really closes with the last user
export function stmt<R>(db : Database, sql : string, func : (s : Statement) => R) : R {
    const s = db.prepare(sql);
    try {
        return func(s);
    } finally {
        s.finalize();
    }
}

export const now = () => Math.floor(Date.now() / 1000);
