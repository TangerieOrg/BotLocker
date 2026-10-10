import type { APIEmbed, APIEmbedField } from "discord.js";
import { BoardStore } from "../board/BoardStore.ts";
import { getLossTotals, getStreak, type Match } from "../db/mod.ts";
import { heroIcon, heroName, rankName } from "../deadlock/assets.ts";
import { COLOURS, formatDuration, modeName } from "../discord/embeds.ts";
import { formatSouls, getCompliment, getInsult, getStreakBrokenLine, getTiltLine, getWinStreakLine, lossContext, matchContext } from "../lines/mod.ts";

export async function buildEmbed(match : Match, displayName : string) : Promise<APIEmbed> {
    const hero = await heroName(match.hero_id);
    const streak = await getStreak(match.account_id, match.match_id);
    const previousStreak = await getStreak(match.account_id, match.match_id - 1);

    const ranked = match.match_mode == 4 && match.badge;
    const ctx = {
        ...matchContext(match, hero, ranked ? await rankName(match.badge) : undefined),
        ...lossContext(await getLossTotals(match.account_id, BoardStore.get().periodStart)),
        name: displayName
    };

    const fields : APIEmbedField[] = [
        { name: "K/D/A", value: `${match.kills}/${match.deaths}/${match.assists}`, inline: true },
        { name: "Duration", value: formatDuration(match.duration_s), inline: true },
        { name: "Mode", value: modeName(match.game_mode, match.match_mode), inline: true }
    ];

    if(match.game_mode != 4) fields.splice(1, 0, { name: "Souls", value: formatSouls(match.net_worth), inline: true });

    if(ranked) {
        const delta = match.ranked_delta ?? 0;
        fields.push({ name: "Rank", value: `${ctx.rank} (${delta > 0 ? "+" : ""}${delta})`, inline: true });
    }

    let description = "";

    if(match.won) {
        description = getCompliment(ctx);
        if(previousStreak <= -3) description += `\n\n**${getStreakBrokenLine(ctx, -previousStreak)}**`;
        const winStreak = getWinStreakLine(ctx, streak);
        if(winStreak) description += `\n\n**${winStreak}**`;
    } else {
        description = `This is for you: ${getInsult(ctx)}`;
        const tilt = getTiltLine(ctx, -streak);
        if(tilt) description += `\n\n**${tilt}**`;
    }

    return {
        title: `${displayName} ${match.won ? "won" : "lost"} a Deadlock match as ${hero}`,
        description,
        color: match.won ? COLOURS.green : COLOURS.red,
        fields,
        thumbnail: { url: await heroIcon(match.hero_id) ?? "" },
        footer: { text: `Match ${match.match_id}` },
        timestamp: new Date((match.start_time + match.duration_s) * 1000).toISOString()
    };
}
