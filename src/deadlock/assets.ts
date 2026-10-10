import type { Hero, Rank } from "./types.ts";

// Static names and icons only, match data all comes from the Steam bot
const ASSETS_URL = "https://api.deadlock-api.com/v1/assets";
const TTL = 24 * 60 * 60 * 1000;

const cache = new Map<string, { value: unknown, expires: number }>();

// Failures aren't cached so the next lookup tries again, callers fall back to placeholder names
async function cached<T>(path : string) : Promise<T[]> {
    const hit = cache.get(path);
    if(hit && hit.expires > Date.now()) return hit.value as T[];

    try {
        const res = await fetch(`${ASSETS_URL}${path}`);
        if(!res.ok) throw new Error(`${res.status}`);
        const value = await res.json() as T[];
        cache.set(path, { value, expires: Date.now() + TTL });
        return value;
    } catch(err) {
        console.error(`[Assets] Couldn't fetch ${path}: ${(err as Error).message}`);
        return [];
    }
}

const heroes = () => cached<Hero>("/heroes?only_active=true");
const ranks = () => cached<Rank>("/ranks");

const hero = async (id : number) => (await heroes()).find(x => x.id == id);

export const heroName = async (id : number) => (await hero(id))?.name ?? `Hero ${id}`;

export const heroIcon = async (id : number) => (await hero(id))?.images.icon_image_small;

export async function rankName(badge : number | null | undefined) {
    if(!badge) return "Unranked";

    const tier = Math.floor(badge / 10);
    const sub = badge % 10;
    const r = (await ranks()).find(x => x.tier == tier);
    if(!r) return `Badge ${badge}`;
    return sub > 0 ? `${r.name} ${sub}` : r.name;
}
