// One line from stdin, undefined if there's nothing to read (e.g. running in Docker)
export async function readLine() {
    const buf = new Uint8Array(64);
    const n = await Deno.stdin.read(buf).catch(() => null);
    return n ? new TextDecoder().decode(buf.subarray(0, n)).trim() || undefined : undefined;
}