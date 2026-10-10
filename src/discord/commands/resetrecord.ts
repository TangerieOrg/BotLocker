import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { resetPeriod } from "../../board/BoardStore.ts";
import { now } from "../../helpers/now.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("resetrecord")
    .setDescription("Reset the recording period for the leaderboard")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(x => x.setName("from").setDescription("Count from this instead of now, a unix timestamp or YYYY-MM-DD (UTC)"));

// Unix seconds, or anything Date can read. Undefined if it's neither or in the future
function parseFrom(input : string) {
    const s = input.trim();
    const at = /^\d+$/.test(s) ? Number(s) : Math.floor(Date.parse(s) / 1000);
    return Number.isFinite(at) && at <= now() ? at : undefined;
}

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!await isOwner(interaction)) {
        return await interaction.reply({ embeds: [errorEmbed("Permissions Error", "Only the bot owner can reset the record")], flags: MessageFlags.Ephemeral });
    }

    const input = interaction.options.getString("from");
    const at = input ? parseFrom(input) : now();
    if(at == undefined) {
        return await interaction.reply({ embeds: [errorEmbed("Invalid Date", "Use a unix timestamp or YYYY-MM-DD, and not in the future")], flags: MessageFlags.Ephemeral });
    }

    resetPeriod(at);
    await interaction.reply({ embeds: [successEmbed("Recording period reset", `Counting from <t:${at}:f>`)], flags: MessageFlags.Ephemeral });
}
