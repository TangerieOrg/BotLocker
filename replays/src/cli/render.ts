import { type Era, projection, WORLD_RADIUS } from "./maps.ts";

export const SIZE = 1024;
const HEADER = 88;

// Blue sequential ramp, darkest for the least so the busy spots stand out against the dark map
const RAMP = ["#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"];
// Categorical orange and aqua (dark steps), checked for colour blindness against the map. Kills are diamonds as well
export const DEATH = "#d95926";
export const KILL = "#199e70";
const INK = "#f0efec";
const MUTED = "#a3a29c";

// Heat is binned in world units so every era's image can project it
export const binExpr = (bins : number) => ({
    bx: `CAST((s.x + ${WORLD_RADIUS}) * ${bins} / ${2 * WORLD_RADIUS}.0 AS INTEGER)`,
    by: `CAST((${WORLD_RADIUS} - s.y) * ${bins} / ${2 * WORLD_RADIUS}.0 AS INTEGER)`
});

export interface Bin { bx : number, by : number, v : number }

// v in [0, 1] already scaled by the caller
export function heatLayer(era : Era, bins : number, cells : Bin[], tooltip? : (cell : Bin) => string) {
    const { px, py } = projection(era, SIZE);
    const step = 2 * WORLD_RADIUS / bins;
    return cells.filter(c => c.v > 0).map(c => {
        const x = px(-WORLD_RADIUS + c.bx * step);
        const y = py(WORLD_RADIUS - c.by * step);
        const w = px(-WORLD_RADIUS + (c.bx + 1) * step) - x;
        const v = Math.min(1, c.v);
        const colour = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
        const title = tooltip ? `<title>${tooltip(c)}</title>` : "";
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${w.toFixed(1)}" fill="${colour}" fill-opacity="${(0.25 + 0.6 * v).toFixed(2)}">${title}</rect>`;
    }).join("");
}

export interface Spot { x : number, y : number, opacity? : number, title? : string }

export function spotLayer(era : Era, kind : "death" | "kill", spots : Spot[]) {
    const { px, py } = projection(era, SIZE);
    return spots.map(s => {
        const x = px(s.x).toFixed(1);
        const y = py(s.y).toFixed(1);
        const opacity = (0.8 * (s.opacity ?? 1)).toFixed(2);
        const title = s.title ? `<title>${s.title}</title>` : "";
        // A 1px dark ring keeps overlapping marks apart
        const style = `fill-opacity="${opacity}" stroke="#1d1d1b" stroke-opacity="${opacity}" stroke-width="1"`;
        return kind == "death"
            ? `<circle cx="${x}" cy="${y}" r="5" fill="${DEATH}" ${style}>${title}</circle>`
            : `<rect x="-4.5" y="-4.5" width="9" height="9" transform="translate(${x} ${y}) rotate(45)" fill="${KILL}" ${style}>${title}</rect>`;
    }).join("");
}

export interface LegendItem { kind? : "death" | "kill" | "heat", text : string }

function legendMark(kind : LegendItem["kind"], x : number, y : number) {
    if(kind == "death") return `<circle cx="${x}" cy="${y}" r="5" fill="${DEATH}"/>`;
    if(kind == "kill") return `<rect x="-4.5" y="-4.5" width="9" height="9" transform="translate(${x} ${y}) rotate(45)" fill="${KILL}"/>`;
    if(kind == "heat") return `<rect x="${x - 6}" y="${y - 6}" width="12" height="12" fill="${RAMP[6]}"/>`;
    return "";
}

const escape = (x : string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface Frame {
    title : string;
    subtitle : string;
    minimap : string;
    body : string;
    // Big text on the right, the game clock in animations
    clock? : string;
    legend? : LegendItem[];
}

export const HEIGHT = SIZE + HEADER;

export function frameSvg(f : Frame) {
    // One row under the subtitle so long titles (pooled players) never run into it. Widths are a rough guess per character
    let x = 22;
    const legend = (f.legend ?? []).map(item => {
        const mark = `${legendMark(item.kind, x, 72)}<text x="${x + 14}" y="77" font-size="14" fill="${INK}">${escape(item.text)}</text>`;
        x += 14 + item.text.length * 7.5 + 28;
        return mark;
    }).join("");
    const clock = f.clock ? `<text x="${SIZE - 16}" y="44" font-size="34" font-weight="600" text-anchor="end" fill="${INK}">${f.clock}</text>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${HEIGHT}" width="${SIZE}" height="${HEIGHT}" font-family="system-ui, sans-serif">
<rect width="100%" height="100%" fill="#1d1d1b"/>
<text x="16" y="28" font-size="18" fill="${INK}">${escape(f.title)}</text>
<text x="16" y="50" font-size="14" fill="${MUTED}">${escape(f.subtitle)}</text>
${legend}${clock}
<g transform="translate(0 ${HEADER})">
<!-- Buildings are transparent in the minimaps, this is what shows through -->
<rect width="${SIZE}" height="${SIZE}" fill="#6b6b66"/>
<image href="data:image/png;base64,${f.minimap}" width="${SIZE}" height="${SIZE}"/>
${f.body}
</g>
</svg>
`;
}

export const clock = (t : number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
