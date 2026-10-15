FROM node:24.11.0-bookworm-slim
ENV NODE_ENV=production PORT=3004 RAIL_MODE=random RAIL_DB_PATH=/data/rail.sqlite
WORKDIR /app
COPY apps/rail-mock/package.json ./package.json
COPY apps/rail-mock/src ./src
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3004
VOLUME ["/data"]
CMD ["node", "--experimental-strip-types", "src/main.ts"]
