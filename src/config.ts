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
export const DEV_GUILD_ID = Deno.env.get("DEV_GUILD_ID");
export const OWNER_ID = Deno.env.get("OWNER_ID");
export const SEND_DISCORD_MESSAGE = getBool("SEND_DISCORD_MESSAGE") ?? true;

export const PORT = getNumber("PORT") ?? 8000;

export const DATA_DIR = Deno.env.get("DATA_DIR") ?? "./data";

export const DEADLOCK_API_KEY = Deno.env.get("DEADLOCK_API_KEY");
export const STEAM_API_KEY = Deno.env.get("STEAM_API_KEY");

export const POLL_INTERVAL_MS = getNumber("POLL_INTERVAL_MS") ?? 120000;
export const MAX_NOTIFY_AGE_S = (getNumber("MAX_NOTIFY_AGE_H") ?? 6) * 60 * 60;
export const PRESENCE_ROTATE_MS = getNumber("PRESENCE_ROTATE_MS") ?? 180000;
