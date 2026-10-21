# HM-10: TaxLens hosted-mode image. See docs/HOSTED_MODE_SPEC.md and docs/HOSTING.md.
# Built on the server itself (linux/arm64 on OCI); also builds on x86_64 for local verification
# via scripts/verify-image.sh.

FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14 AS prod-deps
WORKDIR /app
COPY package.json bun.lock ./
# bun-plugin-tailwind declares the `bun` npm package as a peer dependency, which would pull in
# ~380 MB of duplicate Bun binaries (@oven/*). The base image already provides Bun.
RUN bun install --frozen-lockfile --production --omit peer

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app

# Hosted mode refuses to start unless these are coherent (HM-4). ANTHROPIC_API_KEY is
# deliberately not set here: it is injected at runtime from the server's env file.
ENV NODE_ENV=production \
    TAXLENS_HOSTED=true \
    TAX_UI_DATA_DIR=/data \
    TAX_UI_STATIC_DIR=/app/dist \
    TAXLENS_HOSTNAME=0.0.0.0

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json bunfig.toml tsconfig.json ./
COPY src ./src

RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:3005/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["bun", "src/index.ts", "--port", "3005"]
