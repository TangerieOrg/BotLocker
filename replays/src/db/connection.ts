import type { Database } from "@db/sqlite";
import { openDbHandler } from "@tangerie/utils/sqlite";
import { DATA_DIR } from "../config.ts";

Deno.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = `${DATA_DIR}/replays.sqlite3`;

export const openDb = () => openDbHandler({ path: DB_PATH, readonly: false });

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

        -- One row per match with a metadata salt in the bot's match_salts
        CREATE TABLE IF NOT EXISTS ingest (
            match_id INTEGER PRIMARY KEY,
            match_end_time INTEGER NOT NULL,
            cluster_id INTEGER NOT NULL,
            metadata_salt INTEGER NOT NULL,
            -- pending, done or failed
            status TEXT NOT NULL DEFAULT 'pending',
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            ingested_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS ingest_due ON ingest (status, match_end_time);

        CREATE TABLE IF NOT EXISTS matches (
            match_id INTEGER PRIMARY KEY,
            start_time INTEGER NOT NULL,
            duration_s INTEGER NOT NULL,
            winning_team INTEGER NOT NULL,
            game_mode INTEGER NOT NULL,
            match_mode INTEGER NOT NULL,
            meta_version INTEGER NOT NULL
        );

        -- Everyone in the lobby, not just linked players. slot is the metadata's player_slot
        CREATE TABLE IF NOT EXISTS players (
            match_id INTEGER NOT NULL,
            slot INTEGER NOT NULL,
            account_id INTEGER NOT NULL,
            hero_id INTEGER NOT NULL,
            team INTEGER NOT NULL,
            kills INTEGER NOT NULL,
            deaths INTEGER NOT NULL,
            assists INTEGER NOT NULL,
            net_worth INTEGER NOT NULL,
            level INTEGER NOT NULL,
            PRIMARY KEY (match_id, slot)
        );

        CREATE INDEX IF NOT EXISTS players_account ON players (account_id, match_id);

        -- t is game seconds, positions are world units
        CREATE TABLE IF NOT EXISTS deaths (
            match_id INTEGER NOT NULL,
            slot INTEGER NOT NULL,
            t INTEGER NOT NULL,
            duration_s INTEGER NOT NULL,
            time_to_kill_s REAL NOT NULL,
            killer_slot INTEGER NOT NULL,
            x REAL, y REAL, z REAL,
            killer_x REAL, killer_y REAL, killer_z REAL
        );

        CREATE INDEX IF NOT EXISTS deaths_match ON deaths (match_id, slot);

        -- One sample a second per player. health is a percentage and 0 while dead
        CREATE TABLE IF NOT EXISTS positions (
            match_id INTEGER NOT NULL,
            slot INTEGER NOT NULL,
            t INTEGER NOT NULL,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            health INTEGER NOT NULL,
            combat_type INTEGER NOT NULL,
            move_type INTEGER NOT NULL,
            PRIMARY KEY (match_id, slot, t)
        ) WITHOUT ROWID;

        -- A death right before the end counts only up to the end
        CREATE VIEW IF NOT EXISTS time_dead AS
        SELECT p.match_id, p.slot, p.account_id, p.hero_id, p.team, m.start_time, m.duration_s, m.game_mode, m.match_mode,
            p.team = m.winning_team AS won,
            COUNT(d.t) AS deaths,
            COALESCE(SUM(MIN(d.duration_s, MAX(m.duration_s - d.t, 0))), 0) AS dead_s,
            ROUND(100.0 * COALESCE(SUM(MIN(d.duration_s, MAX(m.duration_s - d.t, 0))), 0) / MAX(m.duration_s, 1), 1) AS dead_pct,
            COALESCE(MAX(d.duration_s), 0) AS longest_s
        FROM players p
        JOIN matches m ON m.match_id = p.match_id
        LEFT JOIN deaths d ON d.match_id = p.match_id AND d.slot = p.slot
        GROUP BY p.match_id, p.slot;

        CREATE VIEW IF NOT EXISTS death_spots AS
        SELECT d.*, p.account_id, p.hero_id, p.team, m.start_time, m.game_mode, m.match_mode,
            k.account_id AS killer_account_id, k.hero_id AS killer_hero_id
        FROM deaths d
        JOIN players p ON p.match_id = d.match_id AND p.slot = d.slot
        JOIN matches m ON m.match_id = d.match_id
        LEFT JOIN players k ON k.match_id = d.match_id AND k.slot = d.killer_slot;
    `);
});
