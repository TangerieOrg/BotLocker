import type { Database } from "@db/sqlite";
import type { MatchHistoryEntry, MatchMetadata } from "../deadlock/types.ts";
import { asDbFunction, stmt } from "./connection.ts";
import type { HeroTotals, Match, Totals } from "./types.ts";

// Unranked + Ranked only, skips bots, private lobbies, tutorials etc
export const TRACKED_MATCH_MODES = [1, 4];

export const getMatchIds = asDbFunction((db, accountId : number) => new Set(
    (stmt(db, "SELECT match_id FROM matches WHERE account_id = ?", s => s.all(accountId)) as { match_id: number }[]).map(x => x.match_id)
));

const INSERT_MATCH = `--sql
    INSERT INTO matches (account_id, match_id, hero_id, start_time, won, kills, deaths, assists,
        net_worth, last_hits, duration_s, game_mode, match_mode, badge, ranked_delta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (account_id, match_id) DO NOTHING
`;

function transaction<R>(db : Database, func : () => R) : R {
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

// Returns only the entries that weren't stored yet, existing rows just get the rank info (the Valve path doesn't have it)
export const insertMatches = asDbFunction((db, entries : MatchHistoryEntry[]) => stmt(db, INSERT_MATCH, insert => stmt(db, `--sql
    UPDATE matches SET won = ?, badge = ?, ranked_delta = ? WHERE account_id = ? AND match_id = ?
`, update => transaction(db, () => entries.filter(x => {
    if(!TRACKED_MATCH_MODES.includes(x.match_mode)) return false;
    const won = x.match_result == x.player_team ? 1 : 0;
    const added = insert.run(
        x.account_id, x.match_id, x.hero_id, x.start_time, won,
        x.player_kills, x.player_deaths, x.player_assists, x.net_worth, x.last_hits,
        x.match_duration_s, x.game_mode, x.match_mode, x.ranked_display_badge, x.ranked_delta
    ) > 0;
    if(!added) update.run(won, x.ranked_display_badge, x.ranked_delta, x.account_id, x.match_id);
    return added;
})))));

// Rows straight from the match metadata, returns the ones that weren't stored yet
export const insertMetaMatches = asDbFunction((db, meta : MatchMetadata, accountIds : number[]) => stmt(db, INSERT_MATCH, insert => {
    const x = meta.match_info;
    if(!TRACKED_MATCH_MODES.includes(x.match_mode)) return [];

    return transaction(db, () => x.players.filter(p => accountIds.includes(p.account_id)).filter(p => insert.run(
        p.account_id, x.match_id, p.hero_id, x.start_time, p.team == x.winning_team ? 1 : 0,
        p.kills, p.deaths, p.assists, p.net_worth, p.last_hits,
        x.duration_s, x.game_mode, x.match_mode, null, null
    ) > 0).map(x => x.account_id));
}));

export const getRecentMatches = asDbFunction((db, accountId : number, limit : number = 10, streetBrawl? : boolean) => stmt(db, "SELECT * FROM matches WHERE account_id = ? AND (? IS NULL OR (game_mode = 4) = ?) ORDER BY match_id DESC LIMIT ?", s => s.all(accountId, streetBrawl == null ? null : Number(streetBrawl), streetBrawl == null ? null : Number(streetBrawl), limit)) as unknown as Match[]);

export const getStoredMatch = asDbFunction((db, accountId : number, matchId : number) => stmt(db, "SELECT * FROM matches WHERE account_id = ? AND match_id = ?", s => s.get(accountId, matchId)) as unknown as Match | undefined);

export const getLatestLinkedMatch = asDbFunction(db => stmt(db, `--sql
    SELECT m.*, l.user_id FROM matches m
    JOIN links l ON l.account_id = m.account_id
    ORDER BY m.start_time + m.duration_s DESC LIMIT 1
`, s => s.get()) as unknown as (Match & { user_id: string }) | undefined);

export const getLinkedMatchRows = asDbFunction((db, matchId : number) => stmt(db, `--sql
    SELECT m.*, l.user_id FROM matches m
    JOIN links l ON l.account_id = m.account_id
    WHERE m.match_id = ?
`, s => s.all(matchId)) as unknown as Array<Match & { user_id: string }>);

export const getMatchesSince = asDbFunction((db, accountId : number, since : number) => stmt(db, "SELECT * FROM matches WHERE account_id = ? AND start_time >= ? ORDER BY match_id DESC", s => s.all(accountId, since)) as unknown as Match[]);

export const getTotals = asDbFunction((db, accountId : number, since : number, streetBrawl : boolean) => stmt(db, `--sql
    SELECT account_id, COUNT(*) AS matches, SUM(won) AS wins, COUNT(*) - SUM(won) AS losses,
        SUM(kills) AS kills, SUM(deaths) AS deaths, SUM(assists) AS assists
    FROM matches WHERE account_id = ? AND start_time >= ? AND (game_mode = 4) = ?
`, s => s.get(accountId, since, Number(streetBrawl))) as unknown as Totals);

export const getPeriodTotals = asDbFunction((db, since : number, streetBrawl : boolean) => stmt(db, `--sql
    SELECT m.account_id, COUNT(*) AS matches, SUM(m.won) AS wins, COUNT(*) - SUM(m.won) AS losses,
        SUM(m.kills) AS kills, SUM(m.deaths) AS deaths, SUM(m.assists) AS assists
    FROM matches m
    JOIN links l ON l.account_id = m.account_id
    WHERE m.start_time >= ? AND (m.game_mode = 4) = ?
    GROUP BY m.account_id
`, s => s.all(since, streetBrawl ? 1 : 0)) as unknown as Totals[]);

// Streak counted back from the given match (inclusive). Positive = wins, negative = losses
export const getStreak = asDbFunction((db, accountId : number, beforeMatchId : number = Number.MAX_SAFE_INTEGER, streetBrawl? : boolean) => {
    const mode = streetBrawl == null ? null : Number(streetBrawl);
    const rows = stmt(db, "SELECT won FROM matches WHERE account_id = ? AND match_id <= ? AND (? IS NULL OR (game_mode = 4) = ?) ORDER BY match_id DESC LIMIT 50", s => s.all(accountId, beforeMatchId, mode, mode)) as { won: number }[];

    if(rows.length == 0) return 0;
    const first = rows[0].won;
    let n = 0;
    for(const x of rows) {
        if(x.won != first) break;
        n++;
    }
    return first ? n : -n;
});

export const getHeroTotals = asDbFunction((db, accountId : number, heroId : number, since : number, streetBrawl : boolean) => stmt(db, `--sql
    SELECT COUNT(*) AS matches, COALESCE(SUM(won), 0) AS wins,
        COALESCE(SUM(kills), 0) AS kills, COALESCE(SUM(deaths), 0) AS deaths, COALESCE(SUM(assists), 0) AS assists,
        COALESCE(SUM(net_worth), 0) AS net_worth, COALESCE(SUM(duration_s), 0) AS time_played, MAX(start_time) AS last_played
    FROM matches WHERE account_id = ? AND hero_id = ? AND start_time >= ? AND (game_mode = 4) = ?
`, s => s.get(accountId, heroId, since, Number(streetBrawl))) as unknown as HeroTotals);

// Badge going into their latest ranked match, the closest thing to a current rank Valve gives out for other players
export const getLatestBadge = asDbFunction((db, accountId : number) =>
    (stmt(db, "SELECT badge FROM matches WHERE account_id = ? AND match_mode = 4 AND badge IS NOT NULL ORDER BY match_id DESC LIMIT 1", s => s.get(accountId)) as { badge: number } | undefined)?.badge);
