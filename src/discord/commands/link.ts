import { type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getMatchHistory, getProfile, getProfiles, searchPlayers } from "../../deadlock/api.ts";
import { rankInfo } from "../../deadlock/assets.ts";
import { parseAccount } from "../../deadlock/steam.ts";
import { getLinkByAccount, getStreak, insertMatches, setLink } from "../../db/mod.ts";
import { addFriend, botProfileUrl, getPersonas, steamReady } from "../../steam/client.ts";
import { backfill } from "../../features/tracker/mod.ts";
import { getCurrentRank } from "../../features/rank.ts";
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

// deadlock-api first for the profile and history, the Steam bot fills in anything it doesn't have
async function findProfile(accountId : number) {
    const profile = await getProfile(accountId).catch(() => undefined);
    if(profile) return { name: profile.personaname, avatar: profile.avatarfull };
    return steamReady() ? (await getPersonas([accountId])).get(accountId) : undefined;
}

export async function linkAccount(interaction : ChatInputCommandInteraction, userId : string) {
    const accountId = await parseAccount(interaction.options.getString("player", true));
    const profile = accountId != null ? await findProfile(accountId) : undefined;
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

    const friend = steamReady() ? await addFriend(accountId) : undefined;

    // Steam bot history only if deadlock-api had nothing, and it needs them to be friends
    const matches = history.length > 0 ? history.length : friend == "friends" ? await backfill(accountId).catch(() => 0) : 0;
    console.log(`[Link] ${interaction.user.username} linked ${userId == interaction.user.id ? "themselves" : `<${userId}>`} to ${profile.name} (${accountId}), friend request ${friend ?? "not sent"}, ${matches} matches in history`);

    const info = await rankInfo(await getCurrentRank(accountId));

    const embed = successEmbed("Profile Linked Successfully", userId == interaction.user.id ? undefined : `Linked <@${userId}>`);
    if(profile.avatar) embed.thumbnail = { url: profile.avatar };
    embed.fields = [
        { name: "Name", value: profile.name, inline: true },
        { name: "Rank", value: info.name, inline: true },
        { name: "Streak", value: formatStreak(await getStreak(accountId)), inline: true }
    ];

    const bot = botProfileUrl();
    const notes : string[] = [];
    if(friend == "sent") notes.push(`**Accept the friend request from the [BotLocker Steam account](${bot}) on Steam** so your matches get announced straight away.`);
    else if(friend == undefined && bot) notes.push(`**Add the [BotLocker Steam account](${bot}) as a friend on Steam** so your matches get announced straight away.`);
    if(friend != "friends") notes.push("Until then match data comes from deadlock-api.com, which can lag behind.");
    if(notes.length > 0) embed.description = (embed.description ? embed.description + "\n\n" : "") + notes.join(" ");

    await interaction.editReply({ embeds: [embed] });
}
