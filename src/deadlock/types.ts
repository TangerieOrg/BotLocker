export interface SteamProfile {
    account_id: number;
    personaname: string;
    profileurl: string;
    avatar: string;
    avatarmedium: string;
    avatarfull: string;
    matches_played_last_30d: number;
}

export interface MatchHistoryEntry {
    account_id: number;
    match_id: number;
    hero_id: number;
    hero_level: number;
    start_time: number;
    game_mode: number;
    match_mode: number;
    player_team: number;
    player_kills: number;
    player_deaths: number;
    player_assists: number;
    denies: number;
    net_worth: number;
    last_hits: number;
    match_duration_s: number;
    match_result: number;
    player_match_outcome: number;
    ranked_display_badge: number | null;
    ranked_delta: number | null;
}

export interface HeroStats {
    account_id: number;
    hero_id: number;
    matches_played: number;
    last_played: number;
    time_played: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    networth_per_min: number;
    damage_per_min: number;
    last_hits_per_min: number;
    denies_per_match: number;
    accuracy: number;
    crit_shot_rate: number;
}

export interface PlayerRank {
    badge: number;
    rank: number;
    subrank: number;
    last_match: {
        match_id: number,
        start_time: number
    } | null;
}

export interface MatchPlayer {
    account_id: number;
    player_slot: number;
    team: number;
    hero_id: number;
    kills: number;
    deaths: number;
    assists: number;
    net_worth: number;
    last_hits: number;
    denies: number;
    level: number;
}

export interface MatchMetadata {
    match_info: {
        match_id: number,
        start_time: number,
        duration_s: number,
        winning_team: number,
        game_mode: number,
        match_mode: number,
        average_badge_team0: number | null,
        average_badge_team1: number | null,
        players: MatchPlayer[]
    }
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
