import { hasSalt, type Salts } from "../db/salts.ts";

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

// Their salt reads from the database allow 100 a second
export const SALT_READ_CONCURRENCY = 10;

// Never goes to Steam for it, that's a tighter limit shared with everyone else
async function getStoredSalts(matchId : number) : Promise<Salts | undefined> {
    const res = await request("salts", `${API_URL}/${matchId}/salts?disable_steam=true`);
    if(res.status == 404) {
        await res.body?.cancel();
        return undefined;
    }
    const x = await res.json() as Salts;
    return { cluster_id: x.cluster_id ?? null, metadata_salt: x.metadata_salt ?? null, replay_salt: x.replay_salt ?? null };
}

// The salts deadlock-api has stored for these matches, which is what covers them. Having the metadata doesn't count,
// we can fetch that ourselves with a salt. Any error is thrown, so a failed read is never mistaken for no salt
export async function getStoredSaltsFor(matchIds : number[]) : Promise<Map<number, Salts>> {
    const found = new Map<number, Salts>();
    for(let i = 0; i < matchIds.length; i += SALT_READ_CONCURRENCY) {
        await Promise.all(matchIds.slice(i, i + SALT_READ_CONCURRENCY).map(async id => {
            const salts = await getStoredSalts(id);
            if(salts && hasSalt(salts)) found.set(id, salts);
        }));
    }
    return found;
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
