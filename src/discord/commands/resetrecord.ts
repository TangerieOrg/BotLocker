import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { resetPeriod } from "../../db/mod.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("resetrecord")
    .setDescription("Reset the recording period for the leaderboard")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!await isOwner(interaction)) {
        return await interaction.reply({ embeds: [errorEmbed("Permissions Error", "Only the bot owner can reset the record")], flags: MessageFlags.Ephemeral });
    }

    await resetPeriod(interaction.guildId!);
    await interaction.reply({ embeds: [successEmbed("Recording period reset")], flags: MessageFlags.Ephemeral });
}
