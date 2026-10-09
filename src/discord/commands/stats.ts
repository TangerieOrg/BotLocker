import { type APIEmbed, type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getHeroStats, getProfile, getRank } from "../../deadlock/api.ts";
import { hero, rankInfo, searchHeroes } from "../../deadlock/assets.ts";
import { getGuild, getRecentMatches, getStreak, getTotals } from "../../db/mod.ts";
import { COLOURS, errorEmbed, formatStreak, percent, ratio, totalsFields } from "../embeds.ts";
import { getTargetLink } from "../util.ts";

const DAY = 24 * 60 * 60;

const PERIODS = {
    "3m": { name: "Last 3 Months", days: 91 },
    "1m": { name: "Last Month", days: 30 },
    "1w": { name: "Last Week", days: 7 },
    "reset": { name: "Since Last Reset", days: 0 },
    "all": { name: "All Time", days: 0 }
};

type Period = keyof typeof PERIODS;

const MODES = [
    { name: "Standard", streetBrawl: false, gameMode: "normal" },
    { name: "Street Brawl", streetBrawl: true, gameMode: "street_brawl" }
] as const;

export const data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Get Deadlock stats")
    .setContexts(InteractionContextType.Guild)
    .addUserOption(x => x.setName("user").setDescription("User to get stats for"))
    .addIntegerOption(x => x.setName("hero").setDescription("Only show stats for this hero").setAutocomplete(true))
    .addStringOption(x => x
        .setName("period")
        .setDescription("Time period (default last 3 months)")
        .addChoices(...Object.entries(PERIODS).map(([value, x]) => ({ name: x.name, value })))
    );

export async function autocomplete(interaction : AutocompleteInteraction) {
    const heroes = await searchHeroes(interaction.options.getFocused());
    await interaction.respond(heroes.slice(0, 25).map(x => ({ name: x.name, value: x.id })));
}

async function sinceFor(period : Period, guildId : string) {
    if(period == "all") return 0;
    if(period == "reset") return (await getGuild(guildId)).period_start;
    return Math.floor(Date.now() / 1000) - PERIODS[period].days * DAY;
}

async function heroEmbeds(accountId : number, name : string, heroId : number, since : number, periodName : string) : Promise<APIEmbed[]> {
    const h = await hero(heroId);
    if(!h) return [errorEmbed("Invalid Hero")];

    const embeds : APIEmbed[] = [];
    for(const mode of MODES) {
        const stats = (await getHeroStats(accountId, heroId, mode.gameMode, since)).at(0);
        if(!stats || stats.matches_played == 0) continue;

        embeds.push({
            title: `${name}'s ${h.name} Stats - ${mode.name}`,
            description: periodName,
            color: COLOURS.gold,
            thumbnail: { url: h.images.icon_image_small },
            fields: [
                { name: "Matches", value: stats.matches_played.toString(), inline: true },
                { name: "Wins", value: stats.wins.toString(), inline: true },
                { name: "Losses", value: (stats.matches_played - stats.wins).toString(), inline: true },
                { name: "Win Rate", value: percent(stats.wins, stats.matches_played), inline: true },
                { name: "K/D/A", value: `${stats.kills}/${stats.deaths}/${stats.assists}`, inline: true },
                { name: "KDA", value: ratio(stats.kills + stats.assists, stats.deaths), inline: true },
                ...(mode.streetBrawl ? [] : [{ name: "Souls/Min", value: Math.round(stats.networth_per_min).toString(), inline: true }]),
                { name: "Damage/Min", value: Math.round(stats.damage_per_min).toString(), inline: true },
                { name: "Accuracy", value: `${Math.round(stats.accuracy * 100)}%`, inline: true },
                { name: "Time Played", value: `${Math.round(stats.time_played / 3600)}h`, inline: true },
                { name: "Last Played", value: `<t:${stats.last_played}:R>`, inline: true }
            ]
        });
    }

    if(embeds.length == 0) return [errorEmbed(`${name} has no games on ${h.name}`, periodName)];
    return embeds;
}

export async function execute(interaction : ChatInputCommandInteraction) {
    const { link, error } = await getTargetLink(interaction);
    if(!link) return await interaction.reply({ embeds: [error!] });

    await interaction.deferReply();

    const period = (interaction.options.getString("period") ?? "3m") as Period;
    const periodName = PERIODS[period].name;
    const since = await sinceFor(period, interaction.guildId!);

    const member = await interaction.guild!.members.fetch(link.user_id).catch(() => undefined);
    const name = member?.displayName ?? (await getProfile(link.account_id).catch(() => undefined))?.personaname ?? link.account_id.toString();

    const heroId = interaction.options.getInteger("hero");
    if(heroId != null) {
        return await interaction.editReply({ embeds: await heroEmbeds(link.account_id, name, heroId, since, periodName) });
    }

    const rank = await getRank(link.account_id).catch(() => undefined);
    const info = await rankInfo(rank?.badge);

    const embeds : APIEmbed[] = [];
    for(const mode of MODES) {
        const totals = await getTotals(link.account_id, since, mode.streetBrawl);
        if(totals.matches == 0) continue;

        const form = (await getRecentMatches(link.account_id, 10, mode.streetBrawl)).map(x => x.won ? "W" : "L").join("");
        embeds.push({
            title: `${name}'s ${mode.name} Stats`,
            description: periodName,
            color: COLOURS.gold,
            thumbnail: !mode.streetBrawl && info.image ? { url: info.image } : undefined,
            fields: [
                ...totalsFields(totals),
                ...(mode.streetBrawl ? [] : [{ name: "Rank", value: info.name, inline: true }]),
                { name: "Streak", value: formatStreak(await getStreak(link.account_id, undefined, mode.streetBrawl)), inline: true },
                { name: "Form", value: form || "-", inline: true }
            ]
        });
    }

    if(embeds.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed(`${name} has no games`, periodName)] });
    }

    await interaction.editReply({ embeds });
}
