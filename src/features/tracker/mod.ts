import type { Client } from "discord.js";
import { getMatchHistory, getRank } from "../../deadlock/api.ts";
import type { MatchHistoryEntry } from "../../deadlock/types.ts";
import { getLinks, getMatchIds, getStoredMatch, getStreak, insertMatches, type Link, type Match } from "../../db/mod.ts";
import { type MatchEvent, sendMatchEvent } from "./notify.ts";
import { MAX_NOTIFY_AGE_S, POLL_INTERVAL_MS } from "../../config.ts";

interface Found {
    link: Link;
    entry: MatchHistoryEntry;
    history: MatchHistoryEntry[];
}

// Rows added by the Valve ingest have no rank info yet, so keep refreshing recent ones from history
const REFRESH_WINDOW_S = 24 * 60 * 60;

let running = false;

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

async function findNew(link : Link) : Promise<Found[]> {
    const history = await getMatchHistory(link.account_id);
    const known = await getMatchIds(link.account_id);
    const since = Date.now() / 1000 - REFRESH_WINDOW_S;

    // Only rows this call actually inserted, anything the Valve ingest got to first was already announced there
    const fresh = (await insertMatches(history.filter(x => !known.has(x.match_id) || x.start_time >= since)))
        .sort((a, b) => a.match_id - b.match_id);

    if(fresh.length == 0) return [];
    console.log(`[Tracker] ${fresh.length} new match(es) for ${link.account_id}`);

    return fresh.map(x => ({ link, entry: x, history }));
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

async function poll(client : Client) {
    const links : Link[] = [];
    const names : string[] = [];
    for(const x of await getLinks()) {
        const member = await findMember(client, x.user_id);
        if(!member) continue;
        links.push(x);
        names.push(member.displayName);
    }

    const found = (await Promise.all(links.map(x =>
        findNew(x).catch(err => {
            console.error(`[Tracker] Failed to poll ${x.account_id}`, err);
            return [] as Found[];
        })
    ))).flat();

    const cutoff = Date.now() / 1000 - MAX_NOTIFY_AGE_S;

    for(const f of found.sort((a, b) => a.entry.match_id - b.entry.match_id)) {
        if(f.entry.start_time + f.entry.match_duration_s < cutoff) {
            console.log(`[Tracker] Skipped match ${f.entry.match_id}, too old to announce`);
            continue;
        }

        await announceMatch(client, f.link, f.entry.match_id, f.history);
    }

    console.log(`[Tracker] Polled ${links.length} account(s)${names.length > 0 ? ` (${names.join(", ")})` : ""}, ${found.length} new match(es)`);
}

export function startTracker(client : Client) {
    const tick = async () => {
        if(running) return;
        running = true;
        await poll(client).catch(err => console.error(err));
        running = false;
    };

    console.log(`[Tracker] Polling every ${POLL_INTERVAL_MS / 1000}s`);
    tick();
    setInterval(tick, POLL_INTERVAL_MS);
}
