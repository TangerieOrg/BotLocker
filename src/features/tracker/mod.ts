import type { Client } from "discord.js";
import { getMatchHistory, getRank } from "../../deadlock/api.ts";
import type { MatchHistoryEntry } from "../../deadlock/types.ts";
import { getLinks, getMatchIds, getStoredMatch, getStreak, insertMatches, type Link, TRACKED_MATCH_MODES } from "../../db/mod.ts";
import { type MatchEvent, sendMatchEvent } from "./notify.ts";
import { MAX_NOTIFY_AGE_S, POLL_INTERVAL_MS } from "../../config.ts";

interface Found {
    link: Link;
    entry: MatchHistoryEntry;
    history: MatchHistoryEntry[];
}

let running = false;

// Badge on a history entry is the badge going into the match, so the badge after is on the next ranked match
async function badgeAfter(entry : MatchHistoryEntry, history : MatchHistoryEntry[]) {
    const next = history
        .filter(x => x.match_mode == 4 && x.match_id > entry.match_id && x.ranked_display_badge)
        .sort((a, b) => a.match_id - b.match_id)
        .at(0);

    if(next) return next.ranked_display_badge;

    const rank = await getRank(entry.account_id).catch(() => undefined);
    if(rank?.last_match?.match_id == entry.match_id) return rank.badge;
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

    const fresh = history
        .filter(x => TRACKED_MATCH_MODES.includes(x.match_mode) && !known.has(x.match_id))
        .sort((a, b) => a.match_id - b.match_id);

    if(fresh.length == 0) return [];
    await insertMatches(fresh);
    console.log(`[Tracker] ${fresh.length} new match(es) for ${link.account_id}`);

    return fresh.map(x => ({ link, entry: x, history }));
}

async function toEvent(f : Found) : Promise<MatchEvent | undefined> {
    const match = await getStoredMatch(f.link.account_id, f.entry.match_id);
    if(!match) return undefined;

    let deranked : number | undefined;
    if(!match.won && match.match_mode == 4 && match.badge) {
        const after = await badgeAfter(f.entry, f.history);
        if(after && after < match.badge) deranked = after;
    }

    console.log(`[Tracker] ${f.link.account_id} ${match.won ? "won" : "lost"} match ${match.match_id} (${match.kills}/${match.deaths}/${match.assists})${deranked != null ? " and deranked" : ""}`);

    return {
        link: f.link,
        match,
        streak: await getStreak(f.link.account_id, match.match_id),
        previousStreak: await getStreak(f.link.account_id, match.match_id - 1),
        deranked
    };
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

        const event = await toEvent(f);
        if(event) await sendMatchEvent(client, event);
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
