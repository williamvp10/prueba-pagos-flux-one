const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
if (fs.existsSync(path.join(root, ".env")))
  process.loadEnvFile(path.join(root, ".env"));
if (!process.env.AMQP_URL && process.env.RABBITMQ_PASSWORD)
  process.env.AMQP_URL = `amqp://${encodeURIComponent(process.env.RABBITMQ_USER)}:${encodeURIComponent(process.env.RABBITMQ_PASSWORD)}@${process.env.AMQP_HOST || "localhost"}:${process.env.AMQP_PORT || "5672"}`;
module.exports = { root };
