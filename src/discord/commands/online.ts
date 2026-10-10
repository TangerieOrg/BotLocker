import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { BoardStore } from "../../board/BoardStore.ts";
import { getLastMatch, getLossTotals, getStreak } from "../../db/mod.ts";
import { heroName } from "../../deadlock/assets.ts";
import { LinkStore } from "../../links/LinkStore.ts";
import { getOnlineStatusLine, lossContext } from "../../lines/mod.ts";
import { DEADLOCK_APP_ID, gameName, SteamStore } from "../../steam/SteamStore.ts";
import { COLOURS } from "../embeds.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("online")
    .setDescription("Who's online and who has been playing recently")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(x => x.setName("hours").setDescription("How far back to look for recent games (default 3)").setMinValue(1).setMaxValue(168));

const formatStreak = (streak : number) => streak > 0 ? `${streak}W` : `${-streak}L${streak <= -3 ? " 🔥" : ""}`;

async function lastGame(accountId : number) {
    const match = await getLastMatch(accountId);
    if(!match) return "no games recorded";
    const streak = await getStreak(accountId);
    return `${match.won ? "won" : "lost"} as ${await heroName(match.hero_id)} <t:${match.start_time}:R>${Math.abs(streak) > 1 ? ` · ${formatStreak(streak)}` : ""}`;
}

// Only friends of the Steam bot show up as online, everyone linked shows up under recent games
export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hours = interaction.options.getInteger("hours") ?? 3;
    const since = Date.now() / 1000 - hours * 60 * 60;

    const { online } = SteamStore.get();
    const members = await fetchMembers(interaction.guild!, [...LinkStore.get().links.keys()]);
    const links = [...LinkStore.get().links].filter(([userId]) => members.has(userId));
    const name = (userId : string) => members.get(userId)!.displayName;

    const inDeadlock = links.filter(([, id]) => online.get(id)?.appId == DEADLOCK_APP_ID);
    const onSteam = links.filter(([, id]) => online.has(id) && !inDeadlock.some(x => x[1] == id));
    const recent = (await Promise.all(links
        .filter(([, id]) => !online.has(id))
        .map(async ([userId, id]) => ({ userId, match: await getLastMatch(id) }))))
        .filter(x => x.match && x.match.start_time >= since)
        .sort((a, b) => b.match!.start_time - a.match!.start_time);

    const sections : string[] = [];

    if(inDeadlock.length > 0) {
        const lines = await Promise.all(inDeadlock.map(async ([userId, id]) => `**${name(userId)}** - last game ${await lastGame(id)}`));
        sections.push(`**In Deadlock**\n${lines.join("\n")}`);
    }

    if(onSteam.length > 0) {
        const lines = await Promise.all(onSteam.map(async ([userId, id]) => `**${name(userId)}** - ${getOnlineStatusLine({
            game: gameName(online.get(id)!),
            won: !!(await getLastMatch(id))?.won,
            streak: await getStreak(id),
            ...lossContext(await getLossTotals(id, BoardStore.get().periodStart))
        })}`));
        sections.push(`**Online**\n${lines.join("\n")}`);
    }

    if(recent.length > 0) {
        const lines = await Promise.all(recent.map(async x =>
            `**${name(x.userId)}** ${x.match!.won ? "won" : "lost"} as ${await heroName(x.match!.hero_id)} <t:${x.match!.start_time}:R>`
        ));
        sections.push(`**Played in the last ${hours}h**\n${lines.join("\n")}`);
    }

    await interaction.editReply({ embeds: [{
        title: `${inDeadlock.length} In Deadlock · ${onSteam.length} Online`,
        description: sections.join("\n\n").slice(0, 4096) || `Nobody is online or has played in the last ${hours}h`,
        color: COLOURS.gold
    }] });
}
