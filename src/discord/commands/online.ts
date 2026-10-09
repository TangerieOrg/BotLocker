import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { heroName } from "../../deadlock/assets.ts";
import { DEADLOCK_APP_ID, getSteamStatuses, hasSteamKey } from "../../deadlock/steam.ts";
import { getLinks, getRecentMatches, getStreak, type Link } from "../../db/mod.ts";
import { COLOURS, formatStreak } from "../embeds.ts";
import { getOnlineStatusLine } from "../../lines/mod.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("online")
    .setDescription("Who's online and who has been playing recently")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(x => x.setName("hours").setDescription("How far back to look for recent games (default 3)").setMinValue(1).setMaxValue(168));

async function lastGame(link : Link) {
    const match = (await getRecentMatches(link.account_id, 1)).at(0);
    if(!match) return "no games recorded";
    const streak = await getStreak(link.account_id);
    return `${match.won ? "won" : "lost"} as ${await heroName(match.hero_id)} <t:${match.start_time}:R>${Math.abs(streak) > 1 ? ` · ${formatStreak(streak)}` : ""}`;
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hours = interaction.options.getInteger("hours") ?? 3;
    const since = Date.now() / 1000 - hours * 60 * 60;

    const links = await getLinks();
    const members = await fetchMembers(interaction.guild!, links.map(x => x.user_id));
    const guildLinks = links.filter(x => members.has(x.user_id));
    const statuses = await getSteamStatuses(guildLinks.map(x => x.account_id));
    const name = (link : Link) => members.get(link.user_id)!.displayName;

    const inDeadlock = guildLinks.filter(x => statuses.get(x.account_id)?.gameid == DEADLOCK_APP_ID);
    const online = guildLinks.filter(x => !inDeadlock.includes(x) && (statuses.get(x.account_id)?.personastate ?? 0) > 0);
    const recent = (await Promise.all(guildLinks
        .filter(x => !inDeadlock.includes(x) && !online.includes(x))
        .map(async x => ({ link: x, match: (await getRecentMatches(x.account_id, 1)).at(0) }))))
        .filter(x => x.match && x.match.start_time >= since)
        .sort((a, b) => b.match!.start_time - a.match!.start_time);

    const sections : string[] = [];

    if(inDeadlock.length > 0) {
        const lines = await Promise.all(inDeadlock.map(async x => `**${name(x)}** - last game ${await lastGame(x)}`));
        sections.push(`**In Deadlock**\n${lines.join("\n")}`);
    }

    if(online.length > 0) {
        const lines = await Promise.all(online.map(async x => {
            const status = statuses.get(x.account_id)!;
            return `**${name(x)}** - ${getOnlineStatusLine({
                game: status.gameextrainfo,
                won: !!(await getRecentMatches(x.account_id, 1)).at(0)?.won,
                streak: await getStreak(x.account_id)
            })}`;
        }));
        sections.push(`**Online**\n${lines.join("\n")}`);
    }

    if(recent.length > 0) {
        const lines = await Promise.all(recent.map(async x =>
            `**${name(x.link)}** ${x.match!.won ? "won" : "lost"} as ${await heroName(x.match!.hero_id)} <t:${x.match!.start_time}:R>`
        ));
        sections.push(`**Played in the last ${hours}h**\n${lines.join("\n")}`);
    }

    await interaction.editReply({ embeds: [{
        title: hasSteamKey() ? `${inDeadlock.length} In Deadlock · ${online.length} Online` : `${recent.length} Recently Online`,
        description: sections.join("\n\n").slice(0, 4096) || `Nobody is online or has played in the last ${hours}h`,
        color: COLOURS.gold
    }] });
}
