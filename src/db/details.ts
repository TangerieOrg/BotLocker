import type { MatchMetadata } from "../deadlock/types.ts";
import { asDbFunction, now, stmt } from "./connection.ts";
import type { MatchSalt } from "./types.ts";

export const getMatchDetails = asDbFunction((db, matchId : number) => {
    const row = stmt(db, "SELECT data FROM match_details WHERE match_id = ?", s => s.get(matchId)) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as MatchMetadata : undefined;
});

export const saveMatchDetails = asDbFunction((db, meta : MatchMetadata) => stmt(db, `--sql
    INSERT INTO match_details (match_id, data, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT (match_id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at
`, s => s.run(meta.match_info.match_id, JSON.stringify(meta), now())));

export const getMatchSalt = asDbFunction((db, matchId : number) => stmt(db, "SELECT * FROM match_salts WHERE match_id = ?", s => s.get(matchId)) as unknown as MatchSalt | undefined);

export const setMatchSalt = asDbFunction((db, matchId : number, cluster : number, salt : number, status : MatchSalt["status"]) => stmt(db, `--sql
    INSERT INTO match_salts (match_id, cluster, salt, status, attempts, updated_at) VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT (match_id) DO UPDATE SET
        cluster = excluded.cluster, salt = excluded.salt, status = excluded.status,
        attempts = attempts + 1, updated_at = excluded.updated_at
`, s => s.run(matchId, cluster, salt, status, now())));
