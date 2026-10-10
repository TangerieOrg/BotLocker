import type { APIEmbed } from "discord.js";

export const COLOURS = {
    red: 15158332,
    green: 3066993,
    gold: 15844367
};

export const errorEmbed = (title : string, description? : string) : APIEmbed => ({ title, description, color: COLOURS.red });

export const successEmbed = (title : string, description? : string) : APIEmbed => ({ title, description, color: COLOURS.green });

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
