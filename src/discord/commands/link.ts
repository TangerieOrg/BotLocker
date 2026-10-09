import { type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getMatchHistory, getProfile, getProfiles, getRank, searchPlayers } from "../../deadlock/api.ts";
import { rankInfo } from "../../deadlock/assets.ts";
import { parseAccount } from "../../deadlock/steam.ts";
import { getLinkByAccount, getStreak, insertMatches, setLink } from "../../db/mod.ts";
import { errorEmbed, formatStreak, successEmbed } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Deadlock account")
    .setContexts(InteractionContextType.Guild)
    .addStringOption(x => x
        .setName("player")
        .setDescription("Steam name, profile URL or Steam ID")
        .setRequired(true)
        .setAutocomplete(true)
    );

export async function autocomplete(interaction : AutocompleteInteraction) {
    const query = interaction.options.getFocused().trim();
    if(query.length < 2) return await interaction.respond([]);

    const isId = /steamcommunity\.com|^\[?U:1:|^\d+$/i.test(query);
    const resolved = isId ? await parseAccount(query) : undefined;
    const results = isId ?
        (resolved != null ? await getProfiles([resolved]).catch(() => []) : []) :
        await searchPlayers(query, 10);
    await interaction.respond(results.map(x => ({
        name: `${x.personaname} (${x.account_id})`.slice(0, 100),
        value: x.account_id.toString()
    })));
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await linkAccount(interaction, interaction.user.id);
}

export async function linkAccount(interaction : ChatInputCommandInteraction, userId : string) {
    const accountId = await parseAccount(interaction.options.getString("player", true));
    const profile = accountId != null ? await getProfile(accountId).catch(() => undefined) : undefined;
    if(accountId == null || !profile) {
        console.log(`[Link] Couldn't find a profile for "${interaction.options.getString("player", true)}"`);
        return await interaction.editReply({ embeds: [errorEmbed("Profile Not Found")] });
    }

    const existing = await getLinkByAccount(accountId);
    if(existing && existing.user_id != userId) {
        return await interaction.editReply({ embeds: [errorEmbed("Account Already Linked", `That account is linked to <@${existing.user_id}>`)] });
    }

    const history = await getMatchHistory(accountId).catch(() => []);
    await insertMatches(history);
    await setLink(userId, accountId);
    console.log(`[Link] ${interaction.user.username} linked ${userId == interaction.user.id ? "themselves" : `<${userId}>`} to ${profile.personaname} (${accountId}), ${history.length} matches in history`);

    const rank = await getRank(accountId).catch(() => undefined);
    const info = await rankInfo(rank?.badge);

    const embed = successEmbed("Profile Linked Successfully", userId == interaction.user.id ? undefined : `Linked <@${userId}>`);
    embed.thumbnail = { url: profile.avatarfull };
    embed.fields = [
        { name: "Name", value: profile.personaname, inline: true },
        { name: "Rank", value: info.name, inline: true },
        { name: "Streak", value: formatStreak(await getStreak(accountId)), inline: true }
    ];
    if(history.length == 0) {
        embed.description = (embed.description ? embed.description + "\n\n" : "") + "No matches found yet. Match data comes from deadlock-api.com and can lag behind, so notifications may be delayed.";
    }

    await interaction.editReply({ embeds: [embed] });
}
