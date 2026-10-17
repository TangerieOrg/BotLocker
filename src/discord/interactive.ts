import {
    type APIEmbed,
    ActionRowBuilder,
    type ChatInputCommandInteraction,
    type MessageActionRowComponentBuilder,
    MessageFlags,
    type StringSelectMenuInteraction,
    StringSelectMenuBuilder,
    type UserSelectMenuInteraction
} from "discord.js";
import { errorEmbed } from "./embeds.ts";

const IDLE_MS = 10 * 60 * 1000;
// Edits go through the message, but keep the controls from outliving a day of clicking
const MAX_MS = 60 * 60 * 1000;

export type View = { embeds : APIEmbed[], components : ActionRowBuilder<MessageActionRowComponentBuilder>[] };

type Choice = { name : string };

export function periodRow(periods : Record<string, Choice>, selected : string) {
    return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId("period")
            .setPlaceholder("Period")
            .addOptions(Object.entries(periods).map(([value, x]) => ({ label: x.name, value, default: value == selected })))
    );
}

// Sends the first view, then re-renders it when the command's user changes a control. Update returns the new state,
// or a string to tell the clicker why it can't be applied
export async function interactive<S>(
    interaction : ChatInputCommandInteraction,
    state : S,
    render : (state : S) => Promise<View>,
    update : (state : S, i : StringSelectMenuInteraction | UserSelectMenuInteraction) => S | string
) {
    let view = await render(state);
    const message = await interaction.editReply(view);

    const collector = message.createMessageComponentCollector({ idle: IDLE_MS, time: MAX_MS });
    collector.on("collect", async i => {
        if(!i.isStringSelectMenu() && !i.isUserSelectMenu()) return;

        if(i.user.id != interaction.user.id) {
            return await i.reply({ embeds: [errorEmbed("Not Yours", `Only <@${interaction.user.id}> can change this, run the command yourself`)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }

        const next = update(state, i);
        if(typeof next == "string") {
            return await i.reply({ embeds: [errorEmbed("Can't Do That", next)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }

        try {
            await i.deferUpdate();
            state = next;
            view = await render(state);
            await i.editReply(view);
        } catch(err) {
            console.error(`[Command] /${interaction.commandName} controls failed`, err);
        }
    });

    collector.on("end", async () => {
        for(const row of view.components) row.components.forEach(x => (x as StringSelectMenuBuilder).setDisabled(true));
        await message.edit({ components: view.components }).catch(() => undefined);
    });
}
