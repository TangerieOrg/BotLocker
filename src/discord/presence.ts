import { ActivityType } from "discord.js";
import { PRESENCE_ROTATE_MS as ROTATE_MS } from "../config.ts";
import { getLastMatch, getLatestMatch, getMatchRows, getStreak } from "../db/mod.ts";
import { heroFromCodename, heroName, rankName } from "../deadlock/assets.ts";
import { watchAll } from "../helpers/store.ts";
import { getUser, LinkStore } from "../links/LinkStore.ts";
import {
    getGroupPresenceLine, getIdleLine, getMatchPresenceLine, getOnlinePresenceLine, getPresenceLine, getQueuePresenceLine, matchContext
} from "../lines/mod.ts";
import { groupByParty, modeLabel, onlinePlayers, type Player, type Tier, TIERS } from "../steam/activity.ts";
import { SteamStore } from "../steam/SteamStore.ts";
import { client } from "./client.ts";
import { DiscordStore, memberName, setStatus } from "./DiscordStore.ts";

// The highest tier anyone is in, split into what the status rotates through. Parties go together in a match or queue
function topTier(players : Player[]) {
    for(const tier of TIERS) {
        const inTier = players.filter(x => x.activity.kind == tier);
        if(inTier.length == 0) continue;
        const grouped = tier == "match" || tier == "queue";
        const entries = grouped ? groupByParty(inTier, x => "party" in x.activity ? x.activity.party : undefined) : inTier.map(x => [x]);
        return { tier, entries };
    }
    return undefined;
}

async function entryLine(tier : Tier, entry : Player[]) {
    const names = await Promise.all(entry.map(x => memberName(x.userId)));

    if(tier == "match") {
        const matches = entry.map(x => x.activity).filter(x => x.kind == "match");
        return getMatchPresenceLine({
            names,
            heroes: await Promise.all(matches.map(x => heroFromCodename(x.hero))),
            mode: modeLabel(matches[0]?.mode),
            minutes: Math.max(0, ...matches.map(x => x.minutes ?? 0)) || undefined
        });
    }

    const [{ accountId, activity }] = entry;
    const last = await getLastMatch(accountId);
    const hero = last ? await heroName(last.hero_id) : undefined;
    const streak = await getStreak(accountId);

    if(tier == "queue") return getQueuePresenceLine({ names, hero, streak });

    return getOnlinePresenceLine({
        name: names[0],
        hero,
        game: activity.kind == "game" ? activity.game : undefined,
        inDeadlock: activity.kind == "deadlock",
        won: !!last?.won,
        streak
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

// In a match > queueing > in Deadlock > another game > online, and only once everyone's offline the last game or an idle line
export async function nextStatus(rotation : number) {
    const top = topTier(onlinePlayers());
    if(top) return "Watching " + await entryLine(top.tier, top.entries[rotation % top.entries.length]);

    if(rotation % 2 == 0) {
        const roast = await latestMatchLine([...LinkStore.get().links.values()]);
        if(roast) return "Watching " + roast;
    }

    return "Watching " + getIdleLine();
}

// Changes when someone starts a match or queue (or a party does), not every time the minutes tick over
function topTierKey() {
    const top = topTier(onlinePlayers());
    if(!top) return "offline";
    if(top.tier != "match" && top.tier != "queue") return top.tier;
    return `${top.tier}:${top.entries.map(x => x.map(p => p.accountId).join("+")).join(",")}`;
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
    // Someone starting a match or queue gets shown straight away instead of waiting for the next rotation
    watchAll([SteamStore, LinkStore], topTierKey, (_cur, prev) => { if(prev != undefined) run() });
    setInterval(run, ROTATE_MS);
    console.log(`[Presence] Rotating every ${ROTATE_MS / 1000}s`);
}
