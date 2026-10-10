// Newest first from the game coordinator, same shape deadlock-api's match-history endpoint used
export interface MatchHistoryEntry {
    account_id: number;
    match_id: number;
    hero_id: number;
    start_time: number;
    game_mode: number;
    match_mode: number;
    player_team: number;
    player_kills: number;
    player_deaths: number;
    player_assists: number;
    net_worth: number;
    last_hits: number;
    match_duration_s: number;
    match_result: number;
    ranked_display_badge: number | null;
    ranked_delta: number | null;
}

export interface Hero {
    id: number;
    name: string;
    images: Record<"icon_image_small" | "icon_hero_card", string>;
}

export interface Rank {
    tier: number;
    name: string;
    color: string;
    images: Record<string, string>;
}
