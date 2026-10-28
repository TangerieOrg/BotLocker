// @ts-types="@types/steam-user"
import SteamUser from "steam-user";
import SteamID from "steamid";
import { Buffer } from "node:buffer";
import { DATA_DIR, STEAM_USERS } from "../config.ts";
import { getKv, setKv } from "../db/mod.ts";
import { readLine } from "../helpers/cli.ts";
import { logger } from "../helpers/log.ts";
import { toSteam64 } from "../helpers/steam.ts";
import { heroFromCodename } from "../deadlock/assets.ts";
import { activityFromStatus, modeLabel } from "./activity.ts";
import { watch } from "../helpers/store.ts";
import type { SteamPersona } from "./types.ts";
import {
    DEADLOCK_APP_ID, gameName, isFriend, type Login, type OnlineStatus, type Persona, setBot, setGame, setGcReady, setLimited, setLogin, setOnline, setPersona, setRelation, setRelations, setSelf, SteamStore
} from "./SteamStore.ts";
const GC_HELLO = 4006;
const GC_WELCOME = 4004;
const HELLO_INTERVAL_MS = 5000;
const JOB_TIMEOUT_MS = 15000;
const TOKEN_KEY = "steam_refresh_token";
const RELOGIN_MS = 5 * 60 * 1000;
// Steam stops showing main as in Deadlock after a long session, a fresh login brings it back
const MAIN_REFRESH_MS = 6 * 60 * 60 * 1000;
const MAIN_REFRESH_GAP_MS = 5000;
const RICH_PRESENCE_POLL_MS = 30 * 1000;
// Spread the extra accounts out so Steam doesn't throttle a burst of logins
export const EXTRA_LOGIN_GAP_MS = 5000;
// An on-demand session gives up if the game coordinator hasn't answered by then
const SESSION_READY_MS = 90 * 1000;
// A code from the Steam mobile app needs the owner to notice the DM
const SESSION_GUARD_MS = 10 * 60 * 1000;
// Breathing room after a personal session so the owner's presence settles, longer after any that failed or got kicked
const SESSION_COOLDOWN_MS = 60 * 1000;
const SESSION_FAILED_COOLDOWN_MS = 15 * 60 * 1000;

const { log, error } = logger("Steam");

const accountOf = (steamId : SteamID | string) => (typeof steamId == "string" ? new SteamID(steamId) : steamId).accountid;

export interface SteamAccount {
    username: string;
    // The first account in STEAM_USERS, the only one with friends. The rest just fetch salts
    main: boolean;
    // Every extra account only logs in for a fetch (see session), main stays logged in
    onDemand: boolean;
    // A |lazy personal account rather than a bot
    personal: boolean;
    // Whether a fetch can start now. For a personal (|lazy) account that also means its owner isn't on Steam
    available(): boolean;
    // Runs fn with the game coordinator connected. On-demand accounts log in for it and out again after
    session<T>(fn : () => Promise<T>): Promise<T>;
    isReady(): boolean;
    selfId(): number | undefined;
    gcJob(type : number, payload : Uint8Array): Promise<Uint8Array>;
}

const accounts : SteamAccount[] = [];
let mainClient : SteamUser | undefined;
// One account at a time can ask for a code in the terminal, the rest wait for /steamguard
let terminalBusy = false;

// Main first
export const getAccounts = () : readonly SteamAccount[] => accounts;

function createAccount(creds : { username : string, password : string, lazy? : boolean }, main : boolean) {
    const { username, password } = creds;
    const onDemand = !main;
    // A personal account, so it also waits for its owner to be off Steam
    const lazy = onDemand && !!creds.lazy;
    const tag = main ? username : `${username} (salts only, on demand${lazy ? ", personal" : ""})`;
    const tokenKey = main ? TOKEN_KEY : `${TOKEN_KEY}:${username}`;
    // Where its own account id is kept, so presence can be checked before the first login of a run
    const selfKey = `steam_self:${username}`;
    let cooldownUntil = 0;
    let warnedNotFriend = false;
    const loggedOut : Login = { state: "loggedOut" };

    const client = new SteamUser({
        webCompatibilityMode: true,
        renewRefreshTokens: true,
        // On demand accounts stay down when kicked, a relogin would kick a personal account's owner right back
        autoRelogin: !onDemand,
        dataDirectory: `${DATA_DIR}/steam`
    });

    const loginOf = (s = SteamStore.get()) => main ? s.login : s.bots.get(username)?.login ?? loggedOut;
    const readyOf = (s = SteamStore.get()) => main ? s.gcReady : s.bots.get(username)?.gcReady ?? false;
    const setLoginState = (login : Login) => main ? setLogin(login) : setBot(username, { login });
    const setReady = (gcReady : boolean) => main ? setGcReady(gcReady) : setBot(username, { gcReady });
    const setSelfId = (id : number) => main ? setSelf(id) : setBot(username, { self: id });

    async function logOn() {
        const refreshToken = await getKv(tokenKey);
        setLoginState({ state: "loggingIn", token: !!refreshToken });
        client.logOn(refreshToken ? { refreshToken } : { accountName: username, password });
    }

    client.on("loggedOn", () => {
        log(`Logged in as ${tag}`);
        setSelfId(client.steamID!.accountid);
        setLoginState({ state: "loggedOn" });
        // Staying offline keeps friends from seeing an on-demand login
        if(onDemand) setKv(selfKey, String(client.steamID!.accountid)).catch(err => error(`Couldn't save account id for ${tag}`, err));
        else client.setPersona(SteamUser.EPersonaState.Online);
    });

    // Only asked for on a password login from somewhere new, the saved token skips it after that
    client.on("steamGuard", async (domain, callback, lastCodeWrong) => {
        const where = domain ? `emailed to ${domain}` : "from the Steam mobile app";

        // Running in a terminal, just type it in
        if(Deno.stdin.isTerminal() && !terminalBusy) {
            terminalBusy = true;
            log(`Steam Guard code ${lastCodeWrong ? "was wrong, enter a new one" : "needed"} for ${tag} (${where}):`);
            const code = await readLine().finally(() => { terminalBusy = false });
            if(code) return callback(code);
        }

        // Otherwise hold the login until the owner sends it with /steamguard
        log(`Steam Guard code ${lastCodeWrong ? "was wrong" : "needed"} for ${tag} (${where}), waiting for /steamguard`);
        setLoginState({
            state: "guard",
            where,
            lastCodeWrong,
            submit: code => {
                setLoginState({ state: "loggingIn", token: false });
                callback(code.trim().toUpperCase());
            }
        });
    });

    client.on("refreshToken", token => {
        setKv(tokenKey, token).catch(err => error(`Couldn't save refresh token for ${tag}`, err));
    });

    client.on("receivedFromGC", (appid, type) => {
        if(appid != DEADLOCK_APP_ID || type != GC_WELCOME) return;
        if(!readyOf()) log(`${tag} connected to the Deadlock game coordinator`);
        setReady(true);
    });

    client.on("playingState", blocked => {
        if(!blocked) return;
        error(`Someone else is playing on ${tag}, game coordinator is unavailable`);
        setReady(false);
        // Holding the game slot would keep kicking the owner out of Deadlock
        if(onDemand) {
            cooldownUntil = Date.now() + SESSION_FAILED_COOLDOWN_MS;
            client.logOff();
        }
    });

    // steam-user's own relogin can stall without an error, main once sat logged out for 1h40m after a NoConnection drop.
    // logOff clears whatever it was stuck on, so logOn can start clean
    let reloginTimer : ReturnType<typeof setTimeout> | undefined;
    function watchRelogin() {
        clearTimeout(reloginTimer);
        reloginTimer = setTimeout(() => {
            if(["loggedOn", "guard", "failed"].includes(loginOf().state)) return;
            error(`${tag} still isn't back after ${RELOGIN_MS / 60000}m, logging in again`);
            client.logOff();
            logOn();
            watchRelogin();
        }, RELOGIN_MS);
    }

    if(main) setInterval(() => {
        if(loginOf().state != "loggedOn") return;
        log(`Refreshing the ${tag} session so Steam shows it in Deadlock`);
        client.logOff();
        setTimeout(logOn, MAIN_REFRESH_GAP_MS);
    }, MAIN_REFRESH_MS);

    client.on("disconnected", (_result, msg) => {
        log(`${tag} disconnected (${msg}), will reconnect`);
        setReady(false);
        setLoginState(loggedOut);
        if(!onDemand) watchRelogin();
    });

    // Only fired when steam-user gives up, e.g. a bad login or the account being used elsewhere
    client.on("error", async err => {
        const login = loginOf();
        const usedToken = login.state == "loggingIn" && login.token;
        setReady(false);

        const badLogin = [SteamUser.EResult.InvalidPassword, SteamUser.EResult.AccessDenied, SteamUser.EResult.Expired].includes(err.eresult);
        if(badLogin && usedToken) {
            error(`Saved login token for ${tag} was rejected (${err.message}), logging in with the password`);
            await setKv(tokenKey, null);
            logOn();
        } else if(badLogin) {
            error(`Login failed for ${tag} (${err.message}), check STEAM_USERS. ${main ? "Match tracking" : "Salt fetching on it"} is off until restart`);
            setLoginState({ state: "failed" });
        } else {
            setLoginState(loggedOut);
            if(onDemand) {
                error(`${tag}: ${err.message}, leaving it alone for ${SESSION_FAILED_COOLDOWN_MS / 60000}m`);
                cooldownUntil = Date.now() + SESSION_FAILED_COOLDOWN_MS;
            } else {
                error(`${tag}: ${err.message}, retrying in ${RELOGIN_MS / 60000}m`);
                setTimeout(logOn, RELOGIN_MS);
            }
        }
    });

    // Keep saying hello until the game coordinator answers, and again whenever it's lost
    let helloTimer : ReturnType<typeof setInterval> | undefined;
    watch(SteamStore, s => loginOf(s).state == "loggedOn" && !readyOf(s), needed => {
        clearInterval(helloTimer);
        if(!needed) return;

        const hello = () => client.sendToGC(DEADLOCK_APP_ID, GC_HELLO, {}, Buffer.alloc(0));
        client.gamesPlayed([DEADLOCK_APP_ID]);
        hello();
        helloTimer = setInterval(hello, HELLO_INTERVAL_MS);
    });

    // Session dropped or a job went unanswered, the hello loop starts over
    const gcJob = (type : number, payload : Uint8Array) : Promise<Uint8Array> => new Promise((resolve, reject) => {
        if(!readyOf()) return reject(new Error("Not connected to the game coordinator"));

        const timer = setTimeout(() => {
            log(`Lost the game coordinator on ${tag}, reconnecting`);
            setReady(false);
            reject(new Error(`Game coordinator didn't answer message ${type}`));
        }, JOB_TIMEOUT_MS);

        client.sendToGC(DEADLOCK_APP_ID, type, {}, Buffer.from(payload), (_appid, _type, body) => {
            clearTimeout(timer);
            resolve(new Uint8Array(body));
        });
    });

    // Resolves once the game coordinator answers. Rejects if the login fails, gets kicked or times out
    const waitReady = () => new Promise<void>((resolve, reject) => {
        let timer : ReturnType<typeof setTimeout>;
        const finish = (err? : Error) => {
            clearTimeout(timer);
            unsub();
            if(err) reject(err);
            else resolve();
        };
        const arm = (ms : number, giveUp : () => void) => {
            clearTimeout(timer);
            timer = setTimeout(giveUp, ms);
        };
        const timedOut = () => finish(new Error(`${tag} didn't reach the game coordinator`));
        const unsub = SteamStore.subscribe(s => [readyOf(s), loginOf(s)] as const, ([ready, login], prev) => {
            if(ready) return finish();
            if(login.state == "failed") return finish(new Error(`Login failed for ${tag}`));
            if(login.state == "loggedOut") return finish(new Error(`${tag} was disconnected`));
            if(login.state == prev?.[1].state) return;
            if(login.state == "guard") {
                // Nobody to ask a second time, so a code that never comes switches the account off until restart
                arm(SESSION_GUARD_MS, () => {
                    error(`No Steam Guard code for ${tag}, it stays off until restart`);
                    setLoginState({ state: "failed" });
                    finish(new Error(`Steam Guard code for ${tag} never came`));
                });
            } else arm(SESSION_READY_MS, timedOut);
        });
        arm(SESSION_READY_MS, timedOut);
    });

    async function session<T>(fn : () => Promise<T>) : Promise<T> {
        if(!onDemand) return await fn();

        let failed = false;
        try {
            await logOn();
            await waitReady();
            return await fn();
        } catch(err) {
            failed = true;
            throw err;
        } finally {
            client.logOff();
            setReady(false);
            // A bad login stays failed so the password isn't tried again
            if(loginOf().state != "failed") setLoginState(loggedOut);
            const cooldown = failed ? SESSION_FAILED_COOLDOWN_MS : lazy ? SESSION_COOLDOWN_MS : 0;
            cooldownUntil = Math.max(cooldownUntil, Date.now() + cooldown);
        }
    }

    // Only the main bot can see presence, so the owner has to be one of its friends for this to know when they're on
    function available() {
        if(!onDemand) return readyOf();
        const s = SteamStore.get();
        // Anything but loggedOut means a session (or the setup login) is already using the client
        if(Date.now() < cooldownUntil || loginOf(s).state != "loggedOut") return false;
        if(!lazy) return true;

        const self = s.bots.get(username)?.self;
        if(!self || !s.relationsLoaded) return false;
        if(!isFriend(self)) {
            if(!warnedNotFriend) error(`${tag} isn't friends with ${STEAM_USERS[0].username}, so it can't tell when you're on Steam and stays off. Add the bot from that account`);
            warnedNotFriend = true;
            return false;
        }
        warnedNotFriend = false;
        // A session plays Deadlock and Steam allows one running game per account, so only a game blocks it
        const kind = activityFromStatus(s.online.get(self))?.kind;
        return !kind || kind == "online";
    }

    // First run needs a login to learn its account id and (via Steam Guard) get a saved token, after that it stays logged out
    async function setup() {
        const [token, self] = await Promise.all([getKv(tokenKey), getKv(selfKey)]);
        if(self) setBot(username, { self: Number(self) });
        if(token && self) return log(`${tag} will log in when it has a salt to fetch`);
        log(`Logging ${tag} in once to set it up`);
        await session(async () => {}).catch(err => error(`Couldn't set up ${tag}`, err));
    }

    const account : SteamAccount = {
        username,
        main,
        onDemand,
        personal: lazy,
        available,
        session,
        isReady: () => readyOf(),
        selfId: () => main ? SteamStore.get().self : SteamStore.get().bots.get(username)?.self,
        gcJob
    };
    accounts.push(account);
    if(main) {
        mainClient = client;
        registerMainHandlers(client);
    }

    return { account, logOn, setup };
}

// Friends, presence and personas only exist on the main account
function registerMainHandlers(client : SteamUser) {
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

        // Pushed rich presence is often empty even mid-game, so that keeps whatever the poll last saw
        const last = SteamStore.get().online.get(id);
        const pushed = update.rich_presence?.length ? Object.fromEntries(update.rich_presence.map(x => [x.key, String(x.value)])) : undefined;
        const rich = appId != DEADLOCK_APP_ID ? undefined : pushed ?? (last?.appId == DEADLOCK_APP_ID ? last.rich : undefined);

        updateStatus(id, online ? { appId, game: field("game_name") || undefined, display: rich?.steam_display, rich } : undefined);

        const name = field("player_name");
        if(name) setPersona(id, { name, avatar: field("avatar_url_full") });
    });

    watchGames(client);
    setInterval(() => pollRichPresence(client).catch(err => error("Couldn't get rich presence", err)), RICH_PRESENCE_POLL_MS);
}

const gameLabel = (status? : OnlineStatus) => !status ? undefined : status.appId == DEADLOCK_APP_ID ? "Deadlock" : gameName(status);

// What changed between two statuses, in words. Minutes into a match are ignored on purpose
async function describeChange(before? : OnlineStatus, after? : OnlineStatus) : Promise<string[]> {
    if(!before && !after) return [];
    if(!after) return ["went offline"];

    const out : string[] = [];
    if(!before) out.push("came online");

    const wasGame = gameLabel(before);
    const nowGame = gameLabel(after);
    if(wasGame != nowGame) {
        if(nowGame) out.push(nowGame == "Deadlock" ? "opened Deadlock" : `started playing ${nowGame}`);
        else out.push(wasGame == "Deadlock" ? "left Deadlock" : `stopped playing ${wasGame}`);
    }
    if(nowGame != "Deadlock") return out;

    const wasDeadlock = wasGame == "Deadlock";
    const was = wasDeadlock ? activityFromStatus(before) : undefined;
    const now = activityFromStatus(after);
    if(now?.kind == "match") {
        const sameMatch = was?.kind == "match" && was.hero == now.hero && was.mode == now.mode;
        if(!sameMatch) {
            const hero = await heroFromCodename(now.hero);
            const mode = modeLabel(now.mode);
            out.push(`${hero ? `is playing ${hero}` : "is in hero select"}${mode ? ` (${mode})` : ""}`);
        }
    } else if(now?.kind == "queue") {
        if(was?.kind != "queue") out.push("is queueing");
    } else if(was && was.kind != now?.kind && was.kind != "match") {
        out.push(was.kind == "queue" ? "left the queue" : "back in the menus");
    }

    const wasParty = wasDeadlock ? before?.rich?.steam_player_group : undefined;
    const nowParty = after.rich?.steam_player_group;
    if(wasParty != nowParty) out.push(!wasParty ? "joined a party" : !nowParty ? "left their party" : "switched party");

    return out;
}

async function logPresence(id : number, before? : OnlineStatus, after? : OnlineStatus) {
    const name = SteamStore.get().personas.get(id)?.name;
    const who = name ? `${name} (${id})` : `${id}`;
    for(const change of await describeChange(before, after)) log(`${who} ${change}`);
}

function updateStatus(id : number, status? : OnlineStatus) {
    const before = SteamStore.get();

    void logPresence(id, before.online.get(id), status).catch(err => error("Couldn't log presence change", err));

    setOnline(id, status);

    const after = SteamStore.get();
    const finished = after.finished.get(id) != before.finished.get(id);
    if(finished) log(`${id} finished a match`);
    if(after.inMatch.has(id) && (finished || !before.inMatch.has(id))) log(`${id} started a match`);
}

// Steam doesn't reliably push friends' rich presence, so ask for it while they're in Deadlock
async function pollRichPresence(client : SteamUser) {
    const { login, online } = SteamStore.get();
    const ids = [...online].filter(([, x]) => x.appId == DEADLOCK_APP_ID).map(([id]) => id);
    if(login.state != "loggedOn" || ids.length == 0) return;

    const res = await client.requestRichPresence(DEADLOCK_APP_ID, ids.map(toSteam64), "english");
    for(const id of ids) {
        // Could have closed the game while this was in flight
        const status = SteamStore.get().online.get(id);
        if(status?.appId != DEADLOCK_APP_ID) continue;
        // Nothing back for them isn't the same as no rich presence, keep what's known rather than flip them out of a match
        const polled = res.users[toSteam64(id)]?.richPresence as unknown as Record<string, unknown> | undefined;
        if(!polled?.steam_display) continue;

        const rich = Object.fromEntries(Object.entries(polled).map(([k, v]) => [k, String(v)]));
        updateStatus(id, { ...status, display: rich.steam_display, rich });
    }
}

export const gcJob = (type : number, payload : Uint8Array) => accounts[0].gcJob(type, payload);

// Sends a request, or accepts one if they've already added the bot
export async function addFriend(accountId : number) {
    const rel = SteamStore.get().relations.get(accountId);
    try {
        const res = await mainClient!.addFriend(toSteam64(accountId));
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

    const res = await mainClient!.getPersonas([toSteam64(accountId)]).catch(() => undefined);
    const p = Object.values(res?.personas ?? {}).at(0) as Partial<SteamPersona> | undefined;
    if(!p?.player_name) return undefined;

    const persona = { name: p.player_name, avatar: p.avatar_url_full };
    setPersona(accountId, persona);
    return persona;
}

// Names for whatever friends are playing, looked up once per game
// Names for whatever friends are playing, looked up once per game
function watchGames(client : SteamUser) {
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
    if(STEAM_USERS.length == 0) {
        error("No STEAM_USERS (username|password,...), nothing can be tracked without the Steam bot");
        Deno.exit(1);
    }

    STEAM_USERS.forEach((creds, i) => {
        const { account, logOn, setup } = createAccount(creds, i == 0);
        const start = account.onDemand ? setup : logOn;
        if(i == 0) start();
        else setTimeout(start, i * EXTRA_LOGIN_GAP_MS);
    });
}
