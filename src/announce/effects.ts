import type { GuildTextBasedChannel } from "discord.js";
import { SemaphoreQueue } from "@tangerie/utils/queue";
import { MAX_NOTIFY_AGE_S, SEND_DISCORD_MESSAGE } from "../config.ts";
import { getUnannounced, markAnnounced, type Match } from "../db/mod.ts";
import { DiscordStore } from "../discord/DiscordStore.ts";
import { logger } from "../helpers/log.ts";
import { now } from "../helpers/now.ts";
import { watch } from "../helpers/store.ts";
import { getUser } from "../links/LinkStore.ts";
import { TrackerStore } from "../tracker/TrackerStore.ts";
import { buildEmbed } from "./embed.ts";

const { log, error } = logger("Notify");

// One pass at a time, each pass picks up everything still unannounced so extra triggers are harmless
const queue = new SemaphoreQueue(1);

async function announce(channel : GuildTextBasedChannel, match : Match) {
    const userId = getUser(match.account_id);
    if(!userId) return log(`Skipped match ${match.match_id}, ${match.account_id} isn't linked anymore`);

    if(match.start_time + match.duration_s < now() - MAX_NOTIFY_AGE_S) {
        return log(`Skipped match ${match.match_id}, too old to announce`);
    }

    const member = await channel.guild.members.fetch(userId).catch(() => undefined);
    if(!member) return log(`Skipped match ${match.match_id}, <${userId}> isn't in ${channel.guild.name}`);

    const embed = await buildEmbed(match, member.displayName);
    log(`Sent ${match.won ? "win" : "loss"} for ${member.displayName} to #${channel.name}`);
    if(SEND_DISCORD_MESSAGE) await channel.send({ embeds: [embed] });
}

// Marked even if sending failed, otherwise one bad match would be retried forever
async function announcePending() {
    const { channel } = DiscordStore.get();
    if(!channel) return;

    for(const match of await getUnannounced()) {
        await announce(channel, match).catch(err => error(`Failed to announce match ${match.match_id}`, err));
        await markAnnounced(match.account_id, match.match_id);
    }
}

// Once Discord is ready (anything left over from before a restart), then whenever new matches are stored
export function startAnnouncer() {
    const flush = () => { queue.run(announcePending).catch(err => error(err)) };
    watch(DiscordStore, s => s.channel, flush);
    TrackerStore.subscribe(s => s.recorded, flush);
}
