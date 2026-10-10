import { type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { toAccountId } from "../../helpers/steam.ts";
import { getUser, link, linkedAccounts } from "../../links/LinkStore.ts";
import { fetchPersona } from "../../steam/client.ts";
import { botProfileUrl, isFriend, Relationship, SteamStore } from "../../steam/SteamStore.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("link")
    .setDescription("Link your Deadlock account")
    .setContexts(InteractionContextType.Guild)
    .addStringOption(x => x
        .setName("player")
        .setDescription("Yourself from the list once you've added the bot on Steam, or a Steam ID / profile URL")
        .setRequired(true)
        .setAutocomplete(true)
    );

// Anyone who's added the bot on Steam and isn't linked yet, plus whatever ID they've typed
export async function autocomplete(interaction : AutocompleteInteraction) {
    const query = interaction.options.getFocused().trim();
    const typed = toAccountId(query);
    const { relations, personas } = SteamStore.get();
    const linked = linkedAccounts();

    const options = [...relations]
        .filter(([id, rel]) => !linked.has(id) && (rel == Relationship.Friend || rel == Relationship.RequestRecipient))
        .map(([id]) => ({ id, name: personas.get(id)?.name ?? id.toString() }))
        .filter(x => x.id == typed || x.name.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name));

    if(typed != null && !options.some(x => x.id == typed)) options.unshift({ id: typed, name: "Steam account" });

    await interaction.respond(options.slice(0, 25).map(x => ({
        name: `${x.name} (${x.id})`.slice(0, 100),
        value: x.id.toString()
    })));
}

export async function execute(interaction : ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await linkAccount(interaction, interaction.user.id);
}

// What they still need to do on Steam, the friends effect takes care of the bot's side
function friendNote(accountId : number) {
    const { relations, limited } = SteamStore.get();
    const bot = `[BotLocker Steam account](${botProfileUrl()})`;

    if(isFriend(accountId)) return undefined;
    if(relations.get(accountId) == Relationship.RequestRecipient) return "Accepting your friend request on Steam, your matches will be announced once that goes through.";
    if(limited) return `**Add the ${bot} as a friend on Steam**, your matches can only be seen once you're friends.`;
    return `**Accept the friend request from the ${bot} on Steam**, your matches can only be seen once you're friends.`;
}

export async function linkAccount(interaction : ChatInputCommandInteraction, userId : string) {
    const input = interaction.options.getString("player", true);
    const accountId = toAccountId(input);
    const persona = accountId != null ? await fetchPersona(accountId) : undefined;
    if(accountId == null || !persona) {
        console.log(`[Link] Couldn't find a profile for "${input}"`);
        return await interaction.editReply({ embeds: [errorEmbed("Profile Not Found", "Pick yourself from the list after adding the bot on Steam, or use a Steam ID or steamcommunity.com/profiles/ URL")] });
    }

    const existing = getUser(accountId);
    if(existing && existing != userId) {
        return await interaction.editReply({ embeds: [errorEmbed("Account Already Linked", `That account is linked to <@${existing}>`)] });
    }

    link(userId, accountId);
    console.log(`[Link] ${interaction.user.username} linked ${userId == interaction.user.id ? "themselves" : `<${userId}>`} to ${persona.name} (${accountId})`);

    const embed = successEmbed("Profile Linked Successfully", [
        userId == interaction.user.id ? undefined : `Linked <@${userId}>`,
        friendNote(accountId)
    ].filter(x => x).join("\n\n") || undefined);
    if(persona.avatar) embed.thumbnail = { url: persona.avatar };
    embed.fields = [{ name: "Name", value: persona.name, inline: true }];

    await interaction.editReply({ embeds: [embed] });
}
