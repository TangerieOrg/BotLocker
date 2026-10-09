import SteamUser from "steam-user";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
import { DATA_DIR, STEAM_BOT_GUARD_CODE, STEAM_BOT_PASSWORD, STEAM_BOT_REFRESH_TOKEN, STEAM_BOT_USERNAME } from "../config.ts";
import { getKv, getLinks, setKv } from "../db/mod.ts";
import { toSteam64 } from "../deadlock/steam.ts";

const APP_ID = 1422450;
const GC_HELLO = 4006;
const GC_WELCOME = 4004;
const HELLO_INTERVAL_MS = 5000;
const JOB_TIMEOUT_MS = 15000;
const TOKEN_KEY = "steam_refresh_token";
const RELOGIN_MS = 5 * 60 * 1000;

// steam-user has no types, this is just the part we use
interface Persona {
    player_name: string;
    avatar_url_full?: string;
    persona_state: number;
    game_played_app_id: number | null;
}

interface Client {
    steamID: { accountid: number } | null;
    myFriends: Record<string, number>;
    users: Record<string, Persona>;
    logOn(details : Record<string, unknown>) : void;
    gamesPlayed(apps : number[], force? : boolean) : void;
    setPersona(state : number) : void;
    sendToGC(appid : number, type : number, header : object, payload : Buffer, callback? : (appid : number, type : number, payload : Buffer) => void) : void;
    getPersonas(ids : string[]) : Promise<{ personas: Record<string, Persona> }>;
    addFriend(id : string) : Promise<{ personaName: string }>;
    // Each event has its own arguments
    // deno-lint-ignore no-explicit-any
    on(event : string, fn : (...args : any[]) => void) : void;
}

const Relationship = SteamUser.EFriendRelationship as Record<string, number>;
const accountOf = (steamId : { accountid: number } | string) => typeof steamId == "string" ?
    Number(BigInt(steamId) & 0xFFFFFFFFn) :
    steamId.accountid;

// deadlockStopped(accountId) fires when a friend leaves Deadlock (closed it or went offline)
// friendAdded(accountId) fires when a linked player becomes friends with the bot
// guardNeeded(where, lastCodeWrong) fires when the login is waiting on a Steam Guard code from /steamguard
// loggedOn fires after every successful login
export const steamEvents = new EventEmitter();

let client : Client | undefined;
let usingToken = false;
let pendingGuard : ((code : string) => void) | undefined;
// Limited accounts (nothing spent on them) can accept friend requests but not send them
let canInvite = true;
let tokenRejected = false;
let gcReady = false;
let helloTimer : ReturnType<typeof setInterval> | undefined;
const playing = new Map<number, boolean>();

export const steamEnabled = () => !!STEAM_BOT_USERNAME && !!STEAM_BOT_PASSWORD;
export const steamReady = () => gcReady;

function sayHello() {
    clearInterval(helloTimer);
    gcReady = false;
    if(!client) return;

    const hello = () => client!.sendToGC(APP_ID, GC_HELLO, {}, Buffer.alloc(0));
    client.gamesPlayed([APP_ID]);
    hello();
    helloTimer = setInterval(hello, HELLO_INTERVAL_MS);
}

// Session dropped or a job went unanswered, start over
export function resetGc() {
    if(gcReady) console.log("[Steam] Lost the game coordinator, reconnecting");
    sayHello();
}

export function gcJob(type : number, payload : Uint8Array) : Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        if(!client || !gcReady) return reject(new Error("Not connected to the game coordinator"));

        const timer = setTimeout(() => {
            resetGc();
            reject(new Error(`Game coordinator didn't answer message ${type}`));
        }, JOB_TIMEOUT_MS);

        client.sendToGC(APP_ID, type, {}, Buffer.from(payload), (_appid, _type, body) => {
            clearTimeout(timer);
            resolve(new Uint8Array(body));
        });
    });
}

async function linkedIds() {
    return new Set((await getLinks()).map(x => x.account_id));
}

// Accept requests from linked players and invite any linked player the bot has no relationship with yet
async function syncFriends() {
    if(!client) return;
    const linked = await linkedIds();
    for(const id of linked) {
        const rel = client.myFriends[toSteam64(id)] ?? Relationship.None;
        if(rel != Relationship.RequestRecipient && (rel != Relationship.None || !canInvite)) continue;

        await client.addFriend(toSteam64(id))
            .then(x => console.log(`[Steam] ${rel == Relationship.None ? "Sent a friend request to" : "Accepted friend request from"} ${x.personaName}`))
            .catch(err => onInviteError(id, err));
    }
}

function onPersona(sid : { accountid: number }, user : Persona) {
    const id = accountOf(sid);
    const now = user.game_played_app_id == APP_ID && user.persona_state != 0;
    const was = playing.get(id) ?? false;
    playing.set(id, now);
    if(was && !now) steamEvents.emit("deadlockStopped", id);
}

export function startSteam() {
    if(!steamEnabled()) {
        console.log("[Steam] No STEAM_BOT_USERNAME/STEAM_BOT_PASSWORD, match tracking is off");
        return false;
    }
    if(client) return true;

    client = new SteamUser({
        webCompatibilityMode: true,
        renewRefreshTokens: true,
        autoRelogin: true,
        dataDirectory: `${DATA_DIR}/steam`
    }) as Client;

    client.on("loggedOn", () => {
        console.log(`[Steam] Logged in as ${STEAM_BOT_USERNAME}`);
        pendingGuard = undefined;
        steamEvents.emit("loggedOn");
        client!.setPersona(SteamUser.EPersonaState.Online);
        sayHello();
    });

    // Only asked for on a password login from somewhere new, the saved token skips it after that
    client.on("steamGuard", async (domain : string | null, callback : (code : string) => void, lastCodeWrong : boolean) => {
        const where = domain ? `emailed to ${domain}` : "from the Steam mobile app";
        if(STEAM_BOT_GUARD_CODE && !lastCodeWrong) return callback(STEAM_BOT_GUARD_CODE);

        // Running in a terminal (steam-test), just type it in
        if(Deno.stdin.isTerminal()) {
            console.log(`[Steam] Steam Guard code ${lastCodeWrong ? "was wrong, enter a new one" : "needed"} (${where}):`);
            const code = await readLine();
            if(code) return callback(code);
        }

        // Otherwise hold the login until the owner sends it with /steamguard
        pendingGuard = callback;
        console.log(`[Steam] Steam Guard code ${lastCodeWrong ? "was wrong" : "needed"} (${where}), waiting for /steamguard`);
        steamEvents.emit("guardNeeded", where, lastCodeWrong);
    });

    client.on("refreshToken", (token : string) => {
        setKv(TOKEN_KEY, token).catch(err => console.error("[Steam] Couldn't save refresh token", err));
    });

    client.on("receivedFromGC", (appid : number, type : number) => {
        if(appid != APP_ID || type != GC_WELCOME) return;
        clearInterval(helloTimer);
        if(!gcReady) console.log("[Steam] Connected to the Deadlock game coordinator");
        gcReady = true;
    });

    client.on("playingState", (blocked : boolean) => {
        if(blocked) console.error("[Steam] Someone else is playing on the bot account, game coordinator is unavailable");
        else if(!gcReady) sayHello();
    });

    client.on("disconnected", (_result : number, msg : string) => {
        console.log(`[Steam] Disconnected (${msg}), will reconnect`);
        clearInterval(helloTimer);
        gcReady = false;
    });

    // Only fired when steam-user gives up, e.g. a bad login or the account being used elsewhere
    client.on("error", async (err : Error & { eresult?: number }) => {
        clearInterval(helloTimer);
        gcReady = false;
        pendingGuard = undefined;

        const badLogin = [SteamUser.EResult.InvalidPassword, SteamUser.EResult.AccessDenied, SteamUser.EResult.Expired].includes(err.eresult);
        if(badLogin && usingToken) {
            console.error(`[Steam] Saved login token was rejected (${err.message}), logging in with the password`);
            tokenRejected = true;
            await setKv(TOKEN_KEY, null);
            logOn();
        } else if(badLogin) {
            console.error(`[Steam] Login failed (${err.message}), check STEAM_BOT_USERNAME/STEAM_BOT_PASSWORD. Match tracking is off until restart`);
        } else {
            console.error(`[Steam] ${err.message}, retrying in ${RELOGIN_MS / 60000}m`);
            setTimeout(logOn, RELOGIN_MS);
        }
    });

    client.on("friendsList", () => syncFriends().catch(err => console.error(err)));

    client.on("friendRelationship", async (sid : { accountid: number }, rel : number) => {
        if(!(await linkedIds()).has(sid.accountid)) return;
        if(rel == Relationship.Friend) {
            console.log(`[Steam] Now friends with ${sid.accountid}`);
            steamEvents.emit("friendAdded", sid.accountid);
        }
        if(rel != Relationship.RequestRecipient) return;
        await client!.addFriend(toSteam64(sid.accountid))
            .then(x => console.log(`[Steam] Accepted friend request from ${x.personaName}`))
            .catch(err => console.error(`[Steam] Couldn't accept friend request from ${sid.accountid}`, err));
    });

    client.on("user", onPersona);

    logOn();
    return true;
}

// One line from stdin, undefined if there's nothing to read (e.g. running in Docker)
async function readLine() {
    const buf = new Uint8Array(64);
    const n = await Deno.stdin.read(buf).catch(() => null);
    return n ? new TextDecoder().decode(buf.subarray(0, n)).trim() || undefined : undefined;
}

export const getRefreshToken = () => getKv(TOKEN_KEY);

export const guardPending = () => !!pendingGuard;

// False if the login isn't waiting on a code
export function submitGuardCode(code : string) {
    if(!pendingGuard) return false;
    const callback = pendingGuard;
    pendingGuard = undefined;
    callback(code.trim().toUpperCase());
    return true;
}

async function logOn() {
    const refreshToken = await getKv(TOKEN_KEY) ?? (tokenRejected ? undefined : STEAM_BOT_REFRESH_TOKEN);
    usingToken = !!refreshToken;
    client!.logOn(refreshToken ?
        { refreshToken } :
        { accountName: STEAM_BOT_USERNAME, password: STEAM_BOT_PASSWORD });
}

export const isFriend = (accountId : number) => client?.myFriends[toSteam64(accountId)] == Relationship.Friend;

function onInviteError(accountId : number, err : Error & { eresult?: number }) {
    if(err.eresult == SteamUser.EResult.InsufficientPrivilege) {
        if(canInvite) console.error("[Steam] The bot account is limited and can't send friend requests, linked players need to add it themselves");
        canInvite = false;
        return;
    }
    console.error(`[Steam] Couldn't add ${accountId} as a friend`, err);
}

// "friends", "sent" or undefined if it couldn't send
export async function addFriend(accountId : number) {
    if(!client) return undefined;
    if(isFriend(accountId)) return "friends";

    // Accepting still works on a limited account
    if(!canInvite && client.myFriends[toSteam64(accountId)] != Relationship.RequestRecipient) return undefined;

    try {
        await client.addFriend(toSteam64(accountId));
        return isFriend(accountId) ? "friends" : "sent";
    } catch(err) {
        onInviteError(accountId, err as Error);
        return undefined;
    }
}

export async function getPersonas(accountIds : number[]) {
    const personas = new Map<number, { name: string, avatar?: string }>();
    if(!client || !client.steamID || accountIds.length == 0) return personas;

    const res = await client.getPersonas(accountIds.map(toSteam64)).catch(() => undefined);
    for(const [sid, p] of Object.entries(res?.personas ?? {})) {
        if(p.player_name) personas.set(accountOf(sid), { name: p.player_name, avatar: p.avatar_url_full });
    }
    return personas;
}

export const botProfileUrl = () => client?.steamID ? `https://steamcommunity.com/profiles/${toSteam64(client.steamID.accountid)}` : undefined;
