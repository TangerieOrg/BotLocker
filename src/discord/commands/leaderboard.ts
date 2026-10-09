import { type ChatInputCommandInteraction, type GuildMember, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getGuild, getLinks, getPeriodTotals, getStreak } from "../../db/mod.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Get the (loser) board")
    .setContexts(InteractionContextType.Guild);

async function board(since : number, streetBrawl : boolean, users : Map<number, string>, members : Map<string, GuildMember>) {
    const totals = (await getPeriodTotals(since, streetBrawl)).filter(x => members.has(users.get(x.account_id)!));
    const rows = await Promise.all(totals.map(async x => ({
        ...x,
        name: members.get(users.get(x.account_id)!)!.displayName,
        score: x.losses / x.matches,
        streak: await getStreak(x.account_id)
    })));

    return rows
        .sort((a, b) => b.score - a.score || b.losses - a.losses)
        .map((x, i) => `**${i + 1}**. ${x.name} - ${Math.round(x.score * 100)}% Lost [${x.losses}/${x.matches}]${x.streak <= -3 ? " 🔥 tilted" : ""}`);
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply();

    const guild = await getGuild(interaction.guildId!);
    const users = new Map((await getLinks()).map(x => [x.account_id, x.user_id]));
    const members = await fetchMembers(interaction.guild!, [...users.values()]);

    const standard = await board(guild.period_start, false, users, members);
    const streetBrawl = await board(guild.period_start, true, users, members);

    if(standard.length == 0 && streetBrawl.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed("No Games Recorded", "Nobody has played since the last /resetrecord")] });
    }

    const lines : string[] = [];
    if(standard.length > 0) lines.push("**Standard**", ...standard);
    if(streetBrawl.length > 0) lines.push(lines.length > 0 ? "\n**Street Brawl**" : "**Street Brawl**", ...streetBrawl);

    await interaction.editReply({ embeds: [{
        title: "Loserboard",
        description: lines.join("\n").slice(0, 4096),
        color: COLOURS.gold,
        footer: { text: "Since last reset" },
        timestamp: new Date(guild.period_start * 1000).toISOString()
    }] });
}
