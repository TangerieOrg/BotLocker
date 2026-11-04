import { zstdDecompressSync } from "node:zlib";
import Bunzip from "seek-bzip";
import { decodeMeta } from "./proto.ts";

// Valve's replay servers are plain http, https on the same host gets no answer
export const metaUrl = (matchId : number, clusterId : number, metadataSalt : number) =>
    `http://replay${clusterId}.valve.net/1422450/${matchId}_${metadataSalt}.meta.bz2`;

export class MetaFetchError extends Error {
    constructor(public status : number) {
        super(`Metadata download failed (${status})`);
    }
}

// Still named .bz2 but newer files are zstd, so go by the magic bytes
function decompress(bytes : Uint8Array) : Uint8Array {
    if(bytes[0] == 0x28 && bytes[1] == 0xb5 && bytes[2] == 0x2f && bytes[3] == 0xfd) return new Uint8Array(zstdDecompressSync(bytes));
    if(bytes[0] == 0x42 && bytes[1] == 0x5a && bytes[2] == 0x68) return new Uint8Array(Bunzip.decode(bytes));
    throw new Error(`Unknown metadata compression (${Array.from(bytes.slice(0, 4), x => x.toString(16)).join(" ")})`);
}

export async function fetchMeta(matchId : number, clusterId : number, metadataSalt : number) {
    const res = await fetch(metaUrl(matchId, clusterId, metadataSalt), { signal: AbortSignal.timeout(60_000) });
    if(!res.ok) {
        await res.body?.cancel();
        throw new MetaFetchError(res.status);
    }
    return decodeMeta(decompress(new Uint8Array(await res.arrayBuffer())));
}
