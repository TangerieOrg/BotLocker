import { Database } from "@db/sqlite";
import { RemoteDatabase } from "@tangerie/remote-sqlite/client";
import "../env.ts";
import type { Era } from "./maps.ts";

type Params = Parameters<RemoteDatabase["run"]> extends [string, ...infer P] ? P : never;

export interface Source {
    all<T extends object>(sql : string, ...params : Params) : Promise<T[]>;
    close() : void;
}

// The served endpoints by default, a plain path opens a local copy instead
export const REPLAYS_DB = Deno.env.get("REPLAYS_DB_URL") ?? "ws://media/botlocker-replays";
export const BOT_DB = Deno.env.get("BOTLOCKER_DB_URL") ?? "ws://media/botlocker-db";

export async function openSource(target : string) : Promise<Source> {
    if(/^(wss?|https?):\/\//.test(target)) {
        const db = new RemoteDatabase(target);
        await db.open();
        return { all: (sql, ...params) => db.run(sql, ...params), close: () => db.close() };
    }
    const db = new Database(target, { readonly: true });
    return {
        all: <T extends object>(sql : string, ...params : Params) => {
            using stmt = db.prepare(sql);
            return Promise.resolve(stmt.all<T>(...params));
        },
        close: () => db.close()
    };
}

export interface Names {
    // Linked accounts only, everyone else in a lobby is just an id
    linked : Map<number, string>;
    heroes : Map<number, string>;
}

export async function loadNames(bot : Source) : Promise<Names> {
    const linked = await bot.all<{ account_id : number, name : string | null }>(`--sql
        SELECT l.account_id, COALESCE(d.name, s.name) AS name FROM links l
        LEFT JOIN discord_names d ON d.user_id = l.user_id
        LEFT JOIN steam_names s ON s.account_id = l.account_id
    `);
    const heroes = await bot.all<{ id : number, name : string }>("SELECT id, name FROM heroes");
    return {
        linked: new Map(linked.map(x => [x.account_id, x.name ?? String(x.account_id)])),
        heroes: new Map(heroes.map(x => [x.id, x.name]))
    };
}

// An account id, or part of a linked player's name
export function findAccount(names : Names, query : string) {
    if(/^\d+$/.test(query)) return Number(query);
    const q = query.toLowerCase();
    const hits = [...names.linked].filter(([, name]) => name.toLowerCase().includes(q));
    if(hits.length == 1) return hits[0][0];
    throw new Error(hits.length == 0 ? `No linked player matches "${query}"` : `"${query}" matches ${hits.map(x => x[1]).join(", ")}`);
}

// Comma separated, pooled together by the heatmaps
export const findAccounts = (names : Names, query : string) => [...new Set(query.split(",").map(x => x.trim()).filter(x => x).map(x => findAccount(names, x)))];

// Names for titles and file names, a long list collapses to a count
export function playersLabel(names : Names, accounts : number[]) {
    if(accounts.length > 3) return `${accounts.length} players`;
    return accounts.map(x => names.linked.get(x) ?? String(x)).join(", ");
}

export const placeholders = (list : unknown[]) => list.map(() => "?").join(", ");

export function findHero(names : Names, query : string) {
    if(/^\d+$/.test(query)) return Number(query);
    const q = query.toLowerCase();
    const hit = [...names.heroes].find(([, name]) => name.toLowerCase() == q) ?? [...names.heroes].find(([, name]) => name.toLowerCase().includes(q));
    if(!hit) throw new Error(`No hero matches "${query}"`);
    return hit[0];
}

// standard is normal matches, ranked or not. Street Brawl is short and always kept apart from it
export const MODES : Record<string, (alias : string) => string> = {
    standard: a => `${a}.game_mode = 1`,
    unranked: a => `${a}.game_mode = 1 AND ${a}.match_mode = 1`,
    ranked: a => `${a}.game_mode = 1 AND ${a}.match_mode = 4`,
    brawl: a => `${a}.game_mode = 4`
};

export const DEFAULT_MODE = "standard";

// Shared WHERE on start_time, mode and map era, for matches or the views that carry their columns
export function matchFilter(args : { days? : number, mode? : string, era? : Era }, alias : string) {
    const where : string[] = [];
    const params : number[] = [];
    if(args.days) {
        where.push(`${alias}.start_time >= ?`);
        params.push(Math.floor(Date.now() / 1000) - args.days * 86400);
    }
    if(args.era) {
        where.push(`${alias}.start_time >= ? AND ${alias}.start_time < ?`);
        params.push(args.era.from, args.era.to);
    }
    const mode = MODES[args.mode ?? DEFAULT_MODE];
    if(!mode) throw new Error(`Mode is one of ${Object.keys(MODES).join(", ")}`);
    where.push(mode(alias));
    return { where, params };
}
