import { createStore } from "@tangerie/global-store/store";

export interface Check {
    // When to look at their history next (ms)
    at: number;
    // Set when following up a game they just finished, retried until the match shows up
    attempt?: number;
}

interface TrackerState {
    // Accounts waiting on a history check, at most one each
    checks: Map<number, Check>;
    // Bumped whenever new matches are stored, the announcer reacts to it
    recorded: number;
}

export const TrackerStore = createStore({
    state: { checks: new Map(), recorded: 0 } as TrackerState,
    actions: {
        // Doesn't replace a check that's already waiting
        queue: (s, id : number, at : number) => { if(!s.checks.has(id)) s.checks.set(id, { at }) },
        followUp: (s, id : number, attempt : number, at : number) => { s.checks.set(id, { at, attempt }) },
        finish: (s, id : number) => { s.checks.delete(id) },
        recorded: (s) => { s.recorded++ }
    }
});

export const { queue, followUp, finish, recorded } = TrackerStore.actions;
