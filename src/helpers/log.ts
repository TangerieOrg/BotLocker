export const logger = (prefix : string) => ({
    log: (...data : unknown[]) => console.log(`[${prefix}]`, ...data),
    error: (...data : unknown[]) => console.error(`[${prefix}]`, ...data)
});
