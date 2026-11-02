import { now } from "../helpers/now.ts";
import { asDbFunction, transaction } from "./connection.ts";
import type { DiscordName, HeroRow, RankRow, SteamName } from "./types.ts";

export const getHeroes = asDbFunction(db => {
    using stmt = db.prepare<HeroRow>("SELECT * FROM heroes");
    return stmt.all();
});

export const upsertHeroes = asDbFunction((db, heroes : { id : number, name : string, class_name? : string, icon_url? : string }[]) => {
    const t = now();
    transaction(db, () => {
        using stmt = db.prepare(`--sql
            INSERT INTO heroes (id, name, class_name, icon_url, updated_at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = excluded.name, class_name = excluded.class_name, icon_url = excluded.icon_url, updated_at = excluded.updated_at
        `);
        for(const x of heroes) stmt.run(x.id, x.name, x.class_name ?? null, x.icon_url ?? null, t);
    });
});

export const getRanks = asDbFunction(db => {
    using stmt = db.prepare<RankRow>("SELECT * FROM ranks");
    return stmt.all();
});

export const upsertRanks = asDbFunction((db, ranks : { tier : number, name : string }[]) => {
    const t = now();
    transaction(db, () => {
        using stmt = db.prepare(`--sql
            INSERT INTO ranks (tier, name, updated_at) VALUES (?, ?, ?)
            ON CONFLICT (tier) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
        `);
        for(const x of ranks) stmt.run(x.tier, x.name, t);
    });
});

export const getDiscordNames = asDbFunction(db => {
    using stmt = db.prepare<DiscordName>("SELECT * FROM discord_names");
    return stmt.all();
});

export const setDiscordName = asDbFunction((db, userId : string, name : string) => {
    db.exec(`--sql
        INSERT INTO discord_names (user_id, name, updated_at) VALUES (?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `, userId, name, now());
});

export const removeDiscordName = asDbFunction((db, userId : string) => {
    db.exec("DELETE FROM discord_names WHERE user_id = ?", userId);
});

export const getSteamNames = asDbFunction(db => {
    using stmt = db.prepare<SteamName>("SELECT * FROM steam_names");
    return stmt.all();
});

export const setSteamName = asDbFunction((db, accountId : number, name : string) => {
    db.exec(`--sql
        INSERT INTO steam_names (account_id, name, updated_at) VALUES (?, ?, ?)
        ON CONFLICT (account_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
    `, accountId, name, now());
});
