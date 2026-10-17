import { type AutocompleteInteraction, type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { guardWaiting, loginOf, SteamStore } from "../../steam/SteamStore.ts";
import { errorEmbed, successEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("steamguard")
    .setDescription("Send the Steam bot the Steam Guard code it's waiting for")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(x => x.setName("code").setDescription("Code from the Steam Guard email").setRequired(true).setMinLength(5).setMaxLength(5))
    .addStringOption(x => x.setName("username").setDescription("Which Steam account, only needed when more than one is waiting").setAutocomplete(true));

export async function autocomplete(interaction : AutocompleteInteraction) {
    const query = interaction.options.getFocused().toLowerCase();
    const options = guardWaiting().filter(x => x.username.toLowerCase().includes(query));
    await interaction.respond(options.slice(0, 25).map(x => ({ name: x.username, value: x.username })));
}

// Resolves with whether the login went through, undefined if Steam didn't say either way in time
const loginResult = (username : string) => new Promise<boolean | undefined>(res => {
    const timer = setTimeout(() => done(undefined), 20000);
    const unsub = SteamStore.subscribe(s => loginOf(s, username), login => {
        if(login?.state == "loggedOn") done(true);
        if(login?.state == "guard" || login?.state == "failed") done(false);
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

    const waiting = guardWaiting();
    if(waiting.length == 0) {
        return await interaction.reply({ embeds: [errorEmbed("No Code Needed", "The Steam bot isn't waiting for a Steam Guard code")], flags: MessageFlags.Ephemeral });
    }

    const asked = interaction.options.getString("username");
    const target = asked ? waiting.find(x => x.username == asked) : waiting.length == 1 ? waiting[0] : undefined;
    if(!target) {
        const names = waiting.map(x => `\`${x.username}\``).join(", ");
        const why = asked ? `${asked} isn't waiting for a code` : "More than one account is waiting for a code";
        return await interaction.reply({ embeds: [errorEmbed("Which Account?", `${why}. Waiting: ${names}`)], flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = loginResult(target.username);
    target.login.submit(interaction.options.getString("code", true));

    const embed = await result.then(x => x === true ?
        successEmbed(`${target.username} Logged In`) :
        x === false ?
            errorEmbed("Wrong Code", "Steam didn't accept that code, check for a newer email and try again") :
            errorEmbed("No Response", "Sent the code but Steam hasn't answered yet, check the logs"));
    await interaction.editReply({ embeds: [embed] });
}
