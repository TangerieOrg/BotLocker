import { type APIEmbed, ActionRowBuilder, type ChatInputCommandInteraction, InteractionContextType, type MessageActionRowComponentBuilder, SlashCommandBuilder, type User, UserSelectMenuBuilder } from "discord.js";
import { getTeamMatches, type Match } from "../../db/mod.ts";
import { heroName, rankName } from "../../deadlock/assets.ts";
import { formatPlayed, kda, PERIODS, pct, record, streaks, sum } from "../../helpers/stats.ts";
import { getAccount } from "../../links/LinkStore.ts";
import { COLOURS, errorEmbed, formatDuration } from "../embeds.ts";
import { interactive, periodRow, type View } from "../interactive.ts";

// Street Brawl teams max out at 4, so a bigger group can only have played standard
const STREET_BRAWL_MAX = 4;
const EXTRA_PARTNERS = 4;

export const data = (() => {
    const command = new SlashCommandBuilder()
        .setName("team")
        .setDescription("How linked players do when they're on the same team")
        .setContexts(InteractionContextType.Guild)
        .addUserOption(x => x.setName("partner").setDescription("Who they play with").setRequired(true));

    for(let i = 2; i <= EXTRA_PARTNERS + 1; i++) {
        command.addUserOption(x => x.setName(`partner${i}`).setDescription("Another teammate"));
    }

    return command
        .addUserOption(x => x.setName("user").setDescription("The first player (default yourself)"))
        .addStringOption(x => x
            .setName("period")
            .setDescription("How far back to count (default all time)")
            .addChoices(Object.entries(PERIODS).map(([value, x]) => ({ name: x.name, value })))
        );
})();

async function pairings(games : Match[][]) {
    const byHeroes = Map.groupBy(games, x => x.map(y => y.hero_id).join(":"));
    const top = [...byHeroes.values()].sort((x, y) => y.length - x.length).slice(0, 5);

    return await Promise.all(top.map(async group => {
        const heroes = await Promise.all(group[0].map(x => heroName(x.hero_id)));
        return `${heroes.map(x => `**${x}**`).join(" + ")} - ${group.length} game${group.length == 1 ? "" : "s"} · ${pct(sum(group, x => x[0].won), group.length)} WR`;
    }));
}

async function modeEmbed(title : string, games : Match[][], streetBrawl : boolean, names : string[]) : Promise<APIEmbed> {
    const players = names.map((_, i) => games.map(x => x[i]));
    const first = players[0];
    const { current, best } = streaks(first);
    const wins = sum(first, x => x.won);
    const played = sum(first, x => x.duration_s);

    const fields : APIEmbed["fields"] = [
        { name: "Record together", value: record(first), inline: true },
        { name: "Streak", value: `${current > 0 ? `${current}W` : `${-current}L`} (best ${best}W)`, inline: true },
        { name: "Avg game", value: formatDuration(Math.round(played / games.length)), inline: true },
        ...names.map((name, i) => ({ name: `${name} KDA`, value: kda(players[i]).toFixed(2), inline: true })),
        { name: "Time played", value: formatPlayed(played), inline: true }
    ];

    if(!streetBrawl) {
        const ranked = first.filter(x => x.match_mode == 4);
        const unranked = first.filter(x => x.match_mode != 4);
        if(ranked.length > 0 && unranked.length > 0) {
            fields.splice(1, 0, { name: "Ranked / Unranked", value: `Ranked ${record(ranked)}\nUnranked ${record(unranked)}`, inline: true });
        }
        if(ranked.length > 0) {
            const lines = await Promise.all(players.map(async (rows, i) => {
                const rankedRows = rows.filter(x => x.match_mode == 4);
                const delta = sum(rankedRows, x => x.ranked_delta ?? 0);
                return `${names[i]}: ${await rankName(rankedRows.find(x => x.badge)?.badge)} (${delta >= 0 ? "+" : ""}${delta})`;
            }));
            fields.push({ name: "Rank gained together", value: lines.join("\n") });
        }
    }

    fields.push({ name: "Most played pairings", value: (await pairings(games)).join("\n") });

    const form = first.slice(0, 10).reverse().map(x => x.won ? "W" : "L").join("");
    fields.push({ name: `Last ${form.length} (oldest → newest)`, value: `\`${form}\`` });

    return { title, color: wins / games.length >= 0.5 ? COLOURS.green : COLOURS.red, fields };
}

export async function execute(interaction : ChatInputCommandInteraction) {
    const first = interaction.options.getUser("user") ?? interaction.user;
    const partners : User[] = [
        interaction.options.getUser("partner", true),
        ...Array.from({ length: EXTRA_PARTNERS }, (_, i) => interaction.options.getUser(`partner${i + 2}`)).filter(x => x != null)
    ];

    if(new Set([first, ...partners].map(x => x.id)).size != partners.length + 1) {
        return await interaction.reply({ embeds: [errorEmbed("Pick Different People", "Each player can only be picked once")] });
    }

    const unlinked = [first, ...partners].filter(x => getAccount(x.id) == undefined).map(x => `<@${x.id}>`);
    if(unlinked.length > 0) {
        return await interaction.reply({ embeds: [errorEmbed("Not Linked", `${unlinked.join(", ")} ${unlinked.length > 1 ? "aren't" : "isn't"} linked to a Deadlock account, use /link`)] });
    }

    await interaction.deferReply();

    const body = async (key : string, users : User[]) : Promise<APIEmbed[]> => {
        const accounts = users.map(x => getAccount(x.id));
        const missing = users.filter((_, i) => accounts[i] == undefined).map(x => `<@${x.id}>`);
        if(missing.length > 0) {
            return [errorEmbed("Not Linked", `${missing.join(", ")} ${missing.length > 1 ? "aren't" : "isn't"} linked to a Deadlock account, use /link`)];
        }

        const accountIds = accounts as number[];
        const period = PERIODS[key];
        const since = period.since();
        const [standard, streetBrawl] = await Promise.all([
            getTeamMatches(accountIds, since, false),
            users.length > STREET_BRAWL_MAX ? [] : getTeamMatches(accountIds, since, true)
        ]);

        const names = await Promise.all(users.map(async x => (await interaction.guild!.members.fetch(x.id).catch(() => undefined))?.displayName ?? x.displayName));

        if(standard.length == 0 && streetBrawl.length == 0) {
            return [errorEmbed("No Games Together", `${names.join(", ")} have no stored games on the same team (${period.label.toLowerCase()})`)];
        }

        const embeds : APIEmbed[] = [];
        if(standard.length > 0) embeds.push(await modeEmbed("Standard", standard, false, names));
        if(streetBrawl.length > 0) embeds.push(await modeEmbed("Street Brawl", streetBrawl, true, names));

        embeds[0].author = { name: names.join(" + ") };
        embeds.at(-1)!.footer = { text: [period.label, `${standard.length + streetBrawl.length} games`, ...users.length > STREET_BRAWL_MAX ? ["standard only"] : []].join(" · ") };
        if(since > 0) embeds.at(-1)!.timestamp = new Date(since * 1000).toISOString();

        return embeds;
    };

    type State = { period : string, partners : User[] };
    const render = async (state : State) : Promise<View> => ({
        embeds: await body(state.period, [first, ...state.partners]),
        components: [
            periodRow(PERIODS, state.period),
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId("partners")
                    .setPlaceholder("Teammates")
                    .setMinValues(1)
                    .setMaxValues(EXTRA_PARTNERS + 1)
                    .setDefaultUsers(state.partners.map(x => x.id))
            )
        ]
    });

    await interactive<State>(interaction, { period: interaction.options.getString("period") ?? "all", partners }, render, (state, i) => {
        if(i.isStringSelectMenu()) return { ...state, period: i.values[0] };

        const picked = [...i.users.values()].filter(x => x.id != first.id);
        if(picked.length == 0) return `Pick at least one teammate other than ${first.displayName}`;
        return { ...state, partners: picked };
    });
}
