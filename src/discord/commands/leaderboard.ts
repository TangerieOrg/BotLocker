import { type ChatInputCommandInteraction, type GuildMember, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { BoardStore } from "../../board/BoardStore.ts";
import { getPeriodTotals, getStreak } from "../../db/mod.ts";
import { getUser, LinkStore } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Get the (loser) board")
    .setContexts(InteractionContextType.Guild);

async function board(since : number, streetBrawl : boolean, members : Map<string, GuildMember>) {
    const rows = await Promise.all((await getPeriodTotals(since, streetBrawl))
        .map(x => ({ ...x, member: members.get(getUser(x.account_id) ?? "") }))
        .filter(x => x.member)
        .map(async x => ({
            ...x,
            score: x.losses / x.matches,
            streak: await getStreak(x.account_id)
        })));

    return rows
        .sort((a, b) => b.score - a.score || b.losses - a.losses)
        .map((x, i) => `**${i + 1}**. ${x.member!.displayName} - ${Math.round(x.score * 100)}% Lost [${x.losses}/${x.matches}]${x.streak <= -3 ? " 🔥 tilted" : ""}`);
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply();

    const { periodStart } = BoardStore.get();
    const members = await fetchMembers(interaction.guild!, [...LinkStore.get().links.keys()]);

    const standard = await board(periodStart, false, members);
    const streetBrawl = await board(periodStart, true, members);

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
        timestamp: new Date(periodStart * 1000).toISOString()
    }] });
}
