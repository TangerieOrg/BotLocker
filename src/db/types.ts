export interface Link {
    user_id: string;
    account_id: number;
    linked_at: number;
}

export interface Guild {
    guild_id: string;
    channel_id: string | null;
    period_start: number;
}

export interface Match {
    account_id: number;
    match_id: number;
    hero_id: number;
    start_time: number;
    won: number;
    kills: number;
    deaths: number;
    assists: number;
    net_worth: number;
    last_hits: number;
    duration_s: number;
    game_mode: number;
    match_mode: number;
    badge: number | null;
    ranked_delta: number | null;
}

export interface Totals {
    account_id: number;
    matches: number;
    wins: number;
    losses: number;
    kills: number;
    deaths: number;
    assists: number;
}

export interface MatchSalt {
    match_id: number;
    cluster: number;
    salt: number;
    status: "ok" | "failed";
    attempts: number;
    updated_at: number;
}

export interface HeroTotals {
    matches: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    net_worth: number;
    time_played: number;
    last_played: number | null;
}
