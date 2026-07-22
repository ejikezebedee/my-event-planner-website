# ─────────────────────────────────────────────────────────────────────────────
# All-in-one demo image: PostgreSQL + API + Web in a single container.
# For production, use the split images in infrastructure/docker/ instead —
# see docs/DEPLOYMENT.md.
#
#   docker build -t my-event-planner .
#   docker run -p 3000:3000 my-event-planner
#
# Then open http://localhost:3000 and log in with
# demo@eventplanner.dev / Demo1234!
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql \
 && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

# Dependency manifests first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/config/package.json packages/config/
COPY packages/validation/package.json packages/validation/

# Empty client bundle API URL → browser calls same-origin /api/v1, which the
# web server proxies to the internal API (see apps/web/next.config.mjs).
ENV NEXT_PUBLIC_API_URL=""

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# The standalone web server needs static assets and public files beside it.
RUN cp -a apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && cp -a apps/web/public apps/web/.next/standalone/apps/web/public

COPY scripts/demo-start.sh /usr/local/bin/demo-start.sh
RUN chmod +x /usr/local/bin/demo-start.sh

ENV NODE_ENV=production \
    DATABASE_URL="postgresql://mep:mep@localhost:5432/my_event_planner" \
    WEB_ORIGIN="http://localhost:3000" \
    SESSION_COOKIE_SECURE=false \
    SWAGGER_ENABLED=true \
    SCHEDULER_ENABLED=true \
    REQUIRE_EMAIL_VERIFICATION=false \
    STORAGE_DRIVER=local \
    STORAGE_DIR=/app/apps/api/uploads \
    EMAIL_PROVIDER=console \
    AUTH_REGISTER_RATE_LIMIT=50 \
    AUTH_LOGIN_RATE_LIMIT=50 \
    API_INTERNAL_URL="http://localhost:4000" \
    PORT=3000

EXPOSE 3000
CMD ["demo-start.sh"]
