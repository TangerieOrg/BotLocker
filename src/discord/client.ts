import { Client, Events, GatewayIntentBits } from "discord.js";
import { CHANNEL_ID, TOKEN } from "../config.ts";
import { logger } from "../helpers/log.ts";
import { commands, handleInteraction, loadCommands } from "./commands.ts";
import { setChannel } from "./DiscordStore.ts";
import { handleMention } from "./mentions.ts";

const { log, error } = logger("Discord");

export const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

client.once(Events.ClientReady, async c => {
    log(`Logged in as ${c.user.tag}`);

    const channel = await c.channels.fetch(CHANNEL_ID!).catch(() => null);
    if(!channel || !channel.isTextBased() || channel.isDMBased() || !channel.isSendable()) {
        error(`CHANNEL_ID ${CHANNEL_ID} isn't a server text channel the bot can send to`);
        Deno.exit(1);
    }

    // Commands only live in the one server, clears out any global ones from older versions
    const body = [...commands.values()].map(x => x.data.toJSON());
    await c.application.commands.set([]);
    await channel.guild.commands.set(body);
    log(`Registered ${body.length} commands to ${channel.guild.name}, announcing in #${channel.name}`);

    setChannel(channel);
});

client.on(Events.MessageCreate, msg => {
    handleMention(msg).catch(err => console.error(err));
});

client.on(Events.InteractionCreate, interaction => {
    handleInteraction(interaction).catch(err => console.error(err));
});

export async function startDiscord() {
    if(!TOKEN || !CHANNEL_ID) {
        error("DISCORD_TOKEN and CHANNEL_ID need to be set");
        Deno.exit(1);
    }

    await loadCommands();
    await client.login(TOKEN);
}
