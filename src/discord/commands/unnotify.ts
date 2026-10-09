import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { getGuild, setChannel } from "../../db/mod.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("unnotify")
    .setDescription("Stop loss notifications")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!(await getGuild(interaction.guildId!)).channel_id) {
        return await interaction.reply({ embeds: [errorEmbed("No notify channel linked yet")], flags: MessageFlags.Ephemeral });
    }

    await setChannel(interaction.guildId!, null);
    await interaction.reply({ embeds: [successEmbed("Successfully unlinked notify channel")], flags: MessageFlags.Ephemeral });
}
