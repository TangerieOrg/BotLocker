import { GC_POLL_INTERVAL_MS } from "../config.ts";
import { logger } from "../helpers/log.ts";
import { diffSet, setEquals, watch, watchAll } from "../helpers/store.ts";
import { LinkStore, linkedAccounts } from "../links/LinkStore.ts";
import { isFriend, SteamStore } from "../steam/SteamStore.ts";
import { syncHistory } from "./history.ts";
import { cancelFollowUp, type Check, finish, followUp, queue, recorded, TrackerStore } from "./TrackerStore.ts";

// History can take a bit to include the match after someone closes the game
const CHECK_DELAYS_MS = [30, 120, 300, 600].map(x => x * 1000);

const { log, error } = logger("Tracker");

// Linked players the bot is friends with, the game coordinator only shows history for friends
const trackedAccounts = () => new Set([...linkedAccounts()].filter(isFriend));

async function runCheck(id : number, check : Check) {
    const found = await syncHistory(id).catch(err => {
        error(`Failed to check ${id}: ${(err as Error).message}`);
        return undefined;
    });

    // Lost the game coordinator part way, the runner tries again once it's back
    if(found == undefined && !SteamStore.get().gcReady) return;
    if(found) recorded();

    // Something else rescheduled it while this was running
    if(TrackerStore.get().checks.get(id) !== check) return;

    const next = check.attempt == null || found ? undefined : check.attempt + 1;
    if(next != null && next < CHECK_DELAYS_MS.length) return followUp(id, next, Date.now() + CHECK_DELAYS_MS[next]);

    if(check.attempt != null && !found) log(`${id} stopped playing but no new match showed up`);
    finish(id);
}

// One timer per check, re-armed whenever its check changes. Nothing runs without the game coordinator, due checks just wait for it
function startRunner() {
    const timers = new Map<number, { check: Check, timer: ReturnType<typeof setTimeout> }>();
    const running = new Set<number>();

    const run = async (id : number, check : Check) => {
        timers.delete(id);
        running.add(id);
        await runCheck(id, check);
        running.delete(id);
        arm();
    };

    const arm = () => {
        const { checks } = TrackerStore.get();
        const ready = SteamStore.get().gcReady;

        for(const [id, t] of timers) {
            if(ready && checks.get(id) === t.check) continue;
            clearTimeout(t.timer);
            timers.delete(id);
        }
        if(!ready) return;

        for(const [id, check] of checks) {
            if(timers.has(id) || running.has(id)) continue;
            timers.set(id, { check, timer: setTimeout(() => run(id, check), Math.max(0, check.at - Date.now())) });
        }
    };

    TrackerStore.subscribe(s => s.checks, arm);
    SteamStore.subscribe(s => s.gcReady, arm);
    arm();
}

export function startTracker() {
    // Just linked or just friended, backfill or catch up straight away
    watchAll([SteamStore, LinkStore], trackedAccounts, (cur, prev) => {
        for(const id of diffSet(cur, prev).added) queue(id, Date.now());
    }, setEquals);

    // Someone just closed Deadlock, check a few times until the match shows up
    watch(SteamStore, s => s.playing, (cur, prev) => {
        const { added, removed } = diffSet(cur, prev);
        for(const id of added) cancelFollowUp(id);

        const tracked = trackedAccounts();
        for(const id of removed.filter(x => tracked.has(x))) {
            log(`${id} stopped playing Deadlock, checking for a new match`);
            followUp(id, 0, Date.now() + CHECK_DELAYS_MS[0]);
        }
    });

    // Rare backstop for anything the stopped playing check missed
    setInterval(() => {
        for(const id of trackedAccounts()) queue(id, Date.now());
    }, GC_POLL_INTERVAL_MS);

    startRunner();
    log(`Checking friends when they stop playing, backstop every ${GC_POLL_INTERVAL_MS / 1000}s`);
}
