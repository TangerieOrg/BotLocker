import { startDbServer } from "./db/server.ts";
import { startIngest } from "./ingest.ts";

startDbServer();
await startIngest();
