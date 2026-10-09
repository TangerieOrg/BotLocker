import { getMatch } from "../deadlock/api.ts";
import type { MatchMetadata } from "../deadlock/types.ts";
import { getMatchDetails, getMatchSalt } from "../db/mod.ts";
import { steamReady } from "../steam/client.ts";
import { getGcSalts, metadataRemaining } from "../steam/gc.ts";
import { ingestSalt, storeMatch } from "./ingest.ts";

// Stops repeated /match calls for a match that isn't ready yet from each costing a Steam bot request
const COOLDOWN_MS = 10 * 60 * 1000;
const failedAt = new Map<number, number>();

// Cheapest source first: stored, deadlock-api, a salt we already have, then asking the Steam bot (limited to 40 a day)
export async function loadScoreboard(matchId : number, { cooldown = false } = {}) : Promise<MatchMetadata | undefined> {
    const stored = await getMatchDetails(matchId);
    if(stored) return stored;
    if(cooldown && (failedAt.get(matchId) ?? 0) > Date.now() - COOLDOWN_MS) return undefined;

    const fromApi = await getMatch(matchId).catch(() => undefined);
    if(fromApi) {
        await storeMatch(fromApi);
        return fromApi;
    }

    // Already have the salt, Valve just hadn't published the file when we last tried
    const salt = await getMatchSalt(matchId);
    if(salt) {
        const meta = await ingestSalt({ match_id: matchId, cluster_id: salt.cluster, metadata_salt: salt.salt }, true);
        if(meta) return meta;
    } else if(steamReady() && await metadataRemaining() > 0) {
        try {
            const salts = await getGcSalts(matchId);
            const meta = await ingestSalt(salts, true);
            if(meta) return meta;
        } catch(err) {
            console.log(`[Scoreboard] Steam bot couldn't get match ${matchId}: ${(err as Error).message}`);
        }
    }

    failedAt.set(matchId, Date.now());
    return undefined;
}
