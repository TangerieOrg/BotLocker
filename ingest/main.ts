// Watches Steam's httpcache for Deadlock match downloads and sends the salts to BotLocker and deadlock-api.com
// Built into a windowless exe with deno task compile:ingest, installed as a logon task by install.ps1
import { parseArgs } from "@std/cli/parse-args";

const SERVER_URL = "https://tangerie.xyz/deadlock";
const DEADLOCK_API_URL = "https://api.deadlock-api.com/v1/matches/salts";
const VERSION = "1.2.0";

// Cache entries start with a header holding the host and path as separate NUL terminated strings
// deno-lint-ignore no-control-regex
const URL_PATTERN = /replay(\d+)\.valve\.net\x00?\/1422450\/(\d+)_(\d+)\.(meta|dem)\.bz2/;
const HEADER_BYTES = 512;
const BATCH_SIZE = 100;
const FLUSH_MS = 2000;
const RESCAN_MS = 60000;
const MAX_READ_ATTEMPTS = 60;
const MAX_BACKOFF_MS = 60000;
const MAX_LOG_BYTES = 1024 * 1024;

// Same shape as deadlock-api's ClickhouseSalts, one of the salts is null depending on which file it was
interface Salt {
    match_id: number;
    cluster_id: number;
    metadata_salt: number | null;
    replay_salt: number | null;
    username?: string;
}

const args = parseArgs(Deno.args, {
    string: ["server", "deadlock-api-url", "steam", "data"],
    boolean: ["once", "deadlock-api"],
    negatable: ["deadlock-api"],
    default: { "deadlock-api": true }
});
const server = (args.server ?? SERVER_URL).replace(/\/+$/, "");
const isWindows = Deno.build.os == "windows";

const dataDir = args.data ?? (isWindows ?
    `${Deno.env.get("LOCALAPPDATA")}\\botlocker-ingest` :
    `${Deno.env.get("HOME")}/.local/share/botlocker-ingest`);
Deno.mkdirSync(dataDir, { recursive: true });

const logPath = `${dataDir}/ingest.log`;
try {
    if(Deno.statSync(logPath).size > MAX_LOG_BYTES) Deno.removeSync(logPath);
} catch { /* no log yet */ }

const sleep = (ms : number) => new Promise(res => setTimeout(res, ms));

function log(...parts : unknown[]) {
    const line = `${new Date().toISOString()} ${parts.map(x => x instanceof Error ? x.message : String(x)).join(" ")}`;
    console.log(line);
    try {
        Deno.writeTextFileSync(logPath, line + "\n", { append: true });
    } catch { /* logging is best effort */ }
}

// Only one copy should watch, the logon task and a manual run would otherwise both send everything
async function lockInstance() {
    const file = await Deno.open(`${dataDir}/instance.lock`, { create: true, write: true });
    const locked = await Promise.race([file.lock(true).then(() => true), sleep(1000).then(() => false)]);
    if(!locked) {
        log("Another instance is already running");
        Deno.exit(0);
    }
}

async function findSteam() {
    if(args.steam) return args.steam;

    if(isWindows) {
        const out = await new Deno.Command("reg", { args: ["query", "HKCU\\Software\\Valve\\Steam", "/v", "SteamPath"] })
            .output().catch(() => undefined);
        const path = out?.success ? new TextDecoder().decode(out.stdout).match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1].trim() : undefined;
        return path ?? `${Deno.env.get("ProgramFiles(x86)") ?? "C:\\Program Files (x86)"}\\Steam`;
    }

    return `${Deno.env.get("HOME")}/.local/share/Steam`;
}

// "retry" means the file exists but couldn't be read yet, usually because Steam still has it open
async function readSalt(path : string) : Promise<Salt | undefined | "retry"> {
    let file;
    try {
        file = await Deno.open(path, { read: true });
        const buf = new Uint8Array(HEADER_BYTES);
        const n = await file.read(buf);
        if(!n) return undefined;

        const m = new TextDecoder("latin1").decode(buf.subarray(0, n)).match(URL_PATTERN);
        if(!m) return undefined;
        const salt = Number(m[3]);
        return {
            cluster_id: Number(m[1]),
            match_id: Number(m[2]),
            metadata_salt: m[4] == "meta" ? salt : null,
            replay_salt: m[4] == "dem" ? salt : null
        };
    } catch(err) {
        if(err instanceof Deno.errors.NotFound) return undefined;
        // Folders get events too
        return await Deno.stat(path).then(x => x.isDirectory).catch(() => false) ? undefined : "retry";
    } finally {
        file?.close();
    }
}

async function* walk(dir : string) : AsyncGenerator<string> {
    for await(const x of Deno.readDir(dir)) {
        const path = `${dir}/${x.name}`;
        if(x.isDirectory) yield* walk(path);
        else if(x.isFile) yield path;
    }
}

const saltKey = (x : Salt) => `${x.match_id}_${x.metadata_salt != null ? "meta" : "dem"}`;

// Each destination queues and retries on its own so one being down doesn't hold up the other
class Target {
    found = new Map<string, Salt>();
    sent = new Set<string>();
    backoff = 0;
    retryAt = 0;

    constructor(
        public name : string,
        public url : string,
        public accepts : (x : Salt) => boolean,
        public extra : Partial<Salt> = {}
    ) {}

    add(x : Salt) {
        const key = saltKey(x);
        if(!this.accepts(x) || this.sent.has(key) || this.found.has(key)) return false;
        this.found.set(key, x);
        return true;
    }

    async post(batch : Salt[]) {
        const res = await fetch(this.url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "User-Agent": `botlocker-ingest/${VERSION}` },
            body: JSON.stringify(batch.map(x => ({ ...x, ...this.extra })))
        });
        await res.body?.cancel();
        return res.status;
    }

    done(batch : Salt[]) {
        for(const x of batch) {
            const key = saltKey(x);
            this.found.delete(key);
            this.sent.add(key);
        }
    }

    async flush() {
        if(this.found.size == 0 || Date.now() < this.retryAt) return;

        const all = [...this.found.values()];
        for(let i = 0; i < all.length; i += BATCH_SIZE) {
            const batch = all.slice(i, i + BATCH_SIZE);
            try {
                const status = await this.post(batch);
                // deadlock-api rejects the whole batch if any salt fails its check, so find the bad ones
                if(status == 400) {
                    let bad = 0;
                    for(const x of batch) {
                        if(batch.length > 1 && await this.post([x]) == 400) bad++;
                        this.done([x]);
                    }
                    log(`${this.name} rejected ${batch.length == 1 ? 1 : bad} salt(s), dropped`);
                    continue;
                }
                if(status < 200 || status >= 300) throw new Error(`${status}`);
            } catch(err) {
                this.backoff = Math.min(MAX_BACKOFF_MS, this.backoff ? this.backoff * 2 : 2000);
                this.retryAt = Date.now() + this.backoff;
                log(`Failed to send ${batch.length} salt(s) to ${this.name}, retrying in ${this.backoff / 1000}s:`, err);
                return;
            }

            this.done(batch);
            this.backoff = 0;
            log(`Sent ${batch.length} salt(s) to ${this.name}`);
        }
    }
}

const targets = [
    // BotLocker only fetches the match metadata, not the replay
    new Target("BotLocker", `${server}/ingest/salts`, x => x.metadata_salt != null),
    ...(args["deadlock-api"] ? [new Target("deadlock-api", args["deadlock-api-url"] ?? DEADLOCK_API_URL, () => true, { username: "botlocker-ingest" })] : [])
];

const pending = () => targets.reduce((n, x) => n + x.found.size, 0);

function add(salt : Salt | undefined) {
    if(!salt) return;
    const added = targets.filter(x => x.add(salt));
    if(added.length > 0) log(`Found ${salt.metadata_salt != null ? "metadata" : "replay"} salt for match ${salt.match_id} (replay${salt.cluster_id})`);
}

async function flush() {
    await Promise.all(targets.map(x => x.flush()));
}

// Files Steam had locked, with how many times they've been tried
const unread = new Map<string, number>();

async function check(path : string) {
    const salt = await readSalt(path);
    if(salt != "retry") {
        unread.delete(path);
        add(salt);
        return;
    }

    const attempts = (unread.get(path) ?? 0) + 1;
    if(attempts == 1) log(`Couldn't read ${path} yet, retrying`);
    if(attempts >= MAX_READ_ATTEMPTS) {
        log(`Gave up reading ${path}`);
        unread.delete(path);
    } else unread.set(path, attempts);
}

// With since, only looks at files changed after it, which keeps the regular rescans cheap
async function scan(cacheDir : string, since = 0) {
    let files = 0;
    const before = pending();
    for await(const path of walk(cacheDir)) {
        if(since) {
            const mtime = await Deno.stat(path).then(x => x.mtime?.getTime() ?? 0).catch(() => 0);
            if(mtime < since) continue;
        }
        files++;
        await check(path);
    }
    if(!since || pending() > before) log(`Scanned ${files} cache file(s), ${pending()} salt(s) to send`);
}

async function watch(cacheDir : string) {
    const dirty = new Set<string>();
    const watcher = Deno.watchFs(cacheDir, { recursive: true });

    // Rescan regularly in case the watcher misses something, with some overlap for coarse mtimes
    let lastScan = Date.now();

    // Batch up events, Steam writes each file in a few chunks
    let busy = false;
    const timer = setInterval(async () => {
        if(busy) return;
        busy = true;
        try {
            const paths = new Set([...dirty, ...unread.keys()]);
            dirty.clear();
            for(const x of paths) await check(x);

            if(Date.now() - lastScan >= RESCAN_MS) {
                const since = lastScan - 5000;
                lastScan = Date.now();
                await scan(cacheDir, since);
            }

            await flush();
        } catch(err) {
            log("Check failed:", err);
        } finally {
            busy = false;
        }
    }, FLUSH_MS);

    try {
        for await(const event of watcher) {
            // Windows reports some writes as rename/any/other, so take everything but deletes
            if(event.kind == "remove" || event.kind == "access") continue;
            for(const x of event.paths) dirty.add(x);
        }
    } finally {
        clearInterval(timer);
        watcher.close();
    }
}

async function waitForDir(dir : string) {
    while(!(await Deno.stat(dir).then(x => x.isDirectory).catch(() => false))) {
        log(`Waiting for ${dir} to exist`);
        await sleep(60000);
    }
}

async function main() {
    await lockInstance();

    const steam = await findSteam();
    const cacheDir = `${steam}/appcache/httpcache`;
    log(`botlocker-ingest ${VERSION}, watching ${cacheDir}, sending to ${targets.map(x => x.url).join(", ")}`);

    if(args.once) {
        await scan(cacheDir);
        for(let i = 0; i < 5 && pending() > 0; i++) {
            await flush();
            if(pending() > 0) await sleep(Math.max(...targets.map(x => x.retryAt)) - Date.now());
        }
        Deno.exit(pending() == 0 ? 0 : 1);
    }

    await waitForDir(cacheDir);
    await scan(cacheDir);
    await flush();

    while(true) {
        try {
            await watch(cacheDir);
        } catch(err) {
            log("Watcher stopped:", err);
        }
        await sleep(10000);
        await waitForDir(cacheDir);
        // Anything written while the watcher was down
        await scan(cacheDir);
    }
}

main().catch(err => {
    log("Fatal:", err);
    Deno.exit(1);
});
