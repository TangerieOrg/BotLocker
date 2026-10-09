import { type Interaction, MessageFlags } from "discord.js";
import type { Command } from "./command.ts";
import { errorEmbed } from "./embeds.ts";

export const commands = new Map<string, Command>();

export async function loadCommands() {
    for(const entry of Deno.readDirSync(new URL("./commands", import.meta.url))) {
        if(!entry.name.endsWith(".ts")) continue;
        const cmd = await import(`./commands/${entry.name}`) as Command;
        commands.set(cmd.data.name, cmd);
    }
    console.log(`Loaded ${commands.size} commands`);
}

export async function handleInteraction(interaction : Interaction) {
    if(interaction.isAutocomplete()) {
        await commands.get(interaction.commandName)?.autocomplete?.(interaction).catch(err => console.error(err));
    } else if(interaction.isChatInputCommand()) {
        const cmd = commands.get(interaction.commandName);
        if(!cmd) {
            return await interaction.reply({ embeds: [errorEmbed("Error", "Invalid Command")], flags: MessageFlags.Ephemeral });
        }

        const args = interaction.options.data.map(x => ` ${x.name}:${x.value}`).join("");
        console.log(`[Command] ${interaction.user.username} ran /${interaction.commandName}${args} in ${interaction.guild?.name ?? "DM"}`);

        try {
            await cmd.execute(interaction);
        } catch(err) {
            console.error(`[Command] /${interaction.commandName} failed`, err);
            const msg = { embeds: [errorEmbed("Error", "There was an error while executing this command")] };
            if(interaction.deferred || interaction.replied) await interaction.editReply(msg).catch(() => undefined);
            else await interaction.reply({ ...msg, flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
    }
}
