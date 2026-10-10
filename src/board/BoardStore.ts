import { createStore } from "@tangerie/global-store/store";
import { getKv, setKv } from "../db/mod.ts";
import { now } from "../helpers/now.ts";
import { watch } from "../helpers/store.ts";

const PERIOD_KEY = "period_start";

interface BoardState {
    // The loserboard (and the loss totals in announcements) count from here, moved by /resetrecord
    periodStart: number;
}

const saved = await getKv(PERIOD_KEY);

export const BoardStore = createStore({
    state: { periodStart: saved ? Number(saved) : now() } as BoardState,
    actions: {
        resetPeriod: (s, at : number) => { s.periodStart = at }
    }
});

export const { resetPeriod } = BoardStore.actions;

watch(BoardStore, s => s.periodStart, x => {
    setKv(PERIOD_KEY, x.toString()).catch(err => console.error("[Board] Couldn't save the period start", err));
});
