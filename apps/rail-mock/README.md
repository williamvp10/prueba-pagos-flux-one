# @fluxone/rail-mock

Standalone Node 24 simulated bank rail. It uses Node's built-in HTTP server and SQLite database; it has no runtime package dependencies.

## Run

From this directory with Node 24:

```sh
npm run build
npm start
```

The service binds to `0.0.0.0:3004`. `npm run build` checks that Node 24 can parse and strip the TypeScript sources; runtime execution uses Node's built-in type stripping. Run tests with `npm test`. The test suite creates isolated SQLite files in the OS temporary directory and listens on ephemeral loopback ports.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3004` | HTTP listen port |
| `NODE_ENV` | Node default | Runtime environment supplied by the container |
| `RAIL_MODE` | `random` | `random` selects each of five outcomes with 20% probability; `test` consumes `RAIL_SCENARIOS` in order |
| `RAIL_SCENARIOS` | empty | Comma-separated `accepted,rejected,unavailable,timeout_processed,timeout_not_processed`; after exhaustion, `accepted` is used |
| `RAIL_DB_PATH` | `/data/rail.sqlite` | SQLite database path; mount a persistent volume at `/data` |

Test mode is intended for controlled private environments. Scenario selection is only available through process configuration and cannot be supplied in a request.

## Routes

- `POST /rail/transfers`
- `GET /rail/transfers/{reference}`
- `POST /rail/reversals`
- `GET /health/ready` (internal container readiness)

Money is parsed as decimal text and normalized to two places without floating point arithmetic. References are globally unique across operation kinds, payload hashes are persisted, and SQLite transactions serialize concurrent requests. A transfer query includes its most recent reversal attempt.

`timeout_processed` stores an accepted result before waiting 12 seconds. `timeout_not_processed` waits 12 seconds and returns 503 without storing an operation. A normal `unavailable` scenario returns 503 immediately. The client timeout target is 10 seconds.

## Container

Build from the repository root with:

```sh
docker build -f apps/rail-mock/Dockerfile -t fluxone-rail-mock apps/rail-mock
docker run --rm -p 3004:3004 -v rail-data:/data fluxone-rail-mock
```

The container runs as the unprivileged `node` user. The orchestration layer must provide a writable persistent volume at `/data`.
