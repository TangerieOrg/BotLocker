import { ActivityType, type Client } from "discord.js";
import { getLatestLinkedMatch, getLinkedMatchRows, getLinks, getMatchDetails, getRecentMatches, getStreak, type Link } from "../db/mod.ts";
import { heroName } from "../deadlock/assets.ts";
import type { MatchMetadata } from "../deadlock/types.ts";
import { DEADLOCK_APP_ID, getSteamStatuses, type SteamStatus } from "../deadlock/steam.ts";
import { getGroupPresenceLine, getIdleLine, getOnlinePresenceLine, getPresenceLine } from "../lines/mod.ts";
import { memberName } from "../discord/util.ts";
import { PRESENCE_ROTATE_MS as ROTATE_MS } from "../config.ts";

let rotation = 0;
let matchCache : { matchId: number, meta?: MatchMetadata, retryAt: number } = { matchId: 0, retryAt: 0 };
let current = "Watching you feed";

async function onlineLine(client : Client, link : Link, status : SteamStatus) {
    const last = (await getRecentMatches(link.account_id, 1)).at(0);
    const inDeadlock = status.gameid == DEADLOCK_APP_ID;

    return getOnlinePresenceLine({
        name: await memberName(client, link.user_id),
        hero: last ? await heroName(last.hero_id) : undefined,
        game: !inDeadlock ? status.gameextrainfo : undefined,
        inDeadlock,
        won: !!last?.won,
        streak: await getStreak(link.account_id)
    });
}

// Only the stored copy, fetching it costs one of the limited game coordinator requests
async function getMatchCached(matchId : number) {
    if(matchCache.matchId == matchId && (matchCache.meta || matchCache.retryAt > Date.now())) return matchCache.meta;

    const meta = await getMatchDetails(matchId);
    matchCache = { matchId, meta, retryAt: Date.now() + 5 * 60 * 1000 };
    return meta;
}

async function latestMatchLine(client : Client) {
    const latest = await getLatestLinkedMatch();
    if(!latest) return undefined;

    const players = new Map((await getLinkedMatchRows(latest.match_id)).map(x => [x.user_id, !!x.won]));

    // Players who aren't friends with the Steam bot only show up in the match itself, so fill in from that
    const meta = await getMatchCached(latest.match_id);
    if(meta) {
        const links = await getLinks();
        for(const p of meta.match_info.players) {
            const link = links.find(x => x.account_id == p.account_id);
            if(link && !players.has(link.user_id)) players.set(link.user_id, p.team == meta.match_info.winning_team);
        }
    }

    if(players.size > 1) {
        const winners : string[] = [];
        const losers : string[] = [];
        for(const [userId, won] of players) {
            (won ? winners : losers).push(await memberName(client, userId));
        }
        return getGroupPresenceLine(winners, losers);
    }

    return getPresenceLine(await memberName(client, latest.user_id), {
        hero: await heroName(latest.hero_id),
        kills: latest.kills,
        deaths: latest.deaths,
        assists: latest.assists,
        souls: latest.game_mode == 4 ? undefined : latest.net_worth
    }, !!latest.won);
}

async function nextStatus(client : Client) {
    const links = await getLinks();
    const statuses = await getSteamStatuses(links.map(x => x.account_id));

    // Only rotate through people in Deadlock if there are any, otherwise anyone else online on Steam
    const inDeadlock = links.filter(x => statuses.get(x.account_id)?.gameid == DEADLOCK_APP_ID);
    const online = links.filter(x => !inDeadlock.includes(x) && (statuses.get(x.account_id)?.personastate ?? 0) > 0);
    const pool = inDeadlock.length > 0 ? inDeadlock : online;

    rotation++;

    if(pool.length > 0) {
        const link = pool[rotation % pool.length];
        return "Watching " + await onlineLine(client, link, statuses.get(link.account_id)!);
    }

    if(rotation % 2 == 0) {
        const roast = await latestMatchLine(client);
        if(roast) return "Watching " + roast;
    }

    return "Watching " + getIdleLine();
}

export async function updatePresence(client : Client) {
    let text = await nextStatus(client);
    for(let i = 0; i < 3 && text == current; i++) {
        rotation--;
        text = await nextStatus(client);
    }
    if(text != current) console.log(`[Presence] ${text}`);
    current = text;
    client.user?.setActivity({ type: ActivityType.Custom, name: "custom", state: current });
}

export function startPresence(client : Client) {
    const tick = () => updatePresence(client).catch(err => console.error(err));
    console.log(`[Presence] Rotating every ${ROTATE_MS / 1000}s`);
    tick();
    setInterval(tick, ROTATE_MS);
}
