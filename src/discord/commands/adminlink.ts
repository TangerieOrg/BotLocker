import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { errorEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";
import { linkAccount } from "./link.ts";

export { autocomplete } from "./link.ts";

export const data = new SlashCommandBuilder()
    .setName("adminlink")
    .setDescription("Link someone else's Deadlock account")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(x => x.setName("user").setDescription("User to link").setRequired(true))
    .addStringOption(x => x
        .setName("player")
        .setDescription("Steam name, profile URL or Steam ID")
        .setRequired(true)
        .setAutocomplete(true)
    );

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!await isOwner(interaction)) {
        return await interaction.reply({ embeds: [errorEmbed("Permissions Error", "Only the bot owner can link other people")], flags: MessageFlags.Ephemeral });
    }

    const user = interaction.options.getUser("user", true);
    if(user.bot) {
        return await interaction.reply({ embeds: [errorEmbed("Invalid User", "They must not be a bot")], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await linkAccount(interaction, user.id);
}
