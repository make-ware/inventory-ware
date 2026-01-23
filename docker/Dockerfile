# Multi-stage build for Next.js + PocketBase monorepo
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat unzip curl
WORKDIR /app

# Install Yarn v4
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Copy package files
COPY package.json yarn.lock .yarnrc.yml* ./
COPY webapp/package.json ./webapp/
COPY shared/package.json ./shared/
COPY pocketbase/package.json ./pocketbase/

# Install dependencies
RUN yarn install --immutable

# Download PocketBase binary
# Supports multi-architecture builds via TARGETARCH
ARG POCKETBASE_VERSION=0.35.0
ARG TARGETARCH
RUN mkdir -p /app/pocketbase && \
    POCKETBASE_ARCH=$(case "${TARGETARCH}" in \
        "amd64") echo "amd64" ;; \
        "arm64") echo "arm64" ;; \
        *) echo "amd64" ;; \
    esac) && \
    echo "Downloading PocketBase v${POCKETBASE_VERSION} for architecture: ${POCKETBASE_ARCH}" && \
    curl -f -L -S "https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_${POCKETBASE_ARCH}.zip" \
    -o /tmp/pocketbase.zip && \
    unzip /tmp/pocketbase.zip -d /app/pocketbase && \
    chmod +x /app/pocketbase/pocketbase && \
    rm /tmp/pocketbase.zip

# Build stage
FROM base AS builder
WORKDIR /app

# Build argument for NEXT_PUBLIC_POCKETBASE_URL
# - Production/Staging: "/" (routes through nginx)
# - Development: "http://localhost:8090" (direct connection)
ARG NEXT_PUBLIC_POCKETBASE_URL="/"

# Install Yarn v4
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.yarn ./.yarn
COPY --from=deps /app/pocketbase/pocketbase ./pocketbase/pocketbase

# Copy workspace files
COPY package.json yarn.lock .yarnrc.yml* ./
COPY webapp ./webapp
COPY shared ./shared
COPY pocketbase/pb_hooks ./pocketbase/pb_hooks
COPY pocketbase/pb_migrations ./pocketbase/pb_migrations
COPY pocketbase/package.json ./pocketbase/package.json

# Build shared package first (required by webapp)
RUN yarn workspace @project/shared build

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_POCKETBASE_URL=${NEXT_PUBLIC_POCKETBASE_URL}
RUN yarn workspace @project/webapp build

# Ensure pb_migrations exists
RUN mkdir -p /app/pocketbase/pb_migrations

# -----------------------------------------------------------------------------
# Base Runner (Common setup for all runner stages)
# -----------------------------------------------------------------------------
FROM base AS runner-base
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Yarn v4
RUN corepack enable && corepack prepare yarn@4.12.0 --activate

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    adduser nextjs nodejs

# Create cache directories for Node.js and Yarn with proper permissions
RUN mkdir -p /app/.cache/node /app/.yarn/cache && \
    chown -R nextjs:nodejs /app/.cache /app/.yarn/cache

# Copy package files for workspace resolution
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/yarn.lock ./
COPY --from=builder --chown=nextjs:nodejs /app/.yarn ./.yarn
COPY --from=builder --chown=nextjs:nodejs /app/.yarnrc.yml ./.yarnrc.yml

# Copy node_modules (production deps)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# -----------------------------------------------------------------------------
# Monolith Target
# -----------------------------------------------------------------------------
FROM runner-base AS monolith

# Set default log level
ENV LOG_LEVEL=warn
ENV POCKETBASE_URL="http://localhost:8090"

# Install supervisor, nginx, and curl
RUN apk add --no-cache supervisor nginx curl && \
    rm -rf /var/cache/apk/*

# Create directories for supervisor and nginx
RUN mkdir -p /var/log/supervisor /var/run /etc/supervisor/conf.d && \
    mkdir -p /var/log/nginx /var/cache/nginx /var/run/nginx && \
    chown -R nextjs:nodejs /var/log/supervisor /var/run && \
    chown -R nginx:nginx /var/log/nginx /var/cache/nginx /var/run/nginx

# Copy PocketBase binary and files
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pocketbase ./pocketbase/pocketbase
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pb_hooks ./pocketbase/pb_hooks
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pb_migrations ./pocketbase/pb_migrations

# Create pb_data and pb_storage directories in /data
RUN mkdir -p /data/pb_data /data/pb_storage && \
    chown -R nextjs:nodejs /data

# Copy workspace package.json files
COPY --from=builder --chown=nextjs:nodejs /app/webapp/package.json ./webapp/
COPY --from=builder --chown=nextjs:nodejs /app/shared/package.json ./shared/
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/package.json ./pocketbase/

# Copy built application files
COPY --from=builder --chown=nextjs:nodejs /app/webapp/.next ./webapp/.next
COPY --from=builder --chown=nextjs:nodejs /app/webapp/public ./webapp/public
COPY --from=builder --chown=nextjs:nodejs /app/webapp/next.config.ts ./webapp/next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/webapp/tsconfig.json ./webapp/tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/shared/dist ./shared/dist

# Copy config scripts
COPY --chown=root:root docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY --chown=root:root docker/nginx.conf /etc/nginx/nginx.conf
COPY --chown=nextjs:nodejs docker/start.sh /app/start.sh
COPY --chown=root:root docker/graceful-shutdown.sh /app/docker/graceful-shutdown.sh

RUN chmod +x /app/start.sh && \
    chmod +x /app/docker/graceful-shutdown.sh && \
    chmod 644 /etc/nginx/nginx.conf

EXPOSE 80
ENV HOSTNAME="0.0.0.0"
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["/app/start.sh"]

# -----------------------------------------------------------------------------
# Webapp Target
# -----------------------------------------------------------------------------
FROM runner-base AS webapp

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Install curl for healthcheck
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Copy necessary package.json
COPY --from=builder --chown=nextjs:nodejs /app/webapp/package.json ./webapp/
COPY --from=builder --chown=nextjs:nodejs /app/shared/package.json ./shared/

# Copy built files
COPY --from=builder --chown=nextjs:nodejs /app/webapp/.next ./webapp/.next
COPY --from=builder --chown=nextjs:nodejs /app/webapp/public ./webapp/public
COPY --from=builder --chown=nextjs:nodejs /app/webapp/next.config.ts ./webapp/next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/webapp/tsconfig.json ./webapp/tsconfig.json
COPY --from=builder --chown=nextjs:nodejs /app/shared/dist ./shared/dist

USER nextjs
EXPOSE 3000

CMD ["yarn", "workspace", "@project/webapp", "start"]

# -----------------------------------------------------------------------------
# PocketBase Target
# -----------------------------------------------------------------------------
FROM runner-base AS pocketbase

# Install curl
RUN apk add --no-cache curl && \
    rm -rf /var/cache/apk/*

# Copy PocketBase binary and files
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pocketbase ./pocketbase/pocketbase
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pb_hooks ./pocketbase/pb_hooks
COPY --from=builder --chown=nextjs:nodejs /app/pocketbase/pb_migrations ./pocketbase/pb_migrations

# Create pb_data and pb_storage directories in /data
RUN mkdir -p /data/pb_data /data/pb_storage && \
    chown -R nextjs:nodejs /data

USER nextjs
EXPOSE 8090

CMD ["./pocketbase/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/data/pb_data", "--migrationsDir=/app/pocketbase/pb_migrations"]
