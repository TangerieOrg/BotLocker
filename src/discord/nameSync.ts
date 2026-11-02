import { LinkStore } from "../links/LinkStore.ts";
import { watch } from "../helpers/store.ts";
import { DiscordStore } from "./DiscordStore.ts";
import { fetchName } from "./names.ts";

const SYNC_MS = 60 * 60 * 1000;

// Display names change without the bot hearing about it (that event needs the privileged members intent), so linked users are re-checked hourly
export function startNameSync() {
    const sync = async () => {
        const guild = DiscordStore.get().channel?.guild;
        if(!guild) return;
        for(const userId of LinkStore.get().links.keys()) await fetchName(guild, userId);
    };

    watch(DiscordStore, s => s.channel, channel => { if(channel) sync() });
    setInterval(sync, SYNC_MS);
}
