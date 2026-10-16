import { type ChatInputCommandInteraction, type GuildMember, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getPeriodTotals, getStreak } from "../../db/mod.ts";
import { now } from "../../helpers/now.ts";
import { getUser, LinkStore } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { fetchMembers } from "../util.ts";

const WINDOW_S = 7 * 24 * 60 * 60;

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

    // Sliding window ending now, rather than counting from the last /resetrecord
    const since = now() - WINDOW_S;
    const members = await fetchMembers(interaction.guild!, [...LinkStore.get().links.keys()]);

    const standard = await board(since, false, members);
    const streetBrawl = await board(since, true, members);

    if(standard.length == 0 && streetBrawl.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed("No Games Recorded", "Nobody has played in the last 7 days")] });
    }

    const lines : string[] = [];
    if(standard.length > 0) lines.push("**Standard**", ...standard);
    if(streetBrawl.length > 0) lines.push(lines.length > 0 ? "\n**Street Brawl**" : "**Street Brawl**", ...streetBrawl);

    await interaction.editReply({ embeds: [{
        title: "Loserboard",
        description: lines.join("\n").slice(0, 4096),
        color: COLOURS.gold,
        footer: { text: "Last 7 days" },
        timestamp: new Date(since * 1000).toISOString()
    }] });
}
