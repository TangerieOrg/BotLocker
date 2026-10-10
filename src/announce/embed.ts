import type { APIEmbed, APIEmbedField } from "discord.js";
import { BoardStore } from "../board/BoardStore.ts";
import { getLossTotals, getStreak, type Match } from "../db/mod.ts";
import { heroIcon, heroName, rankName } from "../deadlock/assets.ts";
import { COLOURS, formatDuration, modeName } from "../discord/embeds.ts";
import {
    formatSouls, getCompliment, getInsult, getStreakBrokenLine, getTiltLine, getWinStreakLine, joinNames, lossContext, matchContext
} from "../lines/mod.ts";

export interface Announced {
    match: Match;
    name: string;
}

// The lines for one player's game, shared by solo and party announcements
async function describe({ match, name } : Announced) {
    const hero = await heroName(match.hero_id);
    const streak = await getStreak(match.account_id, match.match_id);
    const previousStreak = await getStreak(match.account_id, match.match_id - 1);

    const ranked = match.match_mode == 4 && match.badge;
    const ctx = {
        ...matchContext(match, hero, ranked ? await rankName(match.badge) : undefined),
        ...lossContext(await getLossTotals(match.account_id, BoardStore.get().periodStart)),
        name
    };

    let text = "";

    if(match.won) {
        text = getCompliment(ctx);
        if(previousStreak <= -3) text += `\n\n**${getStreakBrokenLine(ctx, -previousStreak)}**`;
        const winStreak = getWinStreakLine(ctx, streak);
        if(winStreak) text += `\n\n**${winStreak}**`;
    } else {
        text = `This is for you: ${getInsult(ctx)}`;
        const tilt = getTiltLine(ctx, -streak);
        if(tilt) text += `\n\n**${tilt}**`;
    }

    const delta = match.ranked_delta ?? 0;
    return { hero, text, rank: ranked ? `${ctx.rank} (${delta > 0 ? "+" : ""}${delta})` : undefined };
}

const footer = (match : Match) => ({
    footer: { text: `Match ${match.match_id}` },
    timestamp: new Date((match.start_time + match.duration_s) * 1000).toISOString()
});

export async function buildEmbed(player : Announced) : Promise<APIEmbed> {
    const { match, name } = player;
    const { hero, text, rank } = await describe(player);

    const fields : APIEmbedField[] = [
        { name: "K/D/A", value: `${match.kills}/${match.deaths}/${match.assists}`, inline: true },
        { name: "Duration", value: formatDuration(match.duration_s), inline: true },
        { name: "Mode", value: modeName(match.game_mode, match.match_mode), inline: true }
    ];

    if(match.game_mode != 4) fields.splice(1, 0, { name: "Souls", value: formatSouls(match.net_worth), inline: true });
    if(rank) fields.push({ name: "Rank", value: rank, inline: true });

    return {
        title: `${name} ${match.won ? "won" : "lost"} a Deadlock match as ${hero}`,
        description: text,
        color: match.won ? COLOURS.green : COLOURS.red,
        fields,
        thumbnail: { url: await heroIcon(match.hero_id) ?? "" },
        ...footer(match)
    };
}

// Everyone from the same team in one message, each with their own stats and line
export async function buildPartyEmbed(players : Announced[]) : Promise<APIEmbed> {
    const { match } = players[0];

    const sections = await Promise.all(players.map(async player => {
        const { match: m, name } = player;
        const { hero, text, rank } = await describe(player);
        const stats = [
            hero,
            `${m.kills}/${m.deaths}/${m.assists}`,
            m.game_mode == 4 ? undefined : `${formatSouls(m.net_worth)} souls`,
            rank
        ].filter(x => x).join(" · ");
        return `### ${name}\n${stats}\n${text}`;
    }));

    return {
        title: `${joinNames(players.map(x => x.name))} ${match.won ? "won" : "lost"} a Deadlock match`,
        description: sections.join("\n\n").slice(0, 4096),
        color: match.won ? COLOURS.green : COLOURS.red,
        fields: [
            { name: "Duration", value: formatDuration(match.duration_s), inline: true },
            { name: "Mode", value: modeName(match.game_mode, match.match_mode), inline: true }
        ],
        thumbnail: { url: await heroIcon(match.hero_id) ?? "" },
        ...footer(match)
    };
}
