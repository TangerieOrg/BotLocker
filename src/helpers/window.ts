import { now } from "./now.ts";

// Loss counts (loserboard, announcements, status lines) cover this much time up to now
export const LOSS_WINDOW_S = 14 * 24 * 60 * 60;

export const lossWindowStart = () => now() - LOSS_WINDOW_S;
