import "./env.ts";

const getBool = (name : string) => {
    const v = Deno.env.get(name);
    if(v === "1") return true;
    if(v === "0") return false;
    return undefined;
}

const getNumber = (name : string) => {
    const v = Deno.env.get(name);
    return v ? Number(v) : undefined;
}

export const TOKEN = Deno.env.get("DISCORD_TOKEN");
// The one channel wins and losses get announced in, commands are registered to its server
export const CHANNEL_ID = Deno.env.get("CHANNEL_ID");
export const OWNER_ID = Deno.env.get("OWNER_ID");
export const SEND_DISCORD_MESSAGE = getBool("SEND_DISCORD_MESSAGE") ?? true;

export const DATA_DIR = Deno.env.get("DATA_DIR") ?? "./data";

// Dedicated Steam account (with Deadlock access) that pulls match data from the game coordinator
export const STEAM_BOT_USERNAME = Deno.env.get("STEAM_BOT_USERNAME");
export const STEAM_BOT_PASSWORD = Deno.env.get("STEAM_BOT_PASSWORD");

// Matches are normally picked up as soon as a friend stops playing, this is just a backstop
export const GC_POLL_INTERVAL_MS = getNumber("GC_POLL_INTERVAL_MS") ?? 60 * 60 * 1000;
export const MAX_NOTIFY_AGE_S = (getNumber("MAX_NOTIFY_AGE_H") ?? 6) * 60 * 60;
export const PRESENCE_ROTATE_MS = getNumber("PRESENCE_ROTATE_MS") ?? 180000;
