LAN Terminal Chat - Quick start

This minimal app hosts a simple terminal-like chat UI on your PC. Other users on the same LAN can open a browser to http://<your-ip>:8765 and chat in real-time.

Requirements

-   Python 3.8+

Windows (PowerShell) quick run

# NetTalk — LAN Terminal Chat

A minimal, secure, terminal-style chat server you can host on your PC for small office LAN use (4–5 users).

Features

-   Single Python server that serves a terminal-like web UI
-   WebSocket-based realtime chat (single IP:port, default 8765)
-   Basic security: input sanitization, DOM-safe client rendering, rate-limiting, per-IP connection limits
-   Lightweight and easy to run on Windows

Quick start (Windows PowerShell)

1. Open PowerShell and change to the project folder:

```powershell
cd "D:\IT Study (2024 - 2025)\NetTalk"
```

2. Create and activate a venv (recommended) and install dependencies:

```powershell
# create a virtual env using your Python 3.11+ (or 'py -3.11' if available)
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

3. Run the server:

```powershell
python server.py
```

The server prints a recommended LAN URL (for example `http://192.168.0.115:8765`). Open that URL in other machines on the same network.

Firewall

-   If clients cannot reach the server, add an inbound firewall rule for TCP port 8765 (Private profile recommended).

Security notes

-   Usernames are sanitized and made unique server-side.
-   Messages are sanitized and rendered with DOM-safe APIs to prevent XSS.
-   Simple per-IP token-bucket rate limiting is applied to prevent spam.
-   Concurrent connections from the same IP are limited (default 3).

Configuration (quick)

-   Port: edit `server.py` (variable `port`) to change the HTTP/WebSocket port.
-   Rate limits and connection caps live in `server.py` near the rate limiter and join logic.

Troubleshooting

-   If `aiohttp` fails to install on Python 3.13, use Python 3.11 (recommended) or switch to the Node.js server variant.
-   For client-side issues: open developer console in the browser and paste any errors back here.

Next steps

-   Add message persistence or history
-   Add authentication (optional) for private groups
-   Replace simple rate limits with per-user tokens or CAPTCHAs for stronger anti-abuse

License & attribution

-   Minimal project for private LAN use. Adapt as needed.

---

Small, pragmatic, and focused — designed to be run from a single host on your office LAN.
