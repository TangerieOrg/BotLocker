import type { APIEmbed, APIEmbedField } from "discord.js";
import type { Totals } from "../db/mod.ts";

export const COLOURS = {
    red: 15158332,
    green: 3066993,
    gold: 15844367
};

export const TEAM_NAMES = ["Hidden King", "Archmother"];

export const errorEmbed = (title : string, description? : string) : APIEmbed => ({ title, description, color: COLOURS.red });

export const successEmbed = (title : string, description? : string) : APIEmbed => ({ title, description, color: COLOURS.green });

export const ratio = (a : number, b : number) => b == 0 ? a.toString() : (a / b).toFixed(2);

export const percent = (a : number, b : number) => b == 0 ? "0%" : `${Math.round(a / b * 100)}%`;

export function formatDuration(s : number) {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function modeName(gameMode : number, matchMode : number) {
    if(gameMode == 4) return "Street Brawl";
    if(matchMode == 4) return "Ranked";
    return "Unranked";
}

export const formatStreak = (streak : number) =>
    streak == 0 ? "-" : streak > 0 ? `${streak}W` : `${-streak}L${streak <= -3 ? " 🔥" : ""}`;

export function totalsFields(t : Totals) : APIEmbedField[] {
    const kills = t.kills ?? 0;
    const deaths = t.deaths ?? 0;
    const assists = t.assists ?? 0;
    const wins = t.wins ?? 0;
    const losses = t.losses ?? 0;

    return [
        { name: "Wins", value: wins.toString(), inline: true },
        { name: "Losses", value: losses.toString(), inline: true },
        { name: "Win/Loss", value: ratio(wins, losses), inline: true },
        { name: "Kills", value: kills.toString(), inline: true },
        { name: "Deaths", value: deaths.toString(), inline: true },
        { name: "Kill/Death", value: ratio(kills, deaths), inline: true },
        { name: "Assists", value: assists.toString(), inline: true },
        { name: "KDA", value: ratio(kills + assists, deaths), inline: true },
        { name: "Win Rate", value: percent(wins, t.matches), inline: true }
    ];
}
