import { loadSync } from "@std/dotenv";

// Real env vars win, then .env, then ENV_FILE (the docker secret in prod)
for(const envPath of [".env", Deno.env.get("ENV_FILE")]) {
    if(envPath) loadSync({ envPath, export: true });
}
