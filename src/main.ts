import { startBot } from "./discord/bot.ts";
import { startServer } from "./server/mod.ts";

startServer();
await startBot();
