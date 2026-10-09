import type { Database } from "@db/sqlite";
import { asDbFunction, now, stmt, withDb } from "./connection.ts";
import type { Guild } from "./types.ts";

const ensureGuildDb = (db : Database, guildId : string) => stmt(db, `--sql
    INSERT INTO guilds (guild_id, channel_id, period_start) VALUES (?, NULL, ?)
    ON CONFLICT (guild_id) DO NOTHING
`, s => s.run(guildId, now()));

export const ensureGuild = asDbFunction(ensureGuildDb);

export const getGuild = asDbFunction((db, guildId : string) => {
    ensureGuildDb(db, guildId);
    return stmt(db, "SELECT * FROM guilds WHERE guild_id = ?", s => s.get(guildId)) as unknown as Guild;
});

export const getNotifyGuilds = asDbFunction(db =>
    stmt(db, "SELECT * FROM guilds WHERE channel_id IS NOT NULL", s => s.all()) as unknown as Guild[]);

export const setChannel = (guildId : string, channelId : string | null) => withDb(db => {
    ensureGuildDb(db, guildId);
    stmt(db, "UPDATE guilds SET channel_id = ? WHERE guild_id = ?", s => s.run(channelId, guildId));
});

export const resetPeriod = (guildId : string) => withDb(db => {
    ensureGuildDb(db, guildId);
    stmt(db, "UPDATE guilds SET period_start = ? WHERE guild_id = ?", s => s.run(now(), guildId));
});

export const removeGuild = asDbFunction((db, guildId : string) =>
    stmt(db, "DELETE FROM guilds WHERE guild_id = ?", s => s.run(guildId)));
