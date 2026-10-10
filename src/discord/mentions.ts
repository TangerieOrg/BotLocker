import { type Message } from "discord.js";
import { BoardStore } from "../board/BoardStore.ts";
import { getLastMatch, getLossTotals, getStreak } from "../db/mod.ts";
import { heroName, rankName } from "../deadlock/assets.ts";
import { getAccount } from "../links/LinkStore.ts";
import { getMentionLine, lossContext, matchContext } from "../lines/mod.ts";
import { DiscordStore } from "./DiscordStore.ts";

// Replies when someone @s the bot, about their last game if it knows one
export async function handleMention(msg : Message) {
    if(msg.author.bot || !msg.inGuild() || msg.guildId != DiscordStore.get().channel?.guildId) return;
    if(!msg.mentions.has(msg.client.user, { ignoreEveryone: true, ignoreRoles: true })) return;

    const accountId = getAccount(msg.author.id);
    const last = accountId != null ? await getLastMatch(accountId) : undefined;
    const name = msg.member?.displayName ?? msg.author.username;

    const line = getMentionLine(accountId != null && last ? {
        ...matchContext(last, await heroName(last.hero_id), last.match_mode == 4 && last.badge ? await rankName(last.badge) : undefined),
        ...lossContext(await getLossTotals(accountId, BoardStore.get().periodStart)),
        name,
        won: !!last.won,
        streak: await getStreak(accountId),
        ended: last.start_time + last.duration_s
    } : undefined);

    console.log(`[Mention] ${name}: ${line}`);
    // Replying needs Read Message History, so fall back to a plain message
    await msg.reply(line)
        .catch(() => msg.channel.send(`<@${msg.author.id}> ${line}`))
        .catch(err => console.error(`[Mention] Failed to reply in ${msg.guild.name}`, err));
}
