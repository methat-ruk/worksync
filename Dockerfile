# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY app/backend/package.json app/backend/package.json
COPY app/frontend/package.json app/frontend/package.json
COPY packages/auth-policy/package.json packages/auth-policy/package.json
RUN corepack pnpm install --frozen-lockfile

FROM dependencies AS source
COPY . .
RUN corepack pnpm --filter @worksync/auth-policy build

FROM source AS frontend-builder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
ARG NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=false
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=$NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED
ENV NEXT_STANDALONE=true
RUN corepack pnpm --filter @worksync/frontend build

FROM node:22-bookworm-slim AS frontend
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --chown=node:node --from=frontend-builder /workspace/app/frontend/.next/standalone ./
COPY --chown=node:node --from=frontend-builder /workspace/app/frontend/.next/static ./app/frontend/.next/static
USER node
EXPOSE 3000
CMD ["node", "app/frontend/server.js"]

FROM source AS backend-builder
RUN corepack pnpm --filter @worksync/backend prisma:generate
RUN corepack pnpm --filter @worksync/backend build

FROM node:22-bookworm-slim AS backend
ENV NODE_ENV=production
ENV PORT=4000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY --chown=node:node --from=backend-builder /workspace/node_modules ./node_modules
COPY --chown=node:node --from=backend-builder /workspace/app/backend/node_modules ./app/backend/node_modules
COPY --chown=node:node --from=backend-builder /workspace/app/backend/dist ./app/backend/dist
COPY --chown=node:node --from=backend-builder /workspace/app/backend/prisma ./app/backend/prisma
COPY --chown=node:node --from=backend-builder /workspace/app/backend/prisma.config.ts ./app/backend/prisma.config.ts
COPY --chown=node:node --from=backend-builder /workspace/app/backend/package.json ./app/backend/package.json
COPY --chown=node:node --from=backend-builder /workspace/packages/auth-policy ./packages/auth-policy
WORKDIR /workspace/app/backend
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
