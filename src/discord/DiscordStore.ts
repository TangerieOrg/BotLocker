import type { GuildTextBasedChannel } from "discord.js";
import { createStore } from "@tangerie/global-store/store";

interface DiscordState {
    // The notify channel, set once the bot has logged in and found it. Its guild is the only one the bot works in
    channel?: GuildTextBasedChannel;
    // Custom status text, the presence effect keeps the bot showing it
    status: string;
}

export const DiscordStore = createStore({
    state: { status: "Watching you feed" } as DiscordState,
    actions: {
        setChannel: (s, channel : GuildTextBasedChannel) => { s.channel = channel },
        setStatus: (s, status : string) => { s.status = status }
    }
});

export const { setChannel, setStatus } = DiscordStore.actions;

// Their name in the server, for places without a member to hand (bot status)
export async function memberName(userId : string) {
    const member = await DiscordStore.get().channel?.guild.members.fetch(userId).catch(() => undefined);
    return member?.displayName ?? "someone";
}
