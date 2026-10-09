import { getHeroes, getRanks } from "./api.ts";
import type { Hero, Rank } from "./types.ts";

const TTL = 24 * 60 * 60 * 1000;

const cache = new Map<string, { value: unknown, expires: number }>();

async function cached<T>(key : string, fn : () => Promise<T>) : Promise<T> {
    const hit = cache.get(key);
    if(hit && hit.expires > Date.now()) return hit.value as T;
    const value = await fn();
    cache.set(key, { value, expires: Date.now() + TTL });
    return value;
}

export const heroes = () => cached<Hero[]>("heroes", getHeroes);
export const ranks = () => cached<Rank[]>("ranks", getRanks);

export async function hero(id : number) {
    return (await heroes()).find(x => x.id == id);
}

export async function heroName(id : number) {
    return (await hero(id))?.name ?? `Hero ${id}`;
}

export async function heroIcon(id : number) {
    return (await hero(id))?.images.icon_image_small;
}

export async function rankInfo(badge : number | null | undefined) {
    if(!badge) return { name: "Unranked", image: undefined, color: undefined };

    const tier = Math.floor(badge / 10);
    const sub = badge % 10;
    const r = (await ranks()).find(x => x.tier == tier);
    if(!r) return { name: `Badge ${badge}`, image: undefined, color: undefined };

    return {
        name: sub > 0 ? `${r.name} ${sub}` : r.name,
        image: r.images[`small_subrank${sub}`] ?? r.images.large ?? r.images.small,
        color: r.color
    };
}

export const rankName = (badge : number | null | undefined) => rankInfo(badge).then(x => x.name);

export async function searchHeroes(query : string) {
    const q = query.toLowerCase();
    return (await heroes())
        .filter(x => x.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
}
