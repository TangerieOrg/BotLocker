import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getAccount, unlink } from "../../links/LinkStore.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("unlink")
    .setDescription("Unlink your Deadlock account")
    .setContexts(InteractionContextType.Guild);

export async function execute(interaction : ChatInputCommandInteraction) {
    if(getAccount(interaction.user.id) == null) {
        return await interaction.reply({ embeds: [errorEmbed("Deadlock Account Not Linked", "Run /link to link")], flags: MessageFlags.Ephemeral });
    }

    unlink(interaction.user.id);
    await interaction.reply({ embeds: [successEmbed("Profile Unlinked Successfully")], flags: MessageFlags.Ephemeral });
}
