import { type APIEmbed, type ChatInputCommandInteraction, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getMatch, getProfiles } from "../../deadlock/api.ts";
import { heroName, rankName } from "../../deadlock/assets.ts";
import { getLinkedMatchRows, getLinks, getMatchDetails } from "../../db/mod.ts";
import { COLOURS, errorEmbed, formatDuration, modeName, TEAM_NAMES } from "../embeds.ts";
import { formatSouls } from "../../lines/mod.ts";
import { fetchMembers } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("match")
    .setDescription("Show the scoreboard for a match")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption(x => x.setName("id").setDescription("Match ID").setRequired(true).setMinValue(1));

// deadlock-api often has a match in player histories before it has the full match details (and nobody's ingest sent it)
async function partialEmbed(interaction : ChatInputCommandInteraction, id : number) : Promise<APIEmbed> {
    const rows = await getLinkedMatchRows(id);
    const notReady = "deadlock-api hasn't processed the full match details yet. Try again later.";
    if(rows.length == 0) return errorEmbed("Match Not Found", notReady);

    const members = await fetchMembers(interaction.guild!, rows.map(x => x.user_id));
    const first = rows[0];

    return {
        title: `Match ${id}`,
        description: `${modeName(first.game_mode, first.match_mode)} · ${formatDuration(first.duration_s)} · <t:${first.start_time}:f>\n\n*${notReady} Showing linked players only.*`,
        color: COLOURS.gold,
        fields: await Promise.all(rows.map(async x => ({
            name: `${x.won ? "🏆" : "💀"} ${members.get(x.user_id)?.displayName ?? "Unknown"} (${await heroName(x.hero_id)})`,
            value: `K/D/A ${x.kills}/${x.deaths}/${x.assists}${x.game_mode == 4 ? "" : `\n${formatSouls(x.net_worth)} souls`}`,
            inline: true
        })))
    };
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply();

    const id = interaction.options.getInteger("id", true);
    const match = (await getMatchDetails(id) ?? await getMatch(id).catch(() => getMatch(id, true)).catch(() => undefined))?.match_info;
    if(!match) return await interaction.editReply({ embeds: [await partialEmbed(interaction, id)] });

    const profiles = new Map((await getProfiles(match.players.map(x => x.account_id)).catch(() => [])).map(x => [x.account_id, x.personaname]));
    const linked = new Map((await getLinks()).map(x => [x.account_id, x.user_id]));
    const members = await fetchMembers(interaction.guild!, match.players.filter(x => linked.has(x.account_id)).map(x => linked.get(x.account_id)!));

    const fields = [];
    for(const team of [0, 1]) {
        const players = match.players
            .filter(x => x.team == team)
            .sort((a, b) => match.game_mode == 4 ? b.kills - a.kills : b.net_worth - a.net_worth);

        const lines = await Promise.all(players.map(async x => {
            const member = members.get(linked.get(x.account_id) ?? "");
            const name = (member?.displayName ?? profiles.get(x.account_id) ?? "Anonymous").slice(0, 20);
            const souls = match.game_mode == 4 ? "" : ` (${formatSouls(x.net_worth)})`;
            const line = `${await heroName(x.hero_id)} - ${name} ${x.kills}/${x.deaths}/${x.assists}${souls}`;
            return member ? `**${line}**` : line;
        }));

        const badge = team == 0 ? match.average_badge_team0 : match.average_badge_team1;
        fields.push({
            name: `${match.winning_team == team ? "🏆 " : ""}${TEAM_NAMES[team]}${badge ? ` (${await rankName(badge)})` : ""}`,
            value: lines.join("\n").slice(0, 1024) || "-"
        });
    }

    await interaction.editReply({ embeds: [{
        title: `Match ${match.match_id}`,
        description: `${TEAM_NAMES[match.winning_team]} won · ${modeName(match.game_mode, match.match_mode)} · ${formatDuration(match.duration_s)} · <t:${match.start_time}:f>`,
        color: COLOURS.gold,
        fields
    }] });
}
