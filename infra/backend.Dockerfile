FROM node:24.11.0-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.25.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/backend-kit/package.json packages/backend-kit/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY apps/auth/package.json apps/auth/package.json
COPY apps/payments/package.json apps/payments/package.json
COPY apps/audit/package.json apps/audit/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/auth apps/auth
COPY apps/payments apps/payments
COPY apps/audit apps/audit
COPY docs docs
RUN pnpm build
FROM node:24.11.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node tools tools
USER node
CMD ["node","tools/run-service.cjs","payments"]
