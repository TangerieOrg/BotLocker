import { LinkStore } from "../links/LinkStore.ts";
import { DEADLOCK_APP_ID, gameName, isMatchDisplay, partyOf, SteamStore } from "./SteamStore.ts";

// Worked out from rich presence each time it's needed, hero and mode are still the raw tokens (#Steam_RP_hero_chessmaster)
export type Activity =
    | { kind: "match", hero?: string, mode?: string, minutes?: number, party?: string }
    | { kind: "queue", party?: string }
    // Menus, party lobby, hideout
    | { kind: "deadlock", party?: string }
    | { kind: "game", game?: string }
    | { kind: "online" };

export type Tier = Activity["kind"];

// Who the bot status goes for first
export const TIERS : Tier[] = ["match", "queue", "deadlock", "game", "online"];

const QUEUE_DISPLAY = "#steam_citadel_rp_findingmatch";

// Undefined when they're offline (or not a friend of the bot, it can't see them)
export function activityOf(id : number) : Activity | undefined {
    const status = SteamStore.get().online.get(id);
    if(!status) return undefined;

    if(status.appId != DEADLOCK_APP_ID) {
        const game = gameName(status);
        return status.appId || game ? { kind: "game", game } : { kind: "online" };
    }

    const party = partyOf(id);
    const rich = status.rich ?? {};

    // Hero select is already InGame but has no hero or minutes yet
    if(isMatchDisplay(status.display)) {
        const minutes = Number(rich.param0);
        return {
            kind: "match",
            hero: rich.param2,
            mode: rich.param1,
            minutes: rich.param0 != undefined && Number.isFinite(minutes) ? minutes : undefined,
            party
        };
    }
    if(status.display?.toLowerCase() == QUEUE_DISPLAY) return { kind: "queue", party };
    return { kind: "deadlock", party };
}

export interface Player {
    userId: string;
    accountId: number;
    activity: Activity;
}

// Linked players the Steam bot can see online
export const onlinePlayers = () : Player[] => [...LinkStore.get().links]
    .map(([userId, accountId]) => ({ userId, accountId, activity: activityOf(accountId) }))
    .filter(x => x.activity) as Player[];

// #Steam_Citadel_RP_StreetBrawl → Street Brawl, #Steam_Citadel_RP_MM_Unranked → Unranked (MM is matchmaking).
// Close enough for modes nobody's seen yet
export const modeLabel = (token? : string) => !token ? undefined : token
    .replace(/^#?steam_citadel_rp_/i, "")
    .replace(/^mm_/i, "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z]{2,})(\d)/g, "$1 $2");

// Same party id together, anyone without one on their own. Keeps the order players came in
export function groupByParty<T>(items : T[], party : (item : T) => string | undefined) {
    const groups = new Map<string, T[]>();
    const out : T[][] = [];
    for(const item of items) {
        const id = party(item);
        if(!id) {
            out.push([item]);
            continue;
        }
        const group = groups.get(id);
        if(group) group.push(item);
        else {
            const fresh = [item];
            groups.set(id, fresh);
            out.push(fresh);
        }
    }
    return out;
}
