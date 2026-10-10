export interface Link {
    user_id: string;
    account_id: number;
    linked_at: number;
}

export interface Match {
    account_id: number;
    match_id: number;
    hero_id: number;
    start_time: number;
    duration_s: number;
    won: number;
    kills: number;
    deaths: number;
    assists: number;
    net_worth: number;
    last_hits: number;
    game_mode: number;
    match_mode: number;
    badge: number | null;
    ranked_delta: number | null;
    announced_at: number | null;
}

export interface Totals {
    account_id: number;
    matches: number;
    wins: number;
    losses: number;
}

export interface LossTotals {
    losses: number;
    time_lost: number;
}
