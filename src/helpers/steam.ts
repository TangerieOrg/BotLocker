const STEAM64_OFFSET = 76561197960265728n;

export const toSteam64 = (accountId : number) => (BigInt(accountId) + STEAM64_OFFSET).toString();

export function toAccountId(input : string) : number | undefined {
    const s = input.trim();

    const steam3 = s.match(/^\[?U:1:(\d+)\]?$/i);
    if(steam3) return Number(steam3[1]);

    const profile = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
    if(profile) return Number(BigInt(profile[1]) - STEAM64_OFFSET);

    if(/^\d{17}$/.test(s)) return Number(BigInt(s) - STEAM64_OFFSET);
    if(/^\d{1,10}$/.test(s)) return Number(s);

    return undefined;
}