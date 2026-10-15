require("./load-env.cjs");
const { root } = require("./load-env.cjs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const service = process.argv[2];
if (!["auth", "payments", "audit"].includes(service))
  throw Error("Unknown service");
const child = spawn(
  process.execPath,
  [path.join(root, `apps/${service}/dist/bootstrap/main.js`)],
  {
    cwd: root,
    env: { ...process.env, SERVICE_NAME: service },
    stdio: "inherit",
  },
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
