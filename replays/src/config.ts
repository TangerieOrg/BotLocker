import "./env.ts";

const getNumber = (name : string) => {
    const v = Deno.env.get(name);
    return v ? Number(v) : undefined;
}

export const DATA_DIR = Deno.env.get("DATA_DIR") ?? "./data";
// Read-only remote-sqlite endpoint for the analysis database, 0 turns it off
export const DB_PORT = getNumber("DB_PORT") ?? 8080;

// The bot's read-only endpoint, prod reaches it over the compose network
export const BOTLOCKER_DB_URL = Deno.env.get("BOTLOCKER_DB_URL") ?? "ws://media/botlocker-db";
// How often new salts are pulled from the bot
export const POLL_INTERVAL_MS = getNumber("POLL_INTERVAL_MS") ?? 5 * 60 * 1000;
// Metadata downloads in flight at once. Valve publishes no limit, this just keeps it polite
export const INGEST_CONCURRENCY = getNumber("INGEST_CONCURRENCY") ?? 2;
