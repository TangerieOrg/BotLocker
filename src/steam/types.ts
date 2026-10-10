// @types/steam-user leaves personas as any, this is just the part we use
export interface SteamPersona {
    player_name: string;
    avatar_url_full?: string;
    persona_state?: number | null;
    game_played_app_id?: number | null;
    gameid?: string | number | null;
    game_name?: string | null;
    rich_presence?: { key: string, value: string }[];
}
