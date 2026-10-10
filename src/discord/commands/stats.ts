import { type APIEmbed, type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { BoardStore } from "../../board/BoardStore.ts";
import { getPlayerMatches, type Match } from "../../db/mod.ts";
import { heroName, rankName } from "../../deadlock/assets.ts";
import { now } from "../../helpers/now.ts";
import { getAccount } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed, formatDuration } from "../embeds.ts";

const DAY = 24 * 60 * 60;

const PERIODS : Record<string, { name: string, label: string, since: () => number }> = {
    all: { name: "All time", label: "All stored games", since: () => 0 },
    reset: { name: "Since last reset", label: "Since last reset", since: () => BoardStore.get().periodStart },
    day: { name: "Last 24 hours", label: "Last 24 hours", since: () => now() - DAY },
    week: { name: "Last 7 days", label: "Last 7 days", since: () => now() - 7 * DAY },
    month: { name: "Last 30 days", label: "Last 30 days", since: () => now() - 30 * DAY }
};

export const data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Deadlock stats for a linked player, standard and Street Brawl")
    .setContexts(InteractionContextType.Guild)
    .addUserOption(x => x.setName("user").setDescription("Who to look up (default yourself)"))
    .addStringOption(x => x
        .setName("period")
        .setDescription("How far back to count (default all time)")
        .addChoices(Object.entries(PERIODS).map(([value, x]) => ({ name: x.name, value })))
    );

const sum = (rows : Match[], f : (x : Match) => number) => rows.reduce((n, x) => n + f(x), 0);

const kda = (rows : Match[]) => (sum(rows, x => x.kills) + sum(rows, x => x.assists)) / Math.max(sum(rows, x => x.deaths), 1);

const pct = (n : number, of : number) => `${Math.round(n / of * 100)}%`;

function record(rows : Match[]) {
    const wins = sum(rows, x => x.won);
    return `${wins}W - ${rows.length - wins}L (${pct(wins, rows.length)})`;
}

function formatPlayed(s : number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor(s % 3600 / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Rows come newest first, so the current streak is the run at the front
function streaks(rows : Match[]) {
    let current = 0;
    while(current < rows.length && rows[current].won == rows[0].won) current++;

    let best = 0, run = 0;
    for(const x of rows) {
        run = x.won ? run + 1 : 0;
        best = Math.max(best, run);
    }
    return { current: rows[0]?.won ? current : -current, best };
}

async function topHeroes(rows : Match[]) {
    const byHero = Map.groupBy(rows, x => x.hero_id);
    const top = [...byHero].sort(([, a], [, b]) => b.length - a.length || kda(b) - kda(a)).slice(0, 5);

    return await Promise.all(top.map(async ([id, games]) =>
        `**${await heroName(id)}** - ${games.length} game${games.length == 1 ? "" : "s"} · ${pct(sum(games, x => x.won), games.length)} WR · ${kda(games).toFixed(1)} KDA`
    ));
}

async function modeEmbed(title : string, rows : Match[], streetBrawl : boolean) : Promise<APIEmbed> {
    const minutes = sum(rows, x => x.duration_s) / 60;
    const avg = (f : (x : Match) => number) => (sum(rows, f) / rows.length).toFixed(1);
    const { current, best } = streaks(rows);
    const top = [...rows].sort((a, b) => kda([b]) - kda([a]) || b.kills - a.kills)[0];
    const wins = sum(rows, x => x.won);

    const fields : APIEmbed["fields"] = [
        { name: "Record", value: record(rows), inline: true },
        { name: "KDA", value: `${kda(rows).toFixed(2)} (${avg(x => x.kills)} / ${avg(x => x.deaths)} / ${avg(x => x.assists)})`, inline: true },
        { name: "Streak", value: `${current > 0 ? `${current}W` : `${-current}L`} (best ${best}W)`, inline: true },
        { name: "Souls/min", value: Math.round(sum(rows, x => x.net_worth) / Math.max(minutes, 1)).toLocaleString("en-US"), inline: true },
        { name: "Last hits/min", value: (sum(rows, x => x.last_hits) / Math.max(minutes, 1)).toFixed(1), inline: true },
        { name: "Avg game", value: formatDuration(Math.round(sum(rows, x => x.duration_s) / rows.length)), inline: true },
        { name: "Time played", value: formatPlayed(sum(rows, x => x.duration_s)), inline: true },
        { name: "Best game", value: `${top.kills}/${top.deaths}/${top.assists} as ${await heroName(top.hero_id)} <t:${top.start_time}:R>`, inline: true }
    ];

    if(!streetBrawl) {
        const ranked = rows.filter(x => x.match_mode == 4);
        const unranked = rows.filter(x => x.match_mode != 4);
        if(ranked.length > 0 && unranked.length > 0) {
            fields.splice(1, 0, { name: "Ranked / Unranked", value: `Ranked ${record(ranked)}\nUnranked ${record(unranked)}`, inline: true });
        }

        if(ranked.length > 0) {
            const badge = ranked.find(x => x.badge)?.badge;
            const delta = sum(ranked, x => x.ranked_delta ?? 0);
            fields.push({ name: "Rank", value: `${await rankName(badge)} (${delta >= 0 ? "+" : ""}${delta})`, inline: true });
        }
    }

    fields.push({ name: "Top Heroes", value: (await topHeroes(rows)).join("\n") });

    return {
        title,
        color: wins / rows.length >= 0.5 ? COLOURS.green : COLOURS.red,
        fields
    };
}

export async function execute(interaction : ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const accountId = getAccount(user.id);
    if(accountId == undefined) {
        const who = user.id == interaction.user.id ? "You aren't" : `<@${user.id}> isn't`;
        return await interaction.reply({ embeds: [errorEmbed("Not Linked", `${who} linked to a Deadlock account, use /link`)] });
    }

    await interaction.deferReply();

    const period = PERIODS[interaction.options.getString("period") ?? "all"];
    const since = period.since();
    const [standard, streetBrawl] = await Promise.all([
        getPlayerMatches(accountId, since, false),
        getPlayerMatches(accountId, since, true)
    ]);

    const member = await interaction.guild!.members.fetch(user.id).catch(() => undefined);
    const name = member?.displayName ?? user.displayName;

    if(standard.length == 0 && streetBrawl.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed("No Games Recorded", `Nothing stored for ${name} (${period.label.toLowerCase()})`)] });
    }

    const embeds : APIEmbed[] = [];
    if(standard.length > 0) embeds.push(await modeEmbed("Standard", standard, false));
    if(streetBrawl.length > 0) embeds.push(await modeEmbed("Street Brawl", streetBrawl, true));

    embeds[0].author = { name: `${name}'s Stats`, icon_url: (member ?? user).displayAvatarURL() };
    embeds.at(-1)!.footer = { text: `${period.label} · ${standard.length + streetBrawl.length} games` };
    if(since > 0) embeds.at(-1)!.timestamp = new Date(since * 1000).toISOString();

    await interaction.editReply({ embeds });
}
