LAN Terminal Chat - Quick start

This minimal app hosts a simple terminal-like chat UI on your PC. Other users on the same LAN can open a browser to http://<your-ip>:8765 and chat in real-time.

Requirements

-   Python 3.8+

Windows (PowerShell) quick run

```powershell
cd "d:\\IT Study (2024 - 2025)\\NetTalk"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python server.py
```

Open a browser on another machine and go to http://<your-ip>:8765 (replace <your-ip> with the hosting PC's LAN IP). If Windows Firewall blocks access, allow Python or the chosen port (8765).

Notes

-   Very small scale (4-5 users) — suitable for office LAN.
-   UI intentionally simple and terminal-like.
-   To stop the server, press Ctrl+C in the PowerShell window running `server.py`.
