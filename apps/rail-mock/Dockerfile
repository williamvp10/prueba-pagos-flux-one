FROM node:24-slim
ENV NODE_ENV=production PORT=3004 RAIL_MODE=random RAIL_DB_PATH=/data/rail.sqlite
WORKDIR /app
COPY package.json ./
COPY src ./src
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 3004
VOLUME ["/data"]
CMD ["node", "--experimental-strip-types", "src/main.ts"]
