import { encodeBase64 } from "@std/encoding/base64";

// Every era shares one world frame: centred on the map, y up, team 0 at the bottom. Only the layout and the image change
export const WORLD_RADIUS = 10752;

export interface Era {
    label : string;
    // Unix seconds, matches started in [from, to)
    from : number;
    to : number;
    url : string;
    // The world square the image covers, centred on (cx, cy) with half width radius
    radius : number;
    cx : number;
    cy : number;
    // Shown on the image when the minimap doesn't quite match the era
    note? : string;
}

const date = (x : string) => Date.parse(`${x}T00:00:00Z`) / 1000;
const BUCKET = "https://assets-bucket.deadlock-api.com/assets-api-res/images/maps";

// Patch dates from deadlock.wiki. The images aren't versioned upstream, these are the best that's still around
export const ERAS : Record<string, Era> = {
    "4lane": {
        label: "4 lanes (Aug 2024 – Feb 2025)",
        from: 0,
        to: date("2025-02-25"),
        url: "https://cdn.deadlock.wiki/4_lane_map.png",
        radius: WORLD_RADIUS,
        cx: 0,
        cy: 0,
        note: "In-game capture aligned by hand, positions are approximate"
    },
    "3lane": {
        label: "3 lanes (Feb 2025 – Jan 2026)",
        from: date("2025-02-25"),
        to: date("2026-01-22"),
        url: `${BUCKET}/minimap.png`,
        radius: WORLD_RADIUS,
        cx: 0,
        cy: 0
    },
    "ognb": {
        label: "Old Gods, New Blood (Jan – Sep 2026)",
        from: date("2026-01-22"),
        to: date("2026-09-29"),
        url: `${BUCKET}/minimap.png`,
        radius: WORLD_RADIUS,
        cx: 0,
        cy: 0,
        note: "Minimap is from before the base rework"
    },
    "cns": {
        label: "City Never Sleeps (Sep 2026 – now)",
        from: date("2026-09-29"),
        to: Number.MAX_SAFE_INTEGER,
        url: `${BUCKET}/minimap_midtown_mid.png`,
        radius: WORLD_RADIUS,
        cx: 0,
        cy: 0
    }
};

export const DEFAULT_ERA = "cns";

export function findEra(name? : string) {
    const era = ERAS[name ?? DEFAULT_ERA];
    if(!era) throw new Error(`Era is one of ${Object.keys(ERAS).join(", ")}`);
    return era;
}

const CACHE_DIR = new URL("../../cache/minimaps/", import.meta.url);

// Downloaded once into the gitignored cache, the art is Valve's so it isn't committed
export async function loadMinimap(name : string, era : Era) {
    const file = new URL(`${name}.png`, CACHE_DIR);
    try {
        return encodeBase64(await Deno.readFile(file));
    } catch {
        const res = await fetch(era.url);
        if(!res.ok) throw new Error(`Couldn't download the ${name} minimap (${res.status}) from ${era.url}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        await Deno.mkdir(CACHE_DIR, { recursive: true });
        await Deno.writeFile(file, bytes);
        return encodeBase64(bytes);
    }
}

// World units to image pixels for a square image of side size
export const projection = (era : Era, size : number) => ({
    px: (x : number) => (x - era.cx + era.radius) / (2 * era.radius) * size,
    py: (y : number) => (era.radius - (y - era.cy)) / (2 * era.radius) * size
});

// Older metadata parks heroes off the map before they spawn and while dead, and early on everyone sits at the centre
export const CLEAN_POSITIONS = `ABS(s.x) <= ${WORLD_RADIUS} AND ABS(s.y) <= ${WORLD_RADIUS} AND s.health > 0 AND s.t >= 10`;
export const cleanSpots = (x : string, y : string) => `${x} IS NOT NULL AND ABS(${x}) <= ${WORLD_RADIUS} AND ABS(${y}) <= ${WORLD_RADIUS}`;
