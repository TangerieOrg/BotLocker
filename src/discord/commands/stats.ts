import { type APIEmbed, type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getPlayerMatches, type Match } from "../../db/mod.ts";
import { heroIcon, heroList, heroName, rankName } from "../../deadlock/assets.ts";
import { formatPlayed, kda, PERIODS, pct, record, streaks, sum } from "../../helpers/stats.ts";
import { getAccount } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed, formatDuration } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Deadlock stats for a linked player, standard and Street Brawl")
    .setContexts(InteractionContextType.Guild)
    .addUserOption(x => x.setName("user").setDescription("Who to look up (default yourself)"))
    .addStringOption(x => x
        .setName("period")
        .setDescription("How far back to count (default all time)")
        .addChoices(Object.entries(PERIODS).map(([value, x]) => ({ name: x.name, value })))
    )
    .addStringOption(x => x
        .setName("hero")
        .setDescription("Only count games on this hero (default all heroes)")
        .setAutocomplete(true)
    );

export async function autocomplete(interaction : AutocompleteInteraction) {
    const query = interaction.options.getFocused().trim().toLowerCase();
    const options = (await heroList())
        .filter(x => x.name.toLowerCase().includes(query))
        .slice(0, 25)
        .map(x => ({ name: x.name, value: x.id.toString() }));
    await interaction.respond(options);
}

async function topHeroes(rows : Match[]) {
    const byHero = Map.groupBy(rows, x => x.hero_id);
    const top = [...byHero].sort(([, a], [, b]) => b.length - a.length || kda(b) - kda(a)).slice(0, 5);

    return await Promise.all(top.map(async ([id, games]) =>
        `**${await heroName(id)}** - ${games.length} game${games.length == 1 ? "" : "s"} · ${pct(sum(games, x => x.won), games.length)} WR · ${kda(games).toFixed(1)} KDA`
    ));
}

async function modeEmbed(title : string, rows : Match[], streetBrawl : boolean, heroFiltered : boolean) : Promise<APIEmbed> {
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

    if(!heroFiltered) fields.push({ name: "Top Heroes", value: (await topHeroes(rows)).join("\n") });

    // Rows are newest first, flipped so it reads oldest to newest like a form guide
    const form = rows.slice(0, 10).reverse().map(x => x.won ? "W" : "L").join("");
    fields.push({ name: `Last ${form.length} (oldest → newest)`, value: `\`${form}\`` });

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

    const heroInput = interaction.options.getString("hero");
    const hero = heroInput == null ? undefined : (await heroList()).find(x => x.id.toString() == heroInput || x.name.toLowerCase() == heroInput.toLowerCase());
    if(heroInput != null && !hero) {
        return await interaction.editReply({ embeds: [errorEmbed("Unknown Hero", "Pick a hero from the list as you type")] });
    }

    const period = PERIODS[interaction.options.getString("period") ?? "all"];
    const since = period.since();
    const [standard, streetBrawl] = await Promise.all([
        getPlayerMatches(accountId, since, false, hero?.id),
        getPlayerMatches(accountId, since, true, hero?.id)
    ]);

    const member = await interaction.guild!.members.fetch(user.id).catch(() => undefined);
    const name = member?.displayName ?? user.displayName;

    if(standard.length == 0 && streetBrawl.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed("No Games Recorded", `Nothing stored for ${name}${hero ? ` on ${hero.name}` : ""} (${period.label.toLowerCase()})`)] });
    }

    const embeds : APIEmbed[] = [];
    if(standard.length > 0) embeds.push(await modeEmbed("Standard", standard, false, !!hero));
    if(streetBrawl.length > 0) embeds.push(await modeEmbed("Street Brawl", streetBrawl, true, !!hero));

    embeds[0].author = { name: `${name}'s ${hero ? `${hero.name} ` : ""}Stats`, icon_url: (member ?? user).displayAvatarURL() };
    const icon = hero ? await heroIcon(hero.id) : undefined;
    if(icon) embeds[0].thumbnail = { url: icon };
    embeds.at(-1)!.footer = { text: `${period.label} · ${standard.length + streetBrawl.length} games` };
    if(since > 0) embeds.at(-1)!.timestamp = new Date(since * 1000).toISOString();

    await interaction.editReply({ embeds });
}
