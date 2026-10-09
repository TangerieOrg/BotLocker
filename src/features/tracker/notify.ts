import type { APIEmbed, APIEmbedField, Client } from "discord.js";
import { getNotifyGuilds, type Link, type Match } from "../../db/mod.ts";
import { heroIcon, heroName, rankName } from "../../deadlock/assets.ts";
import { COLOURS, formatDuration, modeName } from "../../discord/embeds.ts";
import { formatSouls, getCompliment, getDerankLine, getInsult, getStreakBrokenLine, getTiltLine, type LineContext } from "../../lines/mod.ts";
import { SEND_DISCORD_MESSAGE } from "../../config.ts";

export interface MatchEvent {
    link: Link;
    match: Match;
    streak: number;
    previousStreak: number;
    deranked?: number;
}

async function buildEmbed(event : MatchEvent, displayName : string) : Promise<APIEmbed> {
    const { match, streak, previousStreak, deranked } = event;
    const hero = await heroName(match.hero_id);

    const ctx : LineContext = {
        hero,
        kills: match.kills,
        deaths: match.deaths,
        assists: match.assists,
        souls: match.game_mode == 4 ? undefined : match.net_worth
    };

    const fields : APIEmbedField[] = [
        { name: "K/D/A", value: `${match.kills}/${match.deaths}/${match.assists}`, inline: true },
        { name: "Duration", value: formatDuration(match.duration_s), inline: true },
        { name: "Mode", value: modeName(match.game_mode, match.match_mode), inline: true }
    ];

    if(match.game_mode != 4) fields.splice(1, 0, { name: "Souls", value: formatSouls(match.net_worth), inline: true });

    if(match.match_mode == 4 && match.badge) {
        const delta = match.ranked_delta ?? 0;
        fields.push({ name: "Rank", value: `${await rankName(match.badge)} (${delta > 0 ? "+" : ""}${delta})`, inline: true });
    }

    let description = "";

    if(match.won) {
        description = getCompliment(ctx);
        if(previousStreak <= -3) description += `\n\n**${getStreakBrokenLine(ctx, -previousStreak)}**`;
    } else {
        description = `This is for you: ${getInsult(ctx)}`;
        const tilt = getTiltLine(ctx, -streak);
        if(tilt) description += `\n\n**${tilt}**`;
        if(deranked != null) {
            description += `\n\n**${getDerankLine()}**`;
            fields.push({ name: "Deranked To", value: await rankName(deranked), inline: true });
        }
    }

    return {
        title: `${displayName} ${match.won ? "won" : "lost"} a Deadlock match as ${hero}`,
        description,
        color: match.won ? COLOURS.green : COLOURS.red,
        fields,
        thumbnail: { url: await heroIcon(match.hero_id) ?? "" },
        footer: { text: `Match ${match.match_id}` },
        timestamp: new Date((match.start_time + match.duration_s) * 1000).toISOString()
    };
}

export async function sendMatchEvent(client : Client, event : MatchEvent) {
    for(const g of await getNotifyGuilds()) {
        const guild = client.guilds.cache.get(g.guild_id);
        if(!guild) continue;

        const member = await guild.members.fetch(event.link.user_id).catch(() => undefined);
        if(!member) continue;

        const channel = await guild.channels.fetch(g.channel_id!).catch(() => undefined);
        if(!channel || !channel.isSendable()) {
            console.error(`[Notify] Can't send to channel ${g.channel_id} in ${guild.name}`);
            continue;
        }

        const embed = await buildEmbed(event, member.displayName);
        console.log(`[Notify] Sent ${event.match.won ? "win" : "loss"} for ${member.displayName} to #${channel.name} in ${guild.name}`)
        if(SEND_DISCORD_MESSAGE) {
            await channel.send({ embeds: [embed] })
                .catch(err => console.error(`[Notify] Failed to send to #${channel.name} in ${guild.name}`, err));
        }
    }
}
