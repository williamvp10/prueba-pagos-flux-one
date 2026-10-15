import { createRailServer } from './server.ts';

const port = Number(process.env.PORT ?? '3004');
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer between 1 and 65535');
const mode = process.env.RAIL_MODE ?? 'random';
const options = {
  dbPath: process.env.RAIL_DB_PATH ?? '/data/rail.sqlite',
  mode: mode as 'random' | 'test',
  scenarios: process.env.RAIL_SCENARIOS,
};
const app = createRailServer(options);
app.server.listen(port, '0.0.0.0', () => {
  console.log(`@fluxone/rail-mock listening on 0.0.0.0:${port} (${mode})`);
});

let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    void app.close().then(() => process.exit(0), (cause: unknown) => {
      console.error('Failed to close rail-mock cleanly', cause);
      process.exit(1);
    });
  });
}
