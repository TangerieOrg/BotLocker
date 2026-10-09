import type { Message } from "discord.js";
import { getGuild, getLink, getLossTotals, getRecentMatches, getStreak } from "../db/mod.ts";
import { heroName, rankName } from "../deadlock/assets.ts";
import { getMentionLine, lossContext, matchContext } from "../lines/mod.ts";

const COOLDOWN_MS = 30 * 1000;

const lastReply = new Map<string, number>();

export async function handleMention(msg : Message) {
    if(msg.author.bot || !msg.inGuild()) return;
    if(!msg.mentions.has(msg.client.user, { ignoreEveryone: true, ignoreRoles: true })) return;

    // if(Date.now() - (lastReply.get(msg.author.id) ?? 0) < COOLDOWN_MS) return;
    lastReply.set(msg.author.id, Date.now());

    const link = await getLink(msg.author.id);
    const last = link ? (await getRecentMatches(link.account_id, 1)).at(0) : undefined;

    const line = getMentionLine(link && last ? {
        ...matchContext(last, await heroName(last.hero_id), last.match_mode == 4 && last.badge ? await rankName(last.badge) : undefined),
        ...lossContext(await getLossTotals(link.account_id, (await getGuild(msg.guildId)).period_start)),
        name: msg.member?.displayName ?? msg.author.username,
        won: !!last.won,
        streak: await getStreak(link.account_id),
        ended: last.start_time + last.duration_s
    } : undefined);

    console.log(`[Mention] ${msg.member?.displayName ?? msg.author.username} in ${msg.guild.name}: ${line}`);
    // Replying needs Read Message History, so fall back to a plain message
    await msg.reply(line)
        .catch(() => msg.channel.send(`<@${msg.author.id}> ${line}`))
        .catch(err => console.error(`[Mention] Failed to reply in ${msg.guild.name}`, err));
}
