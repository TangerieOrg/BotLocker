import type { MatchHistoryEntry } from "../deadlock/types.ts";
import { SALT_DELAY_S } from "../config.ts";
import { now } from "../helpers/now.ts";
import { asDbFunction, transaction } from "./connection.ts";
import type { LossTotals, Match, Totals } from "./types.ts";

// Unranked + Ranked only, skips bots, private lobbies, tutorials etc
export const TRACKED_MATCH_MODES = [1, 4];

export const hasMatches = asDbFunction((db, accountId : number) => {
    using stmt = db.prepare("SELECT 1 FROM matches WHERE account_id = ? LIMIT 1");
    return stmt.value(accountId) != null;
});

// All-zero stats mean the match ended before anything happened (e.g. a player left during pick),
// not a real loss, so it shouldn't count against anyone
const isEarlyEnded = (x : MatchHistoryEntry) =>
    x.player_kills == 0 && x.player_deaths == 0 && x.player_assists == 0 && x.net_worth == 0 && x.last_hits == 0;

// Returns how many weren't stored yet. Backfilled history goes in already announced
export const insertMatches = asDbFunction((db, entries : MatchHistoryEntry[], announced : boolean) => {
    using insert = db.prepare(`--sql
        INSERT INTO matches (account_id, match_id, hero_id, start_time, duration_s, won, kills, deaths, assists,
            net_worth, last_hits, game_mode, match_mode, badge, ranked_delta, announced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (account_id, match_id) DO NOTHING
    `);
    using insertSalt = db.prepare(`--sql
        INSERT INTO match_salts (match_id, match_end_time, salt_check_after) VALUES (?, ?, ?)
        ON CONFLICT (match_id) DO NOTHING
    `);
    const announcedAt = announced ? now() : null;

    return transaction(db, () => entries
        .filter(x => TRACKED_MATCH_MODES.includes(x.match_mode))
        .filter(x => !isEarlyEnded(x))
        .filter(x => {
            const end = x.start_time + x.match_duration_s;
            insertSalt.run(x.match_id, end, end + SALT_DELAY_S);
            return true;
        })
        .filter(x => insert.run(
            x.account_id, x.match_id, x.hero_id, x.start_time, x.match_duration_s, x.match_result == x.player_team ? 1 : 0,
            x.player_kills, x.player_deaths, x.player_assists, x.net_worth, x.last_hits,
            x.game_mode, x.match_mode, x.ranked_display_badge, x.ranked_delta, announcedAt
        ) > 0)
        .length);
});

// Every tracked player stored for the match, announced or not
export const getMatchPlayers = asDbFunction((db, matchId : number) => {
    using stmt = db.prepare<{ account_id: number }>("SELECT account_id FROM matches WHERE match_id = ?");
    return stmt.all(matchId).map(x => x.account_id);
});

// Oldest first so streaks read in order when several land at once
export const getUnannounced = asDbFunction(db => {
    using stmt = db.prepare<Match>("SELECT * FROM matches WHERE announced_at IS NULL ORDER BY match_id");
    return stmt.all();
});

export const markAnnounced = asDbFunction((db, accountId : number, matchId : number) => {
    db.exec("UPDATE matches SET announced_at = ? WHERE account_id = ? AND match_id = ?", now(), accountId, matchId);
});

export const getPeriodTotals = asDbFunction((db, since : number, streetBrawl : boolean) => {
    using stmt = db.prepare<Totals>(`--sql
        SELECT account_id, COUNT(*) AS matches, SUM(won) AS wins, COUNT(*) - SUM(won) AS losses
        FROM matches
        WHERE start_time >= ? AND (game_mode = 4) = ?
        GROUP BY account_id
    `);
    return stmt.all(since, Number(streetBrawl));
});

// Every lost game since the given time, Street Brawl included since it's still time spent losing
export const getLossTotals = asDbFunction((db, accountId : number, since : number) => {
    using stmt = db.prepare<LossTotals>(`--sql
        SELECT COUNT(*) AS losses, COALESCE(SUM(duration_s), 0) AS time_lost
        FROM matches WHERE account_id = ? AND start_time >= ? AND won = 0
    `);
    return stmt.get(accountId, since) as LossTotals;
});

// Streak counted back from the given match (inclusive). Positive = wins, negative = losses
export const getStreak = asDbFunction((db, accountId : number, beforeMatchId : number = Number.MAX_SAFE_INTEGER) => {
    using stmt = db.prepare<{ won: number }>("SELECT won FROM matches WHERE account_id = ? AND match_id <= ? ORDER BY match_id DESC LIMIT 50");
    const rows = stmt.all(accountId, beforeMatchId);

    if(rows.length == 0) return 0;
    const first = rows[0].won;
    let n = 0;
    for(const x of rows) {
        if(x.won != first) break;
        n++;
    }
    return first ? n : -n;
});

export const getLastMatch = asDbFunction((db, accountId : number) => {
    using stmt = db.prepare<Match>("SELECT * FROM matches WHERE account_id = ? ORDER BY match_id DESC LIMIT 1");
    return stmt.get(accountId);
});

// Whichever of these accounts finished a game most recently
export const getLatestMatch = asDbFunction((db, accountIds : number[]) => {
    if(accountIds.length == 0) return undefined;
    using stmt = db.prepare<Match>(`--sql
        SELECT * FROM matches WHERE account_id IN (${accountIds.map(() => "?").join(", ")})
        ORDER BY start_time + duration_s DESC LIMIT 1
    `);
    return stmt.get(...accountIds);
});

// Every stored player in a match, more than one when people queued together
export const getMatchRows = asDbFunction((db, matchId : number) => {
    using stmt = db.prepare<Match>("SELECT * FROM matches WHERE match_id = ?");
    return stmt.all(matchId);
});

// One player's games in a mode since the given time, newest first. Optionally just one hero
export const getPlayerMatches = asDbFunction((db, accountId : number, since : number, streetBrawl : boolean, heroId? : number) => {
    using stmt = db.prepare<Match>(`--sql
        SELECT * FROM matches
        WHERE account_id = ? AND start_time >= ? AND (game_mode = 4) = ? AND (? IS NULL OR hero_id = ?)
        ORDER BY match_id DESC
    `);
    return stmt.all(accountId, since, Number(streetBrawl), heroId ?? null, heroId ?? null);
});

// Every linked teammate a player has shared a team with, with games and wins together
export const getPartnerStats = asDbFunction((db, accountId : number, since : number, streetBrawl : boolean, heroId? : number) => {
    using stmt = db.prepare<{ account_id : number, games : number, wins : number }>(`--sql
        SELECT b.account_id AS account_id, COUNT(*) AS games, SUM(a.won) AS wins FROM matches a
        JOIN matches b ON b.match_id = a.match_id AND b.won = a.won AND b.account_id != a.account_id
        WHERE a.account_id = ? AND a.start_time >= ? AND (a.game_mode = 4) = ? AND (? IS NULL OR a.hero_id = ?)
        GROUP BY b.account_id
    `);
    return stmt.all(accountId, since, Number(streetBrawl), heroId ?? null, heroId ?? null);
});

// Games all the given accounts shared a team in (same match, same result), newest first. Each game is one row per
// account in the order given
export const getTeamMatches = asDbFunction((db, accountIds : number[], since : number, streetBrawl : boolean) => {
    const marks = accountIds.map(() => "?").join(", ");
    using stmt = db.prepare<Match>(`--sql
        SELECT * FROM matches
        WHERE account_id IN (${marks}) AND start_time >= ? AND (game_mode = 4) = ? AND match_id IN (
            SELECT match_id FROM matches WHERE account_id IN (${marks})
            GROUP BY match_id, won HAVING COUNT(*) = ?
        )
        ORDER BY match_id DESC
    `);
    const rows = stmt.all(...accountIds, since, Number(streetBrawl), ...accountIds, accountIds.length);
    const byMatch = Map.groupBy(rows, x => x.match_id);
    return [...byMatch.values()].map(game => accountIds.map(id => game.find(x => x.account_id == id)!));
});
