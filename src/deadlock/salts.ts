import type { Salts } from "../db/salts.ts";

const API_URL = "https://api.deadlock-api.com/v1/matches";
const TIMEOUT_MS = 30000;

export class ApiError extends Error {
    constructor(public status : number, what : string) {
        super(`deadlock-api ${what} ${status}`);
    }
}

async function request(what : string, url : string, init? : RequestInit) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if(!res.ok && res.status != 404) {
        await res.body?.cancel();
        throw new ApiError(res.status, what);
    }
    return res;
}

// Which of these matches deadlock-api already has, and so already has the salts for. 100 at a time
export async function getKnownMatches(matchIds : number[]) : Promise<Set<number>> {
    const res = await request("metadata", `${API_URL}/metadata?match_ids=${matchIds.join(",")}&include_info=true`);
    // Nothing found at all comes back as a 404
    if(res.status == 404) {
        await res.body?.cancel();
        return new Set();
    }
    const rows = await res.json() as { match_id: number }[];
    return new Set(rows.map(x => x.match_id));
}

// Never goes to Steam for it, that's a tighter limit shared with everyone else
export async function getStoredSalts(matchId : number) : Promise<Salts | undefined> {
    const res = await request("salts", `${API_URL}/${matchId}/salts?disable_steam=true`);
    if(res.status == 404) {
        await res.body?.cancel();
        return undefined;
    }
    const x = await res.json() as Salts;
    return { cluster_id: x.cluster_id ?? null, metadata_salt: x.metadata_salt ?? null, replay_salt: x.replay_salt ?? null };
}

export interface SaltUpload extends Salts {
    match_id: number;
}

// A 400 means it didn't like the salts, there's no point sending those again
export async function uploadSalts(entries : SaltUpload[], username : string) {
    const body = entries.map(x => ({
        match_id: x.match_id, cluster_id: x.cluster_id, metadata_salt: x.metadata_salt, replay_salt: x.replay_salt, username
    }));
    const res = await request("salt upload", `${API_URL}/salts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    await res.body?.cancel();
}
