import { type ChatInputCommandInteraction, type GuildMember, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getPeriodTotals, getStreak } from "../../db/mod.ts";
import { PERIODS } from "../../helpers/stats.ts";
import { lossWindowStart } from "../../helpers/window.ts";
import { getUser, LinkStore } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { interactive, periodRow, type View } from "../interactive.ts";
import { fetchMembers } from "../util.ts";

// The default is the 2 week window used by announcements and status lines, the dropdown widens or narrows it
const DEFAULT_PERIOD = "fortnight";
const BOARD_PERIODS : typeof PERIODS = {
    day: PERIODS.day,
    week: PERIODS.week,
    fortnight: { name: "Last 2 weeks", label: "Last 2 weeks", since: lossWindowStart },
    month: PERIODS.month,
    all: PERIODS.all
};

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

    const render = async ({ period : key } : { period : string }) : Promise<View> => {
        const period = BOARD_PERIODS[key];
        const since = period.since();
        const members = await fetchMembers(interaction.guild!, [...LinkStore.get().links.keys()]);

        const standard = await board(since, false, members);
        const streetBrawl = await board(since, true, members);
        const components = [periodRow(BOARD_PERIODS, key)];

        if(standard.length == 0 && streetBrawl.length == 0) {
            return { embeds: [errorEmbed("No Games Recorded", `Nobody has played in the period: ${period.label.toLowerCase()}`)], components };
        }

        const lines : string[] = [];
        if(standard.length > 0) lines.push("**Standard**", ...standard);
        if(streetBrawl.length > 0) lines.push(lines.length > 0 ? "\n**Street Brawl**" : "**Street Brawl**", ...streetBrawl);

        return {
            embeds: [{
                title: "Loserboard",
                description: lines.join("\n").slice(0, 4096),
                color: COLOURS.gold,
                footer: { text: period.label },
                ...(since > 0 && { timestamp: new Date(since * 1000).toISOString() })
            }],
            components
        };
    };

    await interactive(interaction, { period: DEFAULT_PERIOD }, render, (state, i) => i.isStringSelectMenu() ? { period: i.values[0] } : state);
}
