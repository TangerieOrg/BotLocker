import type { Message } from "discord.js";
import { getLink, getRecentMatches, getStreak } from "../db/mod.ts";
import { heroName } from "../deadlock/assets.ts";
import { getMentionLine } from "../lines/mod.ts";

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
        hero: await heroName(last.hero_id),
        kills: last.kills,
        deaths: last.deaths,
        assists: last.assists,
        souls: last.game_mode == 4 ? undefined : last.net_worth,
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
