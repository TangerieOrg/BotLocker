import { type ChatInputCommandInteraction, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { SALT_FETCH_DAILY_CAP, SALT_FETCH_INTERVAL_MS, SALT_UPLOAD } from "../../config.ts";
import { getFetchLog, getSaltSummary, type SaltStatus } from "../../db/salts.ts";
import { now } from "../../helpers/now.ts";
import { saltState } from "../../salts/effects.ts";
import { SteamStore } from "../../steam/SteamStore.ts";
import { COLOURS, errorEmbed } from "../embeds.ts";
import { isOwner } from "../util.ts";

export const data = new SlashCommandBuilder()
    .setName("status")
    .setDescription("How match salt processing is going")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

const ORDER : [SaltStatus, string][] = [
    ["pending", "Waiting to be checked"],
    ["missing", "Needs a GC fetch"],
    ["fetched", "Fetched, to upload"],
    ["uploaded", "Uploaded"],
    ["covered", "Already on deadlock-api"],
    ["failed", "Failed"]
];

const when = (at : number) => `<t:${at}:R>`;
const pause = (until : number) => until > now() ? `paused until ${when(until)}` : "ok";

export async function execute(interaction : ChatInputCommandInteraction) {
    if(!await isOwner(interaction)) {
        return await interaction.reply({ embeds: [errorEmbed("Permissions Error", "Only the bot owner can see the status")], flags: MessageFlags.Ephemeral });
    }

    const at = now();
    const [summary, fetches] = await Promise.all([getSaltSummary(at), getFetchLog(at)]);

    const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
    const counts = ORDER.map(([k, label]) => `${label}: **${summary.counts[k] ?? 0}**`).join("\n");

    const budget = [`${fetches.length}/${SALT_FETCH_DAILY_CAP} GC fetches in the last 24h`];
    if(fetches.length > 0) {
        const last = Math.max(...fetches);
        const nextSlot = fetches.length >= SALT_FETCH_DAILY_CAP ? Math.min(...fetches) + 24 * 60 * 60 : last + SALT_FETCH_INTERVAL_MS / 1000;
        if(nextSlot > at) budget.push(`next slot ${when(nextSlot)}`);
    }

    const failures = summary.failures.length
        ? summary.failures.map(x => `\`${x.match_id}\` ${x.last_error ?? "unknown"} (${x.attempts} tries)`).join("\n")
        : "None";

    const queue = [`${summary.overdue} overdue`];
    if(summary.nextDue) queue.push(`next check ${when(summary.nextDue)}`);

    const seed = saltState.lastSeed ? `${when(saltState.lastSeed.at)}, queued ${saltState.lastSeed.added}` : "not yet";
    const err = saltState.lastApiError;

    await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [{
            title: "Match salt status",
            color: COLOURS.gold,
            description: `${total} matches tracked\n${counts}`,
            fields: [
                { name: "Queue", value: queue.join(", ") },
                { name: "GC budget", value: budget.join(", ") },
                {
                    name: "Services",
                    value: [
                        `Uploading: ${SALT_UPLOAD ? "on" : "off (SALT_UPLOAD=0)"}`,
                        `GC connected: ${SteamStore.get().gcReady ? "yes" : "no"}`,
                        `GC salt fetching: ${pause(saltState.gcPausedUntil)}`,
                        `deadlock-api: ${pause(saltState.apiPausedUntil)}`
                    ].join("\n")
                },
                { name: "Last deadlock-api error", value: err ? `${err.message} ${when(err.at)}` : "None" },
                { name: "Recent failures", value: failures },
                { name: "Backfill queued", value: seed }
            ]
        }]
    });
}
