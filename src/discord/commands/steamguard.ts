import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { SteamStore } from "../../steam/SteamStore.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("steamguard")
    .setDescription("Send the Steam bot the Steam Guard code it's waiting for")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(x => x.setName("code").setDescription("Code from the Steam Guard email").setRequired(true).setMinLength(5).setMaxLength(5));

// Resolves with whether the login went through, undefined if Steam didn't say either way in time
const loginResult = () => new Promise<boolean | undefined>(res => {
    const timer = setTimeout(() => done(undefined), 20000);
    const unsub = SteamStore.subscribe(s => s.login, login => {
        if(login.state == "loggedOn") done(true);
        if(login.state == "guard" || login.state == "failed") done(false);
    });
    function done(result : boolean | undefined) {
        clearTimeout(timer);
        unsub();
        res(result);
    }
});

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!await isOwner(interaction)) {
        return await interaction.reply({ embeds: [errorEmbed("Permissions Error", "Only the bot owner can send Steam Guard codes")], flags: MessageFlags.Ephemeral });
    }

    const { login } = SteamStore.get();
    if(login.state != "guard") {
        return await interaction.reply({ embeds: [errorEmbed("No Code Needed", "The Steam bot isn't waiting for a Steam Guard code")], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = loginResult();
    login.submit(interaction.options.getString("code", true));

    const embed = await result.then(x => x === true ?
        successEmbed("Steam Bot Logged In") :
        x === false ?
            errorEmbed("Wrong Code", "Steam didn't accept that code, check for a newer email and try again") :
            errorEmbed("No Response", "Sent the code but Steam hasn't answered yet, check the logs"));
    await interaction.editReply({ embeds: [embed] });
}
