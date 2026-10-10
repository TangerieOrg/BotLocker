import type { GuildTextBasedChannel } from "discord.js";
import { SemaphoreQueue } from "@tangerie/utils/queue";
import { MAX_NOTIFY_AGE_S, SEND_DISCORD_MESSAGE } from "../config.ts";
import { getUnannounced, markAnnounced, type Match } from "../db/mod.ts";
import { DiscordStore } from "../discord/DiscordStore.ts";
import { logger } from "../helpers/log.ts";
import { now } from "../helpers/now.ts";
import { watch } from "../helpers/store.ts";
import { getUser, linkedAccounts } from "../links/LinkStore.ts";
import { partyOf } from "../steam/SteamStore.ts";
import { TrackerStore } from "../tracker/TrackerStore.ts";
import { type Announced, buildEmbed, buildPartyEmbed } from "./embed.ts";

// How long a match waits for party mates' histories to catch up before it's posted with whoever is there
const HOLD_MS = 3 * 60 * 1000;

const { log, error } = logger("Notify");

// One pass at a time, each pass picks up everything still unannounced so extra triggers are harmless
const queue = new SemaphoreQueue(1);
const flush = () => { queue.run(announcePending).catch(err => error(err)) };

// When each held match was first seen, and one timer to try again when the earliest hold runs out
const heldSince = new Map<number, number>();
let holdTimer : ReturnType<typeof setTimeout> | undefined;

// Linked players in the same Steam party as this match's players who are still waiting on a history check
function waitingOn(rows : Match[]) {
    const have = new Set(rows.map(x => x.account_id));
    const parties = new Set(rows.map(x => partyOf(x.account_id)).filter(x => x));
    const { checks } = TrackerStore.get();
    return [...linkedAccounts()].filter(id => !have.has(id) && checks.has(id) && parties.has(partyOf(id)));
}

// Who can actually be announced, the rest are just skipped (and still marked)
async function eligible(channel : GuildTextBasedChannel, match : Match) : Promise<Announced | undefined> {
    const userId = getUser(match.account_id);
    if(!userId) return void log(`Skipped match ${match.match_id}, ${match.account_id} isn't linked anymore`);

    if(match.start_time + match.duration_s < now() - MAX_NOTIFY_AGE_S) {
        return void log(`Skipped match ${match.match_id} for ${match.account_id}, too old to announce`);
    }

    const member = await channel.guild.members.fetch(userId).catch(() => undefined);
    if(!member) return void log(`Skipped match ${match.match_id}, <${userId}> isn't in ${channel.guild.name}`);

    return { match, name: member.displayName };
}

// One message per team, a party gets one together
async function announceTeam(channel : GuildTextBasedChannel, rows : Match[]) {
    const players = (await Promise.all(rows.map(x => eligible(channel, x)))).filter(x => x) as Announced[];
    if(players.length == 0) return;

    const embed = players.length == 1 ? await buildEmbed(players[0]) : await buildPartyEmbed(players);
    log(`Sent ${rows[0].won ? "win" : "loss"} for ${players.map(x => x.name).join(", ")} to #${channel.name}`);
    if(SEND_DISCORD_MESSAGE) await channel.send({ embeds: [embed] });
}

// Marked even if sending failed, otherwise one bad match would be retried forever
async function announcePending() {
    const { channel } = DiscordStore.get();
    if(!channel) return;

    const byMatch = Map.groupBy(await getUnannounced(), x => x.match_id);
    clearTimeout(holdTimer);

    for(const [matchId, rows] of byMatch) {
        const since = heldSince.get(matchId) ?? Date.now();
        const waiting = waitingOn(rows);

        if(waiting.length > 0 && Date.now() - since < HOLD_MS) {
            if(!heldSince.has(matchId)) log(`Holding match ${matchId} for party mates ${waiting.join(", ")}`);
            heldSince.set(matchId, since);
            continue;
        }
        heldSince.delete(matchId);

        // Linked players on both teams of the same match still get one message each
        for(const team of [rows.filter(x => x.won), rows.filter(x => !x.won)]) {
            if(team.length == 0) continue;
            await announceTeam(channel, team).catch(err => error(`Failed to announce match ${matchId}`, err));
        }
        for(const x of rows) await markAnnounced(x.account_id, x.match_id);
    }

    if(heldSince.size > 0) {
        const next = Math.min(...heldSince.values()) + HOLD_MS - Date.now();
        holdTimer = setTimeout(flush, Math.max(0, next));
    }
}

// Once Discord is ready (anything left over from before a restart), then whenever new matches are stored
export function startAnnouncer() {
    watch(DiscordStore, s => s.channel, flush);
    TrackerStore.subscribe(s => s.recorded, flush);
}
