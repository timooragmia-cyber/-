# Multi-stage build → small runtime image running as non-root.
FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# prisma.config.ts requires DATABASE_URL even for `prisma generate` (postinstall). A placeholder
# is passed to these build steps only: it is never stored in the image and never connected to.
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN DATABASE_URL="$BUILD_DATABASE_URL" npm ci

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG BUILD_DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN DATABASE_URL="$BUILD_DATABASE_URL" npx prisma generate && DATABASE_URL="$BUILD_DATABASE_URL" npm run build

FROM public.ecr.aws/docker/library/node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# Chromium renders the PDF reports (src/server/reports/pdf.ts). Fonts are embedded in the
# HTML, so no extra font packages are needed for Hebrew/Arabic.
RUN apt-get update && apt-get install -y --no-install-recommends chromium && rm -rf /var/lib/apt/lists/*
ENV CHROMIUM_PATH=/usr/bin/chromium
RUN useradd --system --uid 1001 app && mkdir -p /app/storage && chown app /app/storage
COPY --from=build --chown=app /app/.next/standalone ./
COPY --from=build --chown=app /app/.next/static ./.next/static
COPY --from=build --chown=app /app/messages ./messages
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# One-off migration image: docker compose run --rm migrate
FROM deps AS migrate
COPY . .
CMD ["sh", "-c", "npx prisma migrate deploy"]
