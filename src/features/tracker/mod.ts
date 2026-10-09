import type { Client } from "discord.js";
import { getMatchHistory, getRank } from "../../deadlock/api.ts";
import type { MatchHistoryEntry } from "../../deadlock/types.ts";
import { getLinkByAccount, getLinks, getMatchIds, getStoredMatch, getStreak, insertMatches, type Link, type Match } from "../../db/mod.ts";
import { type MatchEvent, sendMatchEvent } from "./notify.ts";
import { loadScoreboard } from "../scoreboard.ts";
import { GcError, GcResult, getGcHistory, type HistoryPage } from "../../steam/gc.ts";
import { isPlaying, steamEnabled, steamEvents, steamReady } from "../../steam/client.ts";
import { GC_POLL_INTERVAL_MS, MAX_NOTIFY_AGE_S, POLL_INTERVAL_MS } from "../../config.ts";

interface Found {
    link: Link;
    entry: MatchHistoryEntry;
    history: MatchHistoryEntry[];
}

// Rows added from a scoreboard have no rank info yet, so keep refreshing recent ones from history
const REFRESH_WINDOW_S = 24 * 60 * 60;

// History can take a bit to include the match after someone closes the game
const CHECK_DELAYS_MS = [30, 120, 300, 600].map(x => x * 1000);

// The match file isn't always processed straight away, each retry checks deadlock-api before the Steam bot
const SCOREBOARD_RETRY_MS = [2, 5, 10, 20, 40].map(x => x * 60 * 1000);

let polling = false;
let gcPolling = false;
const notFriends = new Set<number>();
const checking = new Map<number, ReturnType<typeof setTimeout>>();
const scoreboards = new Set<number>();

// Badge on a history entry is the badge going into the match, so the badge after is on the next ranked match
async function badgeAfter(match : Match, history : MatchHistoryEntry[]) {
    const next = history
        .filter(x => x.match_mode == 4 && x.match_id > match.match_id && x.ranked_display_badge)
        .sort((a, b) => a.match_id - b.match_id)
        .at(0);

    if(next) return next.ranked_display_badge;

    const rank = await getRank(match.account_id).catch(() => undefined);
    if(rank?.last_match?.match_id == match.match_id) return rank.badge;
    return undefined;
}

async function findMember(client : Client, userId : string) {
    for(const guild of client.guilds.cache.values()) {
        const member = await guild.members.fetch(userId).catch(() => undefined);
        if(member) return member;
    }
    return undefined;
}

// Inserts new history entries, only the ones this call actually inserted come back
async function processHistory(link : Link, history : MatchHistoryEntry[], gcPage? : HistoryPage) : Promise<Found[]> {
    const known = await getMatchIds(link.account_id);

    // First look at this account, just store what's there instead of announcing it all
    if(known.size == 0) {
        if(gcPage) await backfill(link.account_id, gcPage);
        else console.log(`[Tracker] Stored ${(await insertMatches(history)).length} match(es) for new account ${link.account_id}`);
        return [];
    }

    const since = Date.now() / 1000 - REFRESH_WINDOW_S;
    const fresh = (await insertMatches(history.filter(x => !known.has(x.match_id) || x.start_time >= since)))
        .sort((a, b) => a.match_id - b.match_id);

    if(fresh.length > 0) console.log(`[Tracker] ${fresh.length} new match(es) for ${link.account_id} from ${gcPage ? "the Steam bot" : "deadlock-api"}`);
    return fresh.map(x => ({ link, entry: x, history }));
}

async function gcHistory(link : Link) {
    try {
        const page = await getGcHistory(link.account_id);
        notFriends.delete(link.account_id);
        return page;
    } catch(err) {
        if(!(err instanceof GcError && err.result == GcResult.InvalidPermission)) throw err;
        if(!notFriends.has(link.account_id)) console.log(`[Tracker] ${link.account_id} isn't friends with the Steam bot, only deadlock-api can see their matches`);
        notFriends.add(link.account_id);
        return undefined;
    }
}

// deadlock-api first since it's free, the Steam bot only if asked and deadlock-api had nothing new
async function findNew(link : Link, useGc = false) : Promise<Found[]> {
    const apiHistory = await getMatchHistory(link.account_id).catch(err => {
        console.error(`[Tracker] deadlock-api history failed for ${link.account_id}: ${(err as Error).message}`);
        return undefined;
    });

    const found = apiHistory ? await processHistory(link, apiHistory) : [];
    if(found.length > 0 || !useGc || !steamReady()) return found;

    const page = await gcHistory(link);
    return page ? await processHistory(link, page.matches, page) : [];
}

const BACKFILL_DAYS = 91;
const BACKFILL_PAGES = 10;

// Stores roughly the last 3 months of history from the Steam bot without announcing anything, needs the account to be friends with it
export async function backfill(accountId : number, firstPage? : HistoryPage) {
    const all : MatchHistoryEntry[] = [];
    const cutoff = Date.now() / 1000 - BACKFILL_DAYS * 24 * 60 * 60;
    let cursor : number | undefined;

    for(let page = 0; page < BACKFILL_PAGES; page++) {
        const res = page == 0 && firstPage ? firstPage : await getGcHistory(accountId, cursor);
        all.push(...res.matches);

        // Cursor walks back in time, stop if it ends or stops moving
        if(!res.cursor || res.cursor == cursor || res.matches.length == 0) break;
        if(res.matches.some(x => x.start_time < cutoff)) break;
        cursor = res.cursor;
    }

    const added = await insertMatches(all);
    console.log(`[Tracker] Backfilled ${added.length} match(es) for ${accountId}`);
    return all.length;
}

async function toEvent(link : Link, match : Match, history : MatchHistoryEntry[]) : Promise<MatchEvent> {
    let deranked : number | undefined;
    if(!match.won && match.match_mode == 4 && match.badge) {
        const after = await badgeAfter(match, history);
        if(after && after < match.badge) deranked = after;
    }

    console.log(`[Tracker] ${link.account_id} ${match.won ? "won" : "lost"} match ${match.match_id} (${match.kills}/${match.deaths}/${match.assists})${deranked != null ? " and deranked" : ""}`);

    return {
        link,
        match,
        streak: await getStreak(link.account_id, match.match_id),
        previousStreak: await getStreak(link.account_id, match.match_id - 1),
        deranked
    };
}

// History is only used for the derank check, without it that falls back to the player's current rank
export async function announceMatch(client : Client, link : Link, matchId : number, history : MatchHistoryEntry[] = []) {
    const match = await getStoredMatch(link.account_id, matchId);
    if(match) await sendMatchEvent(client, await toEvent(link, match, history));
}

// Stores the full scoreboard for /match in the background, the announcement doesn't wait on it
async function fetchScoreboard(matchId : number, attempt = 0) : Promise<void> {
    if(await loadScoreboard(matchId)) return;
    if(attempt >= SCOREBOARD_RETRY_MS.length) {
        return console.log(`[Tracker] Gave up on the scoreboard for match ${matchId}`);
    }
    setTimeout(() => fetchScoreboard(matchId, attempt + 1).catch(err => console.error(err)), SCOREBOARD_RETRY_MS[attempt]);
}

async function announceFound(client : Client, found : Found[]) {
    const cutoff = Date.now() / 1000 - MAX_NOTIFY_AGE_S;

    for(const f of found.sort((a, b) => a.entry.match_id - b.entry.match_id)) {
        if(f.entry.start_time + f.entry.match_duration_s < cutoff) {
            console.log(`[Tracker] Skipped match ${f.entry.match_id}, too old to announce`);
            continue;
        }

        await announceMatch(client, f.link, f.entry.match_id, f.history);

        // Several linked players can be in the same match
        if(!scoreboards.has(f.entry.match_id)) {
            scoreboards.add(f.entry.match_id);
            fetchScoreboard(f.entry.match_id).catch(err => console.error(err));
        }
    }
}

async function trackedLinks(client : Client) {
    const links : Link[] = [];
    const names : string[] = [];
    for(const x of await getLinks()) {
        const member = await findMember(client, x.user_id);
        if(!member) continue;
        links.push(x);
        names.push(member.displayName);
    }
    return { links, names };
}

// Frequent and free, deadlock-api only
async function poll(client : Client) {
    const { links, names } = await trackedLinks(client);

    const found = (await Promise.all(links.map(x =>
        findNew(x).catch(err => {
            console.error(`[Tracker] Failed to poll ${x.account_id}`, err);
            return [] as Found[];
        })
    ))).flat();

    await announceFound(client, found);
    console.log(`[Tracker] Polled ${links.length} account(s)${names.length > 0 ? ` (${names.join(", ")})` : ""}, ${found.length} new match(es)`);
}

// Rare backstop through the Steam bot, for matches deadlock-api is lagging on that the stopped playing check missed
async function gcPoll(client : Client) {
    const { links } = await trackedLinks(client);

    // The game coordinator takes one request at a time anyway
    const found : Found[] = [];
    for(const x of links) {
        found.push(...await findNew(x, true).catch(err => {
            console.error(`[Tracker] Failed to check ${x.account_id} with the Steam bot`, err);
            return [] as Found[];
        }));
    }

    await announceFound(client, found);
    console.log(`[Tracker] Steam bot backstop checked ${links.length} account(s), ${found.length} new match(es)`);
}

// Someone just closed Deadlock, check a few times until the match shows up
function onStopped(client : Client, accountId : number) {
    clearTimeout(checking.get(accountId));

    const check = async (attempt : number) => {
        const link = await getLinkByAccount(accountId);
        if(!link) return;

        // Back in a game (or it was a blip), the next time they stop will check again
        if(isPlaying(accountId)) {
            checking.delete(accountId);
            return console.log(`[Tracker] ${accountId} is playing again, stopped checking`);
        }

        const found = await findNew(link, true).catch(err => {
            console.error(`[Tracker] Failed to check ${accountId}`, err);
            return [] as Found[];
        });

        if(found.length > 0) {
            checking.delete(accountId);
            return await announceFound(client, found);
        }
        if(attempt + 1 < CHECK_DELAYS_MS.length) {
            checking.set(accountId, setTimeout(() => check(attempt + 1), CHECK_DELAYS_MS[attempt + 1]));
        } else {
            checking.delete(accountId);
            console.log(`[Tracker] ${accountId} stopped playing but no new match showed up`);
        }
    };

    console.log(`[Tracker] ${accountId} stopped playing Deadlock, checking for a new match`);
    checking.set(accountId, setTimeout(() => check(0), CHECK_DELAYS_MS[0]));
}

export function startTracker(client : Client) {
    const tick = async () => {
        if(polling) return;
        polling = true;
        await poll(client).catch(err => console.error(err));
        polling = false;
    };

    console.log(`[Tracker] Polling deadlock-api every ${POLL_INTERVAL_MS / 1000}s`);
    tick();
    setInterval(tick, POLL_INTERVAL_MS);

    if(!steamEnabled()) return;

    const gcTick = async () => {
        if(gcPolling || !steamReady()) return;
        gcPolling = true;
        await gcPoll(client).catch(err => console.error(err));
        gcPolling = false;
    };

    steamEvents.on("deadlockStopped", (accountId : number) => onStopped(client, accountId));
    // deadlock-api usually has their history already, only spend Steam bot requests if it didn't
    steamEvents.on("friendAdded", async (accountId : number) => {
        if((await getMatchIds(accountId)).size > 0) return;
        await backfill(accountId).catch(err => console.error(`[Tracker] Backfill failed for ${accountId}`, err));
    });

    console.log(`[Tracker] Steam bot checks when friends stop playing, backstop every ${GC_POLL_INTERVAL_MS / 1000}s`);
    setInterval(gcTick, GC_POLL_INTERVAL_MS);
}
