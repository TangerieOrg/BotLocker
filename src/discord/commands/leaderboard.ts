import { type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getDeadTotals, getPeriodTotals, getStreak } from "../../db/mod.ts";
import { logger } from "../../helpers/log.ts";
import { formatPlayed, PERIODS } from "../../helpers/stats.ts";
import { lossWindowStart } from "../../helpers/window.ts";
import { getUser, LinkStore } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { interactive, periodRow, type View } from "../interactive.ts";
import { displayNames } from "../names.ts";

const { error } = logger("Leaderboard");

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

// Standard matches only
async function losers(since : number, names : Map<string, string>) {
    const rows = await Promise.all((await getPeriodTotals(since))
        .flatMap(x => {
            const name = names.get(getUser(x.account_id) ?? "");
            return name ? [{ ...x, name }] : [];
        })
        .map(async x => ({
            ...x,
            score: x.losses / x.matches,
            streak: await getStreak(x.account_id)
        })));

    return rows.sort((a, b) => b.score - a.score || b.losses - a.losses);
}

// Replays lags behind and is optional, so it only covers ingested matches and anything that goes wrong just drops the section
async function timeDead(players : { account_id : number, name : string, matches : number }[], since : number) {
    const totals = await getDeadTotals(players.map(x => x.account_id), since).catch(err => {
        error("Couldn't read time dead from replays", err);
        return [];
    });
    const byAccount = new Map(totals.map(x => [x.account_id, x]));

    return players
        .flatMap(x => {
            const dead = byAccount.get(x.account_id);
            return dead ? [{ ...x, dead, missing: Math.max(x.matches - dead.matches, 0) }] : [];
        })
        .sort((a, b) => b.dead.avg_pct - a.dead.avg_pct)
        .map((x, i) => `**${i + 1}**. ${x.name} - ${x.dead.avg_pct.toFixed(1)}% Dead [${formatPlayed(x.dead.dead_s)}]${x.missing > 0 ? ` (${x.missing} missing)` : ""}`);
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply();

    const render = async ({ period : key } : { period : string }) : Promise<View> => {
        const period = BOARD_PERIODS[key];
        const since = period.since();
        const names = await displayNames(interaction.guild!, [...LinkStore.get().links.keys()]);

        const players = await losers(since, names);
        const components = [periodRow(BOARD_PERIODS, key)];

        if(players.length == 0) {
            return { embeds: [errorEmbed("No Games Recorded", `Nobody has played in the period: ${period.label.toLowerCase()}`)], components };
        }

        const lines = players.map((x, i) => `**${i + 1}**. ${x.name} - ${Math.round(x.score * 100)}% Lost [${x.losses}/${x.matches}]${x.streak <= -3 ? " 🔥 tilted" : ""}`);
        const dead = await timeDead(players, since);
        if(dead.length > 0) lines.push("\n**Time Dead**", ...dead);

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
