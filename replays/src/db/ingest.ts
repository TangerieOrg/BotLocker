import type { Meta, Position } from "../meta/proto.ts";
import type { SaltSource } from "../source/botlocker.ts";
import { now } from "../helpers/now.ts";
import { asDbFunction, transaction } from "./connection.ts";

// Math.round can give -0, which @db/sqlite won't bind as an integer
const int = (v : number) => Math.round(v) || 0;
const pos = (p? : Position) => p ? [p.x || 0, p.y || 0, p.z || 0] : [null, null, null];

export type IngestStatus = "pending" | "done" | "failed";

export interface IngestRow extends SaltSource {
    status: IngestStatus;
    attempts: number;
    next_attempt_at: number;
    last_error: string | null;
    ingested_at: number | null;
}

// Returns how many matches were new
export const seedIngest = asDbFunction((db, rows : SaltSource[]) => transaction(db, () => {
    using stmt = db.prepare(`--sql
        INSERT OR IGNORE INTO ingest (match_id, match_end_time, cluster_id, metadata_salt) VALUES (?, ?, ?, ?)
    `);
    let added = 0;
    for(const x of rows) added += stmt.run(x.match_id, x.match_end_time, x.cluster_id, x.metadata_salt);
    return added;
}));

// Newest first so fresh matches show up quickly, metadata never expires so the backlog can wait
export const getDueIngest = asDbFunction((db, limit : number, at : number) => {
    using stmt = db.prepare<IngestRow>(`--sql
        SELECT * FROM ingest WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY match_end_time DESC LIMIT ?
    `);
    return stmt.all(at, limit);
});

export const retryIngest = asDbFunction((db, matchId : number, nextAt : number, error : string, maxAttempts : number) => {
    db.exec(`--sql
        UPDATE ingest SET attempts = attempts + 1, last_error = ?, next_attempt_at = ?,
            status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE status END
        WHERE match_id = ?
    `, error, nextAt, maxAttempts, matchId);
});

export const countIngest = asDbFunction(db => {
    using stmt = db.prepare<{ status : IngestStatus, n : number }>("SELECT status, COUNT(*) AS n FROM ingest GROUP BY status");
    return Object.fromEntries(stmt.all().map(x => [x.status, x.n])) as Partial<Record<IngestStatus, number>>;
});

// Replaces whatever was stored for the match, so re-running one is safe
export const saveMeta = asDbFunction((db, matchId : number, { version, info } : Meta) => transaction(db, () => {
    for(const table of ["matches", "players", "deaths", "positions"]) db.exec(`DELETE FROM ${table} WHERE match_id = ?`, matchId);

    db.exec(`--sql
        INSERT INTO matches (match_id, start_time, duration_s, winning_team, game_mode, match_mode, meta_version) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, matchId, info.start_time, info.duration_s, info.winning_team, info.game_mode, info.match_mode, version);

    using player = db.prepare(`--sql
        INSERT INTO players (match_id, slot, account_id, hero_id, team, kills, deaths, assists, net_worth, level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    using death = db.prepare(`--sql
        INSERT INTO deaths (match_id, slot, t, duration_s, time_to_kill_s, killer_slot, x, y, z, killer_x, killer_y, killer_z)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for(const p of info.players) {
        player.run(matchId, p.player_slot, p.account_id, p.hero_id, p.team, p.kills, p.deaths, p.assists, p.net_worth, p.level);
        for(const d of p.death_details) {
            death.run(matchId, p.player_slot, d.game_time_s, d.death_duration_s, d.time_to_kill_s || 0, d.killer_player_slot,
                ...pos(d.death_pos), ...pos(d.killer_pos));
        }
    }

    // Paths are quantized to x_resolution steps across each player's own bounding box
    const paths = info.match_paths;
    if(paths) {
        using position = db.prepare(`--sql
            INSERT INTO positions (match_id, slot, t, x, y, health, combat_type, move_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for(const p of paths.paths) {
            const sx = (p.x_max - p.x_min) / paths.x_resolution;
            const sy = (p.y_max - p.y_min) / paths.y_resolution;
            for(let i = 0; i < p.x_pos.length; i++) {
                position.run(matchId, p.player_slot, int(i * paths.interval_s),
                    int(p.x_min + p.x_pos[i] * sx), int(p.y_min + p.y_pos[i] * sy),
                    p.health[i] ?? 0, p.combat_type[i] ?? 0, p.move_type[i] ?? 0);
            }
        }
    }

    db.exec(`--sql
        UPDATE ingest SET status = 'done', last_error = NULL, ingested_at = ? WHERE match_id = ?
    `, now(), matchId);
}));
