import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { BoardStore } from "../../board/BoardStore.ts";
import { getLastMatch, getLossTotals, getStreak } from "../../db/mod.ts";
import { heroFromCodename, heroName } from "../../deadlock/assets.ts";
import { LinkStore } from "../../links/LinkStore.ts";
import { getMatchStatusLine, getOnlineStatusLine, getQueueStatusLine, joinNames, lossContext } from "../../lines/mod.ts";
import { groupByParty, modeLabel, onlinePlayers, type Player } from "../../steam/activity.ts";
import { COLOURS } from "../embeds.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("online")
    .setDescription("Who's playing, who's online and who has been playing recently")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(x => x.setName("hours").setDescription("How far back to look for recent games (default 3)").setMinValue(1).setMaxValue(168));

const formatStreak = (streak : number) => streak > 0 ? `${streak}W` : `${-streak}L${streak <= -3 ? " 🔥" : ""}`;

async function lastGame(accountId : number) {
    const match = await getLastMatch(accountId);
    if(!match) return "no games recorded";
    const streak = await getStreak(accountId);
    return `${match.won ? "won" : "lost"} as ${await heroName(match.hero_id)} <t:${match.start_time}:R>${Math.abs(streak) > 1 ? ` · ${formatStreak(streak)}` : ""}`;
}

const partyOf = (x : Player) => "party" in x.activity ? x.activity.party : undefined;

// Only friends of the Steam bot show up as online, everyone linked shows up under recent games
export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const hours = interaction.options.getInteger("hours") ?? 3;
    const since = Date.now() / 1000 - hours * 60 * 60;

    const members = await fetchMembers(interaction.guild!, [...LinkStore.get().links.keys()]);
    const name = (x : Player) => members.get(x.userId)!.displayName;
    const players = onlinePlayers().filter(x => members.has(x.userId));
    const tier = (kind : Player["activity"]["kind"]) => players.filter(x => x.activity.kind == kind);
    const lossesOf = async (x : Player) => lossContext(await getLossTotals(x.accountId, BoardStore.get().periodStart));

    const sections : string[] = [];

    // A party is one line, everyone with the hero they're on
    const matchLines = await Promise.all(groupByParty(tier("match"), partyOf).map(async party => {
        const matches = party.map(x => x.activity).filter(x => x.kind == "match");
        const heroes = await Promise.all(matches.map(x => heroFromCodename(x.hero)));
        const mode = modeLabel(matches[0]?.mode);
        const minutes = Math.max(0, ...matches.map(x => x.minutes ?? 0)) || undefined;

        const who = party.map((x, i) => `**${name(x)}**${heroes[i] ? ` (${heroes[i]})` : ""}`).join(" & ");
        const info = [mode, minutes ? `${minutes} min` : "picking heroes"].filter(x => x).join(" · ");
        return `${who} · ${info} - ${getMatchStatusLine({ names: party.map(name), heroes, mode, minutes })}`;
    }));
    if(matchLines.length > 0) sections.push(`**In a Match**\n${matchLines.join("\n")}`);

    const queueLines = groupByParty(tier("queue"), partyOf).map(party => `${party.map(x => `**${name(x)}**`).join(" & ")} - ${getQueueStatusLine()}`);
    if(queueLines.length > 0) sections.push(`**Queueing**\n${queueLines.join("\n")}`);

    const deadlock = tier("deadlock");
    if(deadlock.length > 0) {
        const lines = await Promise.all(deadlock.map(async x => {
            const mates = deadlock.filter(y => y != x && partyOf(y) && partyOf(y) == partyOf(x)).map(name);
            return `**${name(x)}** - last game ${await lastGame(x.accountId)}${mates.length > 0 ? ` · in a party with ${joinNames(mates)}` : ""}`;
        }));
        sections.push(`**In Deadlock**\n${lines.join("\n")}`);
    }

    // Another game and just online both get the existing status lines, the game ones mention what they're playing
    for(const [title, kind] of [["Playing Something Else", "game"], ["Online", "online"]] as const) {
        const lines = await Promise.all(tier(kind).map(async x => `**${name(x)}** - ${getOnlineStatusLine({
            game: x.activity.kind == "game" ? x.activity.game : undefined,
            won: !!(await getLastMatch(x.accountId))?.won,
            streak: await getStreak(x.accountId),
            ...await lossesOf(x)
        })}`));
        if(lines.length > 0) sections.push(`**${title}**\n${lines.join("\n")}`);
    }

    const online = new Set(players.map(x => x.accountId));
    const recent = (await Promise.all([...LinkStore.get().links]
        .filter(([userId, accountId]) => members.has(userId) && !online.has(accountId))
        .map(async ([userId, accountId]) => ({ userId, match: await getLastMatch(accountId) }))))
        .filter(x => x.match && x.match.start_time >= since)
        .sort((a, b) => b.match!.start_time - a.match!.start_time);

    if(recent.length > 0) {
        const lines = await Promise.all(recent.map(async x =>
            `**${members.get(x.userId)!.displayName}** ${x.match!.won ? "won" : "lost"} as ${await heroName(x.match!.hero_id)} <t:${x.match!.start_time}:R>`
        ));
        sections.push(`**Played in the Last ${hours}h**\n${lines.join("\n")}`);
    }

    const counts = [
        [tier("match").length, "In a Match"],
        [tier("queue").length, "Queueing"],
        [players.length - tier("match").length - tier("queue").length, "Online"]
    ].filter(([n]) => n).map(([n, label]) => `${n} ${label}`);

    await interaction.editReply({ embeds: [{
        title: counts.join(" · ") || "Nobody Online",
        description: sections.join("\n\n").slice(0, 4096) || `Nobody is online or has played in the last ${hours}h`,
        color: COLOURS.gold
    }] });
}
