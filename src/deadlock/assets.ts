import { getHeroes, getRanks, type HeroRow, type RankRow, upsertHeroes, upsertRanks } from "../db/mod.ts";
import type { Hero, Rank } from "./types.ts";

// Static names and icons only, match data comes from the Steam bot (deadlock-api just tops up backfills)
const ASSETS_URL = "https://api.deadlock-api.com/v1/assets";
const TTL = 24 * 60 * 60 * 1000;
// Unknown ids ask for a refresh straight away, this stops a bad id from hammering the API
const RETRY = 10 * 60 * 1000;

// SQLite is what reads use. The API only tops it up, and rows are never deleted so old matches keep resolving
function asset<R extends { updated_at : number }, A>(path : string, load : () => Promise<R[]>, save : (rows : A[]) => Promise<void>) {
    let rows : R[] | undefined;
    let refreshedAt = 0;
    let lastTry = 0;
    let pending : Promise<void> | undefined;

    const read = async () => {
        if(!rows) {
            rows = await load();
            refreshedAt = Math.max(0, ...rows.map(x => x.updated_at)) * 1000;
        }
        return rows;
    };

    // Failures keep whatever rows are stored, callers fall back to placeholder names
    const refresh = (force = false) => {
        if(pending) return pending;
        if(!force && Date.now() - lastTry < RETRY) return Promise.resolve();

        lastTry = Date.now();
        return pending = (async () => {
            try {
                const res = await fetch(`${ASSETS_URL}${path}`);
                if(!res.ok) throw new Error(`${res.status}`);
                const body = await res.json() as A[];
                if(body.length == 0) throw new Error("empty response");
                await save(body);
                rows = await load();
                refreshedAt = Date.now();
            } catch(err) {
                console.error(`[Assets] Couldn't fetch ${path}: ${(err as Error).message}`);
            } finally {
                pending = undefined;
            }
        })();
    };

    return {
        // Nothing stored yet (first run) waits for the API
        async get() {
            const stored = await read();
            if(stored.length == 0) await refresh();
            return rows!;
        },
        // Looks for something the stored rows don't have, which usually means a new hero
        async find(match : (x : R) => boolean) {
            const hit = (await this.get()).find(match);
            if(hit) return hit;
            await refresh();
            return rows!.find(match);
        },
        async refreshIfStale() {
            await read();
            if(Date.now() - refreshedAt >= TTL) await refresh(true);
        }
    };
}

const heroes = asset<HeroRow, Hero>("/heroes", getHeroes, x => upsertHeroes(x.map(h => ({
    id: h.id, name: h.name, class_name: h.class_name, icon_url: h.images?.icon_image_small
}))));
const ranks = asset<RankRow, Rank>("/ranks", getRanks, x => upsertRanks(x));

// Daily top up so new heroes and ranks show up without a restart, a miss on an unknown id also refreshes
export function startAssets() {
    const check = () => Promise.all([heroes.refreshIfStale(), ranks.refreshIfStale()]);
    check();
    setInterval(check, 60 * 60 * 1000);
}

export const heroList = async () => [...await heroes.get()].sort((a, b) => a.name.localeCompare(b.name));

export const heroName = async (id : number) => (await heroes.find(x => x.id == id))?.name ?? `Hero ${id}`;

export const heroIcon = async (id : number) => (await heroes.find(x => x.id == id))?.icon_url ?? undefined;

const unknownCodenames = new Set<string>();

// Rich presence's #Steam_RP_hero_chessmaster → Solomon. Anything deadlock-api doesn't know yet gets its codename tidied up
export async function heroFromCodename(token? : string) {
    if(!token) return undefined;
    const code = token.replace(/^#?steam_rp_/i, "").toLowerCase();
    const found = await heroes.find(x => x.class_name?.toLowerCase() == code);
    if(found) return found.name;

    if(!unknownCodenames.has(code)) {
        unknownCodenames.add(code);
        console.log(`[Assets] No hero for codename ${token}`);
    }
    const bare = code.replace(/^hero_/, "");
    return bare.charAt(0).toUpperCase() + bare.slice(1);
}

export async function rankName(badge : number | null | undefined) {
    if(!badge) return "Unranked";

    const tier = Math.floor(badge / 10);
    const sub = badge % 10;
    const r = await ranks.find(x => x.tier == tier);
    if(!r) return `Badge ${badge}`;
    return sub > 0 ? `${r.name} ${sub}` : r.name;
}
