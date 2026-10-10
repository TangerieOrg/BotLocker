import { ActivityType } from "discord.js";
import { PRESENCE_ROTATE_MS as ROTATE_MS } from "../config.ts";
import { getLastMatch, getLatestMatch, getMatchRows, getStreak } from "../db/mod.ts";
import { heroName, rankName } from "../deadlock/assets.ts";
import { watchAll } from "../helpers/store.ts";
import { getUser, LinkStore } from "../links/LinkStore.ts";
import { getGroupPresenceLine, getIdleLine, getOnlinePresenceLine, getPresenceLine, matchContext } from "../lines/mod.ts";
import { DEADLOCK_APP_ID, gameName, type OnlineStatus, SteamStore } from "../steam/SteamStore.ts";
import { client } from "./client.ts";
import { DiscordStore, memberName, setStatus } from "./DiscordStore.ts";

async function onlineLine(userId : string, accountId : number, status : OnlineStatus) {
    const last = await getLastMatch(accountId);
    const inDeadlock = status.appId == DEADLOCK_APP_ID;

    return getOnlinePresenceLine({
        name: await memberName(userId),
        hero: last ? await heroName(last.hero_id) : undefined,
        game: inDeadlock ? undefined : gameName(status),
        inDeadlock,
        won: !!last?.won,
        streak: await getStreak(accountId)
    });
}

// Roasts the most recent game, or everyone in it if a few of them queued together
async function latestMatchLine(accountIds : number[]) {
    const latest = await getLatestMatch(accountIds);
    if(!latest) return undefined;

    const players = (await getMatchRows(latest.match_id)).filter(x => getUser(x.account_id));
    if(players.length > 1) {
        const winners : string[] = [];
        const losers : string[] = [];
        for(const x of players) (x.won ? winners : losers).push(await memberName(getUser(x.account_id)!));
        return getGroupPresenceLine(winners, losers);
    }

    const rank = latest.match_mode == 4 && latest.badge ? await rankName(latest.badge) : undefined;
    return getPresenceLine(await memberName(getUser(latest.account_id)!), matchContext(latest, await heroName(latest.hero_id), rank), !!latest.won);
}

async function nextStatus(rotation : number) {
    const links = [...LinkStore.get().links];
    const { online } = SteamStore.get();

    // Only rotate through people in Deadlock if there are any, otherwise anyone else online on Steam
    const inDeadlock = links.filter(([, id]) => online.get(id)?.appId == DEADLOCK_APP_ID);
    const pool = inDeadlock.length > 0 ? inDeadlock : links.filter(([, id]) => online.has(id));

    if(pool.length > 0) {
        const [userId, accountId] = pool[rotation % pool.length];
        return "Watching " + await onlineLine(userId, accountId, online.get(accountId)!);
    }

    if(rotation % 2 == 0) {
        const roast = await latestMatchLine(links.map(([, id]) => id));
        if(roast) return "Watching " + roast;
    }

    return "Watching " + getIdleLine();
}

export function startPresence() {
    let rotation = 0;

    // Rerolls a few times rather than showing the same thing twice in a row
    const tick = async () => {
        if(!DiscordStore.get().channel) return;
        const current = DiscordStore.get().status;

        let text = await nextStatus(++rotation);
        for(let i = 0; i < 3 && text == current; i++) text = await nextStatus(rotation);
        setStatus(text);
    };

    // Shown as soon as Discord is up, and whenever the text changes
    watchAll([DiscordStore], () => DiscordStore.get().channel ? DiscordStore.get().status : undefined, status => {
        if(!status) return;
        console.log(`[Presence] ${status}`);
        client.user?.setActivity({ type: ActivityType.Custom, name: "custom", state: status });
    });

    const run = () => { tick().catch(err => console.error(err)) };
    DiscordStore.subscribe(s => s.channel, run);
    setInterval(run, ROTATE_MS);
    console.log(`[Presence] Rotating every ${ROTATE_MS / 1000}s`);
}
