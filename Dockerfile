FROM denoland/deno:2.9.2

WORKDIR /app
ENV DATA_DIR=/app/data

COPY deno.json deno.lock ./
RUN deno install --frozen

COPY . .
RUN deno cache src/main.ts src/discord/commands/*.ts
# Fetch the prebuilt sqlite lib at build time instead of on first start
RUN deno eval --unstable-ffi "import { Database } from '@db/sqlite'; new Database(':memory:').close();"

ENTRYPOINT ["deno"]
CMD ["run", "-A", "src/main.ts"]
