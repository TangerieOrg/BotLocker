// @ts-types="@types/steam-user"
import SteamUser from "steam-user";
import SteamID from "steamid";
import { Buffer } from "node:buffer";
import { DATA_DIR, STEAM_BOT_PASSWORD, STEAM_BOT_USERNAME } from "../config.ts";
import { getKv, setKv } from "../db/mod.ts";
import { readLine } from "../helpers/cli.ts";
import { logger } from "../helpers/log.ts";
import { toSteam64 } from "../helpers/steam.ts";
import { watch } from "../helpers/store.ts";
import type { SteamPersona } from "./types.ts";
import {
    DEADLOCK_APP_ID, IN_MATCH_DISPLAY, type Persona, setGame, setGcReady, setLimited, setLogin, setOnline, setPersona, setRelation, setRelations, setSelf, SteamStore
} from "./SteamStore.ts";
const GC_HELLO = 4006;
const GC_WELCOME = 4004;
const HELLO_INTERVAL_MS = 5000;
const JOB_TIMEOUT_MS = 15000;
const TOKEN_KEY = "steam_refresh_token";
const RELOGIN_MS = 5 * 60 * 1000;

const { log, error } = logger("Steam");

const accountOf = (steamId : SteamID | string) => (typeof steamId == "string" ? new SteamID(steamId) : steamId).accountid;

const client = new SteamUser({
    webCompatibilityMode: true,
    renewRefreshTokens: true,
    autoRelogin: true,
    dataDirectory: `${DATA_DIR}/steam`
});

async function logOn() {
    const refreshToken = await getKv(TOKEN_KEY);
    setLogin({ state: "loggingIn", token: !!refreshToken });
    client.logOn(refreshToken ?
        { refreshToken } :
        { accountName: STEAM_BOT_USERNAME!, password: STEAM_BOT_PASSWORD! });
}

client.on("loggedOn", () => {
    log(`Logged in as ${STEAM_BOT_USERNAME}`);
    setSelf(client.steamID!.accountid);
    setLogin({ state: "loggedOn" });
    client.setPersona(SteamUser.EPersonaState.Online);
});

// Only asked for on a password login from somewhere new, the saved token skips it after that
client.on("steamGuard", async (domain, callback, lastCodeWrong) => {
    const where = domain ? `emailed to ${domain}` : "from the Steam mobile app";

    // Running in a terminal, just type it in
    if(Deno.stdin.isTerminal()) {
        log(`Steam Guard code ${lastCodeWrong ? "was wrong, enter a new one" : "needed"} (${where}):`);
        const code = await readLine();
        if(code) return callback(code);
    }

    // Otherwise hold the login until the owner sends it with /steamguard
    log(`Steam Guard code ${lastCodeWrong ? "was wrong" : "needed"} (${where}), waiting for /steamguard`);
    setLogin({
        state: "guard",
        where,
        lastCodeWrong,
        submit: code => {
            setLogin({ state: "loggingIn", token: false });
            callback(code.trim().toUpperCase());
        }
    });
});

client.on("refreshToken", token => {
    setKv(TOKEN_KEY, token).catch(err => error("Couldn't save refresh token", err));
});

client.on("receivedFromGC", (appid, type) => {
    if(appid != DEADLOCK_APP_ID || type != GC_WELCOME) return;
    if(!SteamStore.get().gcReady) log("Connected to the Deadlock game coordinator");
    setGcReady(true);
});

client.on("playingState", blocked => {
    if(!blocked) return;
    error("Someone else is playing on the bot account, game coordinator is unavailable");
    setGcReady(false);
});

client.on("disconnected", (_result, msg) => {
    log(`Disconnected (${msg}), will reconnect`);
    setGcReady(false);
    setLogin({ state: "loggedOut" });
});

// Only fired when steam-user gives up, e.g. a bad login or the account being used elsewhere
client.on("error", async err => {
    const usedToken = SteamStore.select(s => s.login.state == "loggingIn" && s.login.token);
    setGcReady(false);

    const badLogin = [SteamUser.EResult.InvalidPassword, SteamUser.EResult.AccessDenied, SteamUser.EResult.Expired].includes(err.eresult);
    if(badLogin && usedToken) {
        error(`Saved login token was rejected (${err.message}), logging in with the password`);
        await setKv(TOKEN_KEY, null);
        logOn();
    } else if(badLogin) {
        error(`Login failed (${err.message}), check STEAM_BOT_USERNAME/STEAM_BOT_PASSWORD. Match tracking is off until restart`);
        setLogin({ state: "failed" });
    } else {
        error(`${err.message}, retrying in ${RELOGIN_MS / 60000}m`);
        setLogin({ state: "loggedOut" });
        setTimeout(logOn, RELOGIN_MS);
    }
});

client.on("friendsList", () => {
    setRelations(Object.entries(client.myFriends).map(([sid, rel]) => [accountOf(sid), rel]));
});

client.on("friendRelationship", (sid, rel) => {
    if(rel == SteamUser.EFriendRelationship.Friend) log(`Now friends with ${sid.accountid}`);
    setRelation(sid.accountid, rel);
});

// Updates often only carry what changed, anything missing falls back to what we already knew
client.on("user", (sid : SteamID, update : Partial<SteamPersona>) => {
    const id = accountOf(sid);
    const known : Partial<SteamPersona> = client.users[sid.getSteamID64()] ?? {};
    const field = <K extends keyof SteamPersona>(k : K) => update[k] ?? known[k];

    // Steam games come through as an app id, non-Steam ones as a huge gameid with just a name
    const state = field("persona_state");
    const gameId = Number(field("gameid") ?? 0);
    const appId = field("game_played_app_id") || (gameId < 2 ** 32 ? gameId : 0);
    const online = state != null && state != 0;
    const display = appId == DEADLOCK_APP_ID ? field("rich_presence")?.find(x => x.key == "steam_display")?.value : undefined;

    const was = SteamStore.get().online.get(id)?.display;
    if(online && display == IN_MATCH_DISPLAY && was != IN_MATCH_DISPLAY) log(`${id} started a match`);
    if(was == IN_MATCH_DISPLAY && display != IN_MATCH_DISPLAY) log(`${id} finished a match`);

    setOnline(id, online ? { appId, game: field("game_name") || undefined, display } : undefined);

    const name = field("player_name");
    if(name) setPersona(id, { name, avatar: field("avatar_url_full") });
});

// Session dropped or a job went unanswered, the hello loop starts over
export function gcJob(type : number, payload : Uint8Array) : Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        if(!SteamStore.get().gcReady) return reject(new Error("Not connected to the game coordinator"));

        const timer = setTimeout(() => {
            log("Lost the game coordinator, reconnecting");
            setGcReady(false);
            reject(new Error(`Game coordinator didn't answer message ${type}`));
        }, JOB_TIMEOUT_MS);

        client.sendToGC(DEADLOCK_APP_ID, type, {}, Buffer.from(payload), (_appid, _type, body) => {
            clearTimeout(timer);
            resolve(new Uint8Array(body));
        });
    });
}

// Sends a request, or accepts one if they've already added the bot
export async function addFriend(accountId : number) {
    const rel = SteamStore.get().relations.get(accountId);
    try {
        const res = await client.addFriend(toSteam64(accountId));
        log(`${rel == SteamUser.EFriendRelationship.RequestRecipient ? "Accepted friend request from" : "Sent a friend request to"} ${res.personaName}`);
    } catch(err) {
        if((err as { eresult?: number }).eresult == SteamUser.EResult.InsufficientPrivilege) {
            error("The bot account is limited and can't send friend requests, linked players need to add it themselves");
            return setLimited();
        }
        error(`Couldn't add ${accountId} as a friend`, err);
    }
}

// Straight from Steam, for accounts that aren't friends with the bot yet
export async function fetchPersona(accountId : number) : Promise<Persona | undefined> {
    const known = SteamStore.get().personas.get(accountId);
    if(known) return known;

    const res = await client.getPersonas([toSteam64(accountId)]).catch(() => undefined);
    const p = Object.values(res?.personas ?? {}).at(0) as Partial<SteamPersona> | undefined;
    if(!p?.player_name) return undefined;

    const persona = { name: p.player_name, avatar: p.avatar_url_full };
    setPersona(accountId, persona);
    return persona;
}

// Names for whatever friends are playing, looked up once per game
function watchGames() {
    const requested = new Set<number>();
    watch(SteamStore, s => s.online, online => {
        const missing = [...new Set([...online.values()].map(x => x.appId))]
            .filter(x => x && x != DEADLOCK_APP_ID && !requested.has(x));
        if(missing.length == 0) return;

        missing.forEach(x => requested.add(x));
        client.getProductInfo(missing, [])
            .then(res => {
                for(const [appId, info] of Object.entries(res.apps)) {
                    if(info.appinfo?.common?.name) setGame(Number(appId), info.appinfo.common.name);
                }
            })
            .catch(err => error("Couldn't look up game names", err));
    });
}

export function startSteam() {
    if(!STEAM_BOT_USERNAME || !STEAM_BOT_PASSWORD) {
        error("No STEAM_BOT_USERNAME/STEAM_BOT_PASSWORD, nothing can be tracked without the Steam bot");
        Deno.exit(1);
    }

    // Keep saying hello until the game coordinator answers, and again whenever it's lost
    let helloTimer : ReturnType<typeof setInterval> | undefined;
    watch(SteamStore, s => s.login.state == "loggedOn" && !s.gcReady, needed => {
        clearInterval(helloTimer);
        if(!needed) return;

        const hello = () => client.sendToGC(DEADLOCK_APP_ID, GC_HELLO, {}, Buffer.alloc(0));
        client.gamesPlayed([DEADLOCK_APP_ID]);
        hello();
        helloTimer = setInterval(hello, HELLO_INTERVAL_MS);
    });

    watchGames();

    logOn();
}
