import { type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getProfiles, searchPlayers } from "../../deadlock/api.ts";
import { rankInfo } from "../../deadlock/assets.ts";
import { parseAccount } from "../../deadlock/steam.ts";
import { getLinkByAccount, getStreak, setLink } from "../../db/mod.ts";
import { addFriend, botProfileUrl, getPersonas, steamReady } from "../../steam/client.ts";
import { getCurrentRank } from "../../steam/gc.ts";
import { backfill } from "../../features/tracker/mod.ts";
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
    if(!steamReady()) {
        return await interaction.editReply({ embeds: [errorEmbed("Steam Bot Offline", "The Steam bot isn't connected right now, try again in a minute")] });
    }

    const accountId = await parseAccount(interaction.options.getString("player", true));
    const profile = accountId != null ? (await getPersonas([accountId])).get(accountId) : undefined;
    if(accountId == null || !profile) {
        console.log(`[Link] Couldn't find a profile for "${interaction.options.getString("player", true)}"`);
        return await interaction.editReply({ embeds: [errorEmbed("Profile Not Found")] });
    }

    const existing = await getLinkByAccount(accountId);
    if(existing && existing.user_id != userId) {
        return await interaction.editReply({ embeds: [errorEmbed("Account Already Linked", `That account is linked to <@${existing.user_id}>`)] });
    }

    await setLink(userId, accountId);
    const friend = await addFriend(accountId);

    // Their history is only visible once they're friends with the bot, otherwise it's backfilled when they accept
    const matches = friend == "friends" ? await backfill(accountId).catch(() => 0) : 0;
    console.log(`[Link] ${interaction.user.username} linked ${userId == interaction.user.id ? "themselves" : `<${userId}>`} to ${profile.name} (${accountId}), friend request ${friend ?? "failed"}, ${matches} matches in history`);

    const info = await rankInfo(friend == "friends" ? await getCurrentRank(accountId) : undefined);

    const embed = successEmbed("Profile Linked Successfully", userId == interaction.user.id ? undefined : `Linked <@${userId}>`);
    if(profile.avatar) embed.thumbnail = { url: profile.avatar };
    embed.fields = [
        { name: "Name", value: profile.name, inline: true },
        { name: "Rank", value: info.name, inline: true },
        { name: "Streak", value: formatStreak(await getStreak(accountId)), inline: true }
    ];

    const bot = botProfileUrl();
    const note = friend == "friends" ?
        undefined :
        friend == "sent" ?
            `**Accept the friend request from the [BotLocker Steam account](${bot}) on Steam**, matches can't be tracked until you do.` :
            `Couldn't send a friend request, **add the [BotLocker Steam account](${bot}) as a friend on Steam** so matches can be tracked.`;
    if(note) embed.description = (embed.description ? embed.description + "\n\n" : "") + note;

    await interaction.editReply({ embeds: [embed] });
}
