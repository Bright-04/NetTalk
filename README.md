# NetTalk — LAN Terminal Chat (Node/Express)

NetTalk is a minimal terminal-style chat UI you can host on your LAN. This repository contains a Node.js + Express server with a WebSocket backend and a small client UI in `static/`.

This README focuses on the Node/Express port and the project layout used for easy extension (for example, adding a Postgres-backed user store).

## Quick start (Windows PowerShell)

Prerequisite: Node.js v14+ installed.

From the project root:

```powershell
# install dependencies (use npm ci for CI / reproducible installs)
npm ci

# start the server
npm start
```

The server serves `static/` and listens on port 8765 by default. On start the process prints a suggested LAN URL (for example `http://192.168.0.115:8765`) you can open from other machines on the same network.

Dev run (auto-reload):

```powershell
npm run dev
```

## Project layout

-   `src/` — application source
    -   `src/app.js` — Express app factory + WebSocket handlers (no TCP binding; easy to test)
    -   `src/server.js` — startup script that creates the HTTP server and listens
    -   `src/config/` — centralized configuration (env-driven)
    -   `src/db/` — DB wrapper (Postgres-ready using `pg`)
    -   `src/services/` — service layer (user/chat abstractions)
-   `static/` — client UI (HTML/CSS/JS)
-   `.github/workflows/` — CI workflow (Node smoke checks)
-   `package.json` — project metadata, scripts and dependencies

This layout isolates transport (HTTP/WebSocket) code from business logic and data access, which makes adding tests, persistence, or further services easier.

## Configuration

Configuration uses environment variables following 12-factor principles. Important variables:

-   `PORT` — TCP port to listen on (default: 8765)
-   `DATABASE_URL` — Postgres connection string (e.g. `postgres://user:pass@host:5432/nettalk`)

Example (PowerShell):

```powershell
$env:PORT = 3000
$env:DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/nettalk'
npm start
```

## Postgres / Render notes

The repo includes a small DB wrapper in `src/db` that uses `pg` when `DATABASE_URL` is present. Notes for future DB work and deployment on Render:

-   During initial development the DB wrapper can remain unconfigured so the app runs without a DB.
-   When adding persistence, implement migrations and wire `src/services` to use `src/db` for CRUD operations.
-   For Render, provision a Postgres instance and set `DATABASE_URL` in the service environment. Use a single `pg.Pool` per process and prefer environment-managed credentials.

## Development guidance

-   Keep the `app` logic (routing, WebSocket message handling) in `src/app.js` — this is easy to import and unit test without binding a network port.
-   Keep startup and process lifecycle (listen, SIGTERM handling) in `src/server.js` so containers and orchestration tools can manage restarts.
-   Add small unit tests that import `createApp()` and assert the returned `app` and `wss` objects exist before adding integration tests that exercise the network stack.

## CI

A minimal GitHub Actions workflow exists in `.github/workflows/node-ci.yml`. It runs `npm ci` and a quick smoke check. Add linting and tests to the workflow as the project grows.

## Contributing

Contributions welcome. When possible:

-   Keep changes small and well-tested.
-   Add or update tests for new behavior.
-   Update this README with any new developer-facing instructions.

## License

This project is released under the MIT License — see `LICENSE` for details.

# NetTalk — LAN Terminal Chat (Node/Express)

NetTalk is a minimal terminal-style chat UI you can host on your LAN. This repository contains a Node.js + Express server with a WebSocket backend and a small client UI in `static/`.

This README focuses on the Node/Express port and the project layout used for easy extension (for example, adding a Postgres-backed user store).

## Quick start (Windows PowerShell)

Prerequisite: Node.js v14+ installed.

From the project root:

```powershell
# install dependencies (use npm ci for CI / reproducible installs)
npm ci

# start the server
npm start
```

The server serves `static/` and listens on port 8765 by default. On start the process prints a suggested LAN URL (for example `http://192.168.0.115:8765`) you can open from other machines on the same network.

Dev run (auto-reload):

```powershell
npm run dev
```

## Project layout

-   `src/` — application source
    -   `src/app.js` — Express app factory + WebSocket handlers (no TCP binding; easy to test)
    -   `src/server.js` — startup script that creates the HTTP server and listens
    -   `src/config/` — centralized configuration (env-driven)
    -   `src/db/` — DB wrapper (Postgres-ready using `pg`)
    -   `src/services/` — service layer (user/chat abstractions)
-   `static/` — client UI (HTML/CSS/JS)
-   `.github/workflows/` — CI workflow (Node smoke checks)
-   `package.json` — project metadata, scripts and dependencies

This layout isolates transport (HTTP/WebSocket) code from business logic and data access, which makes adding tests, persistence, or further services easier.

## Configuration

Configuration uses environment variables following 12-factor principles. Important variables:

-   `PORT` — TCP port to listen on (default: 8765)
-   `DATABASE_URL` — Postgres connection string (e.g. `postgres://user:pass@host:5432/nettalk`)

Example (PowerShell):

```powershell
$env:PORT = 3000
$env:DATABASE_URL = 'postgres://user:pass@127.0.0.1:5432/nettalk'
npm start
```

## Postgres / Render notes

The repo includes a small DB wrapper in `src/db` that uses `pg` when `DATABASE_URL` is present. Notes for future DB work and deployment on Render:

-   During initial development the DB wrapper can remain unconfigured so the app runs without a DB.
-   When adding persistence, implement migrations and wire `src/services` to use `src/db` for CRUD operations.
-   For Render, provision a Postgres instance and set `DATABASE_URL` in the service environment. Use a single `pg.Pool` per process and prefer environment-managed credentials.

## Development guidance

-   Keep the `app` logic (routing, WebSocket message handling) in `src/app.js` — this is easy to import and unit test without binding a network port.
-   Keep startup and process lifecycle (listen, SIGTERM handling) in `src/server.js` so containers and orchestration tools can manage restarts.
-   Add small unit tests that import `createApp()` and assert the returned `app` and `wss` objects exist before adding integration tests that exercise the network stack.

## CI

A minimal GitHub Actions workflow exists in `.github/workflows/node-ci.yml`. It runs `npm ci` and a quick smoke check. Add linting and tests to the workflow as the project grows.

## Contributing

Contributions welcome. When possible:

-   Keep changes small and well-tested.
-   Add or update tests for new behavior.
-   Update this README with any new developer-facing instructions.

## License

This project is released under the MIT License — see `LICENSE` for details.

# NetTalk — LAN Terminal Chat (Node/Express)

NetTalk is a minimal terminal-style chat UI you can host on your LAN. This repository now uses a Node.js + Express server with a WebSocket backend.

Quick start

Prerequisite: Node.js v14+ installed.

From the project root:

```powershell
# install dependencies
npm install

# start the server
npm start
```

The server serves `static/` and listens on port 8765 by default. Open the printed LAN URL (for example `http://192.168.0.115:8765`) in a browser on another LAN machine.

Project layout

-   `src/` — server source (Express + ws WebSocket handler)
-   `static/` — client web UI (HTML/CSS/JS)
-   `package.json` — Node dependencies and scripts

Suggested structure (what I added)

-   `src/config/` — centralized configuration (env-based)
-   `src/db/` — database client wrapper (Postgres `pg` integration planned)
-   `src/services/` — application services (user/chat abstractions)

This layout is intended to make it quick to add a Postgres-backed
implementation later (via `src/db`), while keeping the WebSocket and
transport code focused on messaging.

Notes

-   The server prints a suggested LAN address on start.
-   To change the port, set environment variable `PORT` before running (for example: `$env:PORT=3000; npm start`).

License

This project is MIT licensed — see `LICENSE`.
