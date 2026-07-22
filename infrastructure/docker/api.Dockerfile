# syntax=docker/dockerfile:1

# ---- Base -----------------------------------------------------------------
FROM node:20-alpine AS base
RUN apk add --no-cache openssl && corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---- Dependencies + build --------------------------------------------------
FROM base AS build
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
# Reproducible builds: the lockfile is the single source of truth (C9).
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mep/api exec prisma generate
RUN pnpm --filter @mep/api run build

# ---- Runtime ---------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app ./
WORKDIR /app/apps/api
RUN chown -R node:node /app
USER node
EXPOSE 4000
# Apply migrations at container start, then boot the API.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main.js"]
