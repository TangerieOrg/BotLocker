import type { MatchHistoryEntry } from "./types.ts";

const API_URL = "https://api.deadlock-api.com/v1/players";
const TIMEOUT_MS = 60000;

// deadlock-api keeps every match it ever ingested, so it reaches back past what the GC still returns.
// Only used once per backfill, live tracking stays on the Steam bot
export async function getStoredHistory(accountId : number) : Promise<MatchHistoryEntry[]> {
    const res = await fetch(`${API_URL}/${accountId}/match-history`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if(!res.ok) throw new Error(`deadlock-api match history ${res.status}`);

    const rows = await res.json() as MatchHistoryEntry[];
    return rows.map(x => ({
        account_id: accountId,
        match_id: x.match_id,
        hero_id: x.hero_id,
        start_time: x.start_time,
        game_mode: x.game_mode,
        match_mode: x.match_mode,
        player_team: x.player_team,
        player_kills: x.player_kills,
        player_deaths: x.player_deaths,
        player_assists: x.player_assists,
        net_worth: x.net_worth,
        last_hits: x.last_hits,
        match_duration_s: x.match_duration_s,
        match_result: x.match_result,
        ranked_display_badge: x.ranked_display_badge || null,
        ranked_delta: x.ranked_delta ?? null
    }));
}
