import { ChannelType, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { setChannel } from "../../db/mod.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";

export const data = new SlashCommandBuilder()
    .setName("notify")
    .setDescription("Set the channel for loss notifications")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(x => x
        .setName("channel")
        .setDescription("Channel for loss notifications")
        .setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    );

export async function execute(interaction : ChatInputCommandInteraction) {
    const channel = interaction.options.getChannel("channel", true);
    if(!interaction.guild?.channels.cache.has(channel.id)) {
        return await interaction.reply({ embeds: [errorEmbed("Invalid Text Channel")], flags: MessageFlags.Ephemeral });
    }

    await setChannel(interaction.guildId!, channel.id);
    await interaction.reply({ embeds: [successEmbed("Registered For Notifications", `Losses will be announced in <#${channel.id}>`)], flags: MessageFlags.Ephemeral });
}
