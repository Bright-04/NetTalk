# NetTalk - LAN Terminal Chat

LAN Terminal Chat - a minimal terminal-style chat UI you can host on a LAN.

Features

- Single Python server that serves a terminal-like web UI
- WebSocket-based realtime chat (default port 8765)
- Basic security: server-side username sanitization, DOM-safe rendering, rate-limiting and per-IP connection caps

Requirements

- Python 3.8+ (Python 3.11+ recommended)

Quick start (Windows PowerShell)

1. Open PowerShell and change to the project folder:

2. Create and activate a venv (recommended) and install dependencies, or use the helper script:

    ```powershell
    # create + activate venv and install deps
    python -m venv .venv
    . .\.venv\Scripts\Activate.ps1
    python -m pip install --upgrade pip
    python -m pip install -r requirements.txt

    # OR let the project helper create a venv and install deps for you:
    .\run.ps1
    ```

3. Run the server (or it will be started by the helper):

    ```powershell
    python server.py
    ```

The server prints a recommended LAN URL (for example `http://192.168.0.115:8765`). Open that URL in other machines on the same network.

Troubleshooting

- If `aiohttp` fails to install on Python 3.13, use Python 3.11 (recommended). The included `run.ps1` supports bootstrapping with a different python via the `NETTALK_PYTHON` environment variable.
- If clients can't connect, add an inbound firewall rule for TCP port 8765 (Private profile recommended).

Recent improvements

- Graceful shutdown: server closes client websockets on shutdown and cancels background tasks.
- Periodic cleanup task prunes stale websockets and rate-limit buckets.
- Client-side reconnection/backoff with reconnect notices.

Configuration

- Port: edit `server.py` (variable `port`).

License & attribution

- This project is provided under the MIT license (see `LICENSE`).

---

Small, pragmatic, and focused - designed for a single host on your office LAN.
