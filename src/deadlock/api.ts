import { SemaphoreQueue } from "@tangerie/utils/queue";
// Checked first for everything since it's free, the Steam bot only fills in what it doesn't have yet (it lags behind)
import type { Hero, MatchHistoryEntry, MatchMetadata, PlayerRank, Rank, SteamProfile } from "./types.ts";
import { DEADLOCK_API_KEY as API_KEY } from "../config.ts";

const BASE_URL = "https://api.deadlock-api.com";

const queue = new SemaphoreQueue(5);

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));

async function request<T>(path : string, params : Record<string, string | number | boolean | undefined> = {}) : Promise<T> {
    const url = new URL(path, BASE_URL);
    for(const key in params) {
        if(params[key] != null) url.searchParams.set(key, String(params[key]));
    }

    const headers : HeadersInit = API_KEY ? { "X-API-KEY": API_KEY } : {};

    return await queue.run(async () => {
        let res = await fetch(url, { headers });
        if(res.status == 429) {
            // Some limits are per hour, no point waiting on those
            const wait = await res.json().then(x => x?.error?.next_request_in as number | undefined).catch(() => undefined);
            if(wait != null && wait > 10) throw new Error(`Deadlock API rate limited ${url.pathname} for ${wait}s`);
            console.log(`[API] Rate limited on ${url.pathname}, retrying in 5s`);
            await sleep(5000);
            res = await fetch(url, { headers });
        }
        if(!res.ok) {
            await res.body?.cancel();
            throw new Error(`Deadlock API ${res.status} ${url.pathname}`);
        }
        return await res.json() as T;
    });
}

export const getProfiles = (ids : number[]) => ids.length == 0 ?
    Promise.resolve([] as SteamProfile[]) :
    request<SteamProfile[]>("/v1/players/steam", { account_ids: ids.join(",") });

export const getProfile = (id : number) => getProfiles([id]).then(x => x.at(0));

export const searchPlayers = (query : string, limit = 10) =>
    request<SteamProfile[]>("/v1/players/steam-search", {
        search_query: query,
        limit,
        min_matches_played_last_30d: 0
    }).catch(() => [] as SteamProfile[]);

export const getMatchHistory = (id : number) => request<MatchHistoryEntry[]>(`/v1/players/${id}/match-history`);

export const getRank = (id : number) => request<PlayerRank>(`/v1/players/${id}/rank`);

// Never their Steam fallback (3 requests/hour per IP), the Steam bot covers that
export const getMatch = (id : number) => request<MatchMetadata>(`/v1/matches/${id}/metadata`, { disable_steam: true });

export const getHeroes = () => request<Hero[]>("/v1/assets/heroes", { only_active: true });

export const getRanks = () => request<Rank[]>("/v1/assets/ranks");
