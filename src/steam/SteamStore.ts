// @ts-types="@types/steam-user"
import SteamUser from "steam-user";
import { createStore } from "@tangerie/global-store/store";
import { toSteam64 } from "../helpers/steam.ts";

export const Relationship = SteamUser.EFriendRelationship;
export const DEADLOCK_APP_ID = 1422450;
// Deadlock's steam_display tokens while they're in a round start with this (#Steam_Citadel_InGame_Hero),
// anything else is outside a match (#Steam_Citadel_Hideout_Chess etc)
const IN_MATCH_PREFIX = "#steam_citadel_ingame";

export const isMatchDisplay = (display? : string) => !!display?.toLowerCase().startsWith(IN_MATCH_PREFIX);

// guard is set when the login is waiting on a Steam Guard code from /steamguard, a new object every time it asks
export type Login =
    | { state: "loggedOut" }
    // token is whether it's trying the saved login token rather than the password
    | { state: "loggingIn", token: boolean }
    | { state: "loggedOn" }
    | { state: "guard", where: string, lastCodeWrong: boolean, submit: (code : string) => void }
    // Bad password, nothing to do until restart
    | { state: "failed" };

export interface Persona {
    name: string;
    avatar?: string;
}

export interface OnlineStatus {
    // 0 when they're not in anything
    appId: number;
    // Only set for non-Steam games, Steam ones are looked up into games
    game?: string;
    // Rich presence steam_display token, Deadlock uses it to say what they're doing
    display?: string;
    // Every rich presence key they have set (hero, mode, party etc), display is just steam_display from this
    rich?: Readonly<Record<string, string>>;
}

export const sameRich = (a? : Readonly<Record<string, string>>, b? : Readonly<Record<string, string>>) => {
    const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
    return [...keys].every(k => a?.[k] === b?.[k]);
};

// Closing the game mid-round still counts as finishing it, the status just goes from in-game to nothing
export const isInMatchStatus = (status? : OnlineStatus) => status?.appId == DEADLOCK_APP_ID && isMatchDisplay(status.display);

// param0 is minutes since the match started, not set during hero select
const matchMinutes = (status? : OnlineStatus) => {
    const n = Number(status?.rich?.param0);
    return status?.rich?.param0 != undefined && Number.isFinite(n) ? n : undefined;
};


interface SteamState {
    login: Login;
    // The bot's own account, for pointing people at its profile
    self?: number;
    // Connected to the Deadlock game coordinator, match history only works while this is set
    gcReady: boolean;
    // Limited accounts (nothing spent on them) can accept friend requests but not send them
    limited: boolean;
    // Everyone on the bot's friends list, including pending requests either way
    relations: Map<number, SteamUser.EFriendRelationship>;
    // Steam has sent the friends list, relations means nothing before that
    relationsLoaded: boolean;
    // Friends that are online, and what they're playing
    online: Map<number, OnlineStatus>;
    // Accounts currently in a Deadlock round → minutes into it (last known, -1 before it's shown). They leave when it ends or they close the game
    inMatch: Map<number, number>;
    // Bumped every time someone's round ends, including going straight into another one, the tracker checks their history on it
    finished: Map<number, number>;
    personas: Map<number, Persona>;
    // App id → name for whatever friends are playing
    games: Map<number, string>;
}

export const SteamStore = createStore({
    state: {
        login: { state: "loggedOut" },
        gcReady: false,
        limited: false,
        relations: new Map(),
        relationsLoaded: false,
        online: new Map(),
        inMatch: new Map(),
        finished: new Map(),
        personas: new Map(),
        games: new Map()
    } as SteamState,
    actions: {
        setLogin: (s, login : Login) => { s.login = login },
        setSelf: (s, id : number) => { s.self = id },
        setGcReady: (s, ready : boolean) => { s.gcReady = ready },
        setLimited: (s) => { s.limited = true },
        setRelations: (s, relations : [number, SteamUser.EFriendRelationship][]) => {
            s.relations = new Map(relations);
            s.relationsLoaded = true;
        },
        setRelation: (s, id : number, rel : SteamUser.EFriendRelationship) => {
            if(rel == Relationship.None) s.relations.delete(id);
            else s.relations.set(id, rel);
        },
        // undefined when they go offline
        setOnline: (s, id : number, status? : OnlineStatus) => {
            const known = s.online.get(id);
            if(!status) s.online.delete(id);
            else if(known?.appId != status.appId || known?.game != status.game || known?.display != status.display || !sameRich(known?.rich, status.rich)) {
                s.online.set(id, status);
            }

            // The minutes going backwards means a new match started without them ever leaving one, e.g. 24 → 1
            const last = s.inMatch.get(id);
            const minutes = matchMinutes(status);
            const nowIn = isInMatchStatus(status);
            const restarted = nowIn && last != undefined && minutes != undefined && minutes < last;
            if(last != undefined && (!nowIn || restarted)) s.finished.set(id, (s.finished.get(id) ?? 0) + 1);

            if(!nowIn) s.inMatch.delete(id);
            else if(restarted || last == undefined) s.inMatch.set(id, minutes ?? -1);
            else if(minutes != undefined && minutes != last) s.inMatch.set(id, minutes);
        },
        setGame: (s, appId : number, name : string) => { s.games.set(appId, name) },
        // Persona updates come in constantly, only actual changes make it into the state
        setPersona: (s, id : number, persona : Persona) => {
            const known = s.personas.get(id);
            if(known?.name != persona.name || known?.avatar != persona.avatar) s.personas.set(id, persona);
        }
    }
});

export const {
    setLogin, setSelf, setGcReady, setLimited, setRelations, setRelation, setOnline, setGame, setPersona
} = SteamStore.actions;

export const isFriend = SteamStore.selector((s, id : number) => s.relations.get(id) == Relationship.Friend);


// What they're playing that isn't Deadlock, if the name's known yet
export const gameName = SteamStore.selector((s, status : OnlineStatus) =>
    status.game ?? (status.appId && status.appId != DEADLOCK_APP_ID ? s.games.get(status.appId) : undefined));

export const botProfileUrl = SteamStore.selector(s => s.self ? `https://steamcommunity.com/profiles/${toSteam64(s.self)}` : undefined);
