import { type APIEmbed, type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getDuoMatches, type Match } from "../../db/mod.ts";
import { heroName, rankName } from "../../deadlock/assets.ts";
import { formatPlayed, kda, PERIODS, pct, record, streaks, sum } from "../../helpers/stats.ts";
import { getAccount } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed, formatDuration } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("duo")
    .setDescription("How two linked players do when they're on the same team")
    .setContexts(InteractionContextType.Guild)
    .addUserOption(x => x.setName("partner").setDescription("Who they play with").setRequired(true))
    .addUserOption(x => x.setName("user").setDescription("The other half of the duo (default yourself)"))
    .addStringOption(x => x
        .setName("period")
        .setDescription("How far back to count (default all time)")
        .addChoices(Object.entries(PERIODS).map(([value, x]) => ({ name: x.name, value })))
    );

type Pair = { a : Match, b : Match };

async function pairings(rows : Pair[]) {
    const byPair = Map.groupBy(rows, x => `${x.a.hero_id}:${x.b.hero_id}`);
    const top = [...byPair.values()].sort((x, y) => y.length - x.length).slice(0, 5);

    return await Promise.all(top.map(async games =>
        `**${await heroName(games[0].a.hero_id)}** + **${await heroName(games[0].b.hero_id)}** - ${games.length} game${games.length == 1 ? "" : "s"} · ${pct(sum(games, x => x.a.won), games.length)} WR`
    ));
}

async function modeEmbed(title : string, rows : Pair[], streetBrawl : boolean, nameA : string, nameB : string) : Promise<APIEmbed> {
    const as = rows.map(x => x.a);
    const bs = rows.map(x => x.b);
    const { current, best } = streaks(as);
    const wins = sum(as, x => x.won);
    const played = sum(as, x => x.duration_s);

    const fields : APIEmbed["fields"] = [
        { name: "Record together", value: record(as), inline: true },
        { name: "Streak", value: `${current > 0 ? `${current}W` : `${-current}L`} (best ${best}W)`, inline: true },
        { name: "Avg game", value: formatDuration(Math.round(played / rows.length)), inline: true },
        { name: `${nameA} KDA`, value: kda(as).toFixed(2), inline: true },
        { name: `${nameB} KDA`, value: kda(bs).toFixed(2), inline: true },
        { name: "Time played", value: formatPlayed(played), inline: true }
    ];

    if(!streetBrawl) {
        const ranked = as.filter(x => x.match_mode == 4);
        const unranked = as.filter(x => x.match_mode != 4);
        if(ranked.length > 0 && unranked.length > 0) {
            fields.splice(1, 0, { name: "Ranked / Unranked", value: `Ranked ${record(ranked)}\nUnranked ${record(unranked)}`, inline: true });
        }
        if(ranked.length > 0) {
            const delta = (x : Match[]) => sum(x, y => y.ranked_delta ?? 0);
            const rankOf = async (x : Match[]) => await rankName(x.find(y => y.badge)?.badge);
            const rb = bs.filter(x => x.match_mode == 4);
            fields.push({ name: "Rank gained together", value: `${nameA}: ${await rankOf(ranked)} (${delta(ranked) >= 0 ? "+" : ""}${delta(ranked)})\n${nameB}: ${await rankOf(rb)} (${delta(rb) >= 0 ? "+" : ""}${delta(rb)})` });
        }
    }

    fields.push({ name: "Most played pairings", value: (await pairings(rows)).join("\n") });

    const form = as.slice(0, 10).reverse().map(x => x.won ? "W" : "L").join("");
    fields.push({ name: `Last ${form.length} (oldest → newest)`, value: `\`${form}\`` });

    return { title, color: wins / rows.length >= 0.5 ? COLOURS.green : COLOURS.red, fields };
}

export async function execute(interaction : ChatInputCommandInteraction) {
    const user = interaction.options.getUser("user") ?? interaction.user;
    const partner = interaction.options.getUser("partner", true);

    if(user.id == partner.id) {
        return await interaction.reply({ embeds: [errorEmbed("Pick Two People", "A duo needs two different players")] });
    }

    const accountA = getAccount(user.id);
    const accountB = getAccount(partner.id);
    const unlinked = [[user, accountA], [partner, accountB]].filter(([, id]) => id == undefined).map(([u]) => `<@${(u as typeof user).id}>`);
    if(unlinked.length > 0) {
        return await interaction.reply({ embeds: [errorEmbed("Not Linked", `${unlinked.join(" and ")} ${unlinked.length > 1 ? "aren't" : "isn't"} linked to a Deadlock account, use /link`)] });
    }

    await interaction.deferReply();

    const period = PERIODS[interaction.options.getString("period") ?? "all"];
    const since = period.since();
    const [standard, streetBrawl] = await Promise.all([
        getDuoMatches(accountA!, accountB!, since, false),
        getDuoMatches(accountA!, accountB!, since, true)
    ]);

    const nameOf = async (u : typeof user) => (await interaction.guild!.members.fetch(u.id).catch(() => undefined))?.displayName ?? u.displayName;
    const [nameA, nameB] = await Promise.all([nameOf(user), nameOf(partner)]);

    if(standard.length == 0 && streetBrawl.length == 0) {
        return await interaction.editReply({ embeds: [errorEmbed("No Games Together", `${nameA} and ${nameB} have no stored games on the same team (${period.label.toLowerCase()})`)] });
    }

    const embeds : APIEmbed[] = [];
    if(standard.length > 0) embeds.push(await modeEmbed("Standard", standard, false, nameA, nameB));
    if(streetBrawl.length > 0) embeds.push(await modeEmbed("Street Brawl", streetBrawl, true, nameA, nameB));

    embeds[0].author = { name: `${nameA} + ${nameB}` };
    embeds.at(-1)!.footer = { text: `${period.label} · ${standard.length + streetBrawl.length} games · same team, not necessarily queued together` };
    if(since > 0) embeds.at(-1)!.timestamp = new Date(since * 1000).toISOString();

    await interaction.editReply({ embeds });
}
