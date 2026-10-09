import { searchPlayers } from "./api.ts";
import { STEAM_API_KEY } from "../config.ts";

const STEAM64_OFFSET = 76561197960265728n;

export function toAccountId(input : string) : number | undefined {
    const s = input.trim();

    const steam3 = s.match(/^\[?U:1:(\d+)\]?$/i);
    if(steam3) return Number(steam3[1]);

    const profile = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    if(profile) return Number(BigInt(profile[1]) - STEAM64_OFFSET);

    if(/^\d{17}$/.test(s)) return Number(BigInt(s) - STEAM64_OFFSET);
    if(/^\d{1,10}$/.test(s)) return Number(s);

    return undefined;
}

// undefined = couldn't ask Steam, null = Steam says no such vanity URL
async function resolveVanity(vanity : string) : Promise<number | null | undefined> {
    if(!STEAM_API_KEY) return undefined;

    const url = new URL("https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/");
    url.searchParams.set("key", STEAM_API_KEY);
    url.searchParams.set("vanityurl", vanity);

    const res = await fetch(url).catch(() => undefined);
    if(!res?.ok) {
        console.error(`[Steam] ResolveVanityURL failed for "${vanity}" (${res?.status ?? "network error"})`);
        await res?.body?.cancel();
        return undefined;
    }

    const data = await res.json() as Record<"response", { success: number, steamid?: string }>;
    if(data.response.success != 1 || !data.response.steamid) return null;
    return Number(BigInt(data.response.steamid) - STEAM64_OFFSET);
}

export const toSteam64 = (accountId : number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

export async function parseAccount(input : string) : Promise<number | undefined> {
    const id = toAccountId(input);
    if(id != null) return id;

    const vanity = input.match(/steamcommunity\.com\/id\/([^/?#]+)/i)?.[1].toLowerCase();
    if(vanity) {
        const resolved = await resolveVanity(vanity);
        if(resolved !== undefined) return resolved ?? undefined;

        // No Steam key, fall back to search. It's fuzzy on display name so only trust an exact vanity match
        const results = await searchPlayers(vanity, 50);
        return results.find(x => x.profileurl.toLowerCase().replace(/\/$/, "").endsWith(`/id/${vanity}`))?.account_id;
    }

    const name = input.trim().toLowerCase();
    const results = await searchPlayers(name, 50);
    return (results.find(x => x.personaname.toLowerCase() == name) ?? results.at(0))?.account_id;
}

export const DEADLOCK_APP_ID = "1422450";

export interface SteamStatus {
    personaname: string;
    personastate: number;
    gameid?: string;
    gameextrainfo?: string;
}

export const hasSteamKey = () => !!STEAM_API_KEY;

export async function getSteamStatuses(accountIds : number[]) : Promise<Map<number, SteamStatus>> {
    const statuses = new Map<number, SteamStatus>();
    if(!STEAM_API_KEY) return statuses;

    for(let i = 0; i < accountIds.length; i += 100) {
        const url = new URL("https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/");
        url.searchParams.set("key", STEAM_API_KEY);
        url.searchParams.set("steamids", accountIds.slice(i, i + 100).map(toSteam64).join(","));

        const res = await fetch(url).catch(() => undefined);
        if(!res?.ok) {
            console.error(`[Steam] GetPlayerSummaries failed (${res?.status ?? "network error"})`);
            await res?.body?.cancel();
            continue;
        }

        const data = await res.json() as Record<"response", Record<"players", Array<SteamStatus & { steamid: string }>>>;
        for(const p of data.response.players) {
            statuses.set(Number(BigInt(p.steamid) - STEAM64_OFFSET), p);
        }
    }

    return statuses;
}
