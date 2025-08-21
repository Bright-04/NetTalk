import asyncio
import json
import logging
import socket
import re
import secrets
from aiohttp import web, WSMsgType


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    request.app['clients'].add(ws)
    username = None
    # determine peer ip for this websocket connection
    peer_ip = None
    try:
        peer_ip = request.remote
    except Exception:
        peer_ip = None
    if not peer_ip:
        try:
            peer = request.transport.get_extra_info('peername')
            if isinstance(peer, tuple) and len(peer) >= 1:
                peer_ip = peer[0]
        except Exception:
            peer_ip = None
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except Exception:
                    continue
                if data.get('type') == 'join':
                    raw_name = (data.get('username') or 'Anonymous')
                    # sanitize username
                    def sanitize_name(n):
                        # remove control chars
                        n = ''.join(ch for ch in n if ch == '\t' or ch == '\n' or (32 <= ord(ch) <= 0x10FFFF))
                        n = n.strip()
                        # allow only these chars
                        n = re.sub(r"[^A-Za-z0-9 _\-]", "", n)
                        if not n:
                            n = 'User' + format(secrets.randbelow(10000), '04d')
                        if len(n) > 32:
                            n = n[:32]
                        return n

                    clean_name = sanitize_name(raw_name)
                    # ensure uniqueness among active users
                    base = clean_name
                    suffix = 1
                    usernames = request.app.setdefault('usernames', set())
                    while clean_name in usernames:
                        suffix += 1
                        clean_name = f"{base}-{suffix}"
                        if len(clean_name) > 32:
                            # truncate keeping suffix
                            clean_name = clean_name[:28] + f"-{suffix}"

                    username = clean_name
                    ws._username = username
                    ws._ip = peer_ip
                    usernames.add(username)
                    # Tell the joining client their final assigned name
                    try:
                        await ws.send_str(json.dumps({'type': 'welcome', 'username': username}))
                    except Exception:
                        pass
                    await broadcast(request.app, {'type': 'join', 'from': username, 'ip': peer_ip})
                elif data.get('type') == 'message':
                    text = data.get('text', '') or ''
                    # basic sanitization server-side: remove null bytes and limit length
                    try:
                        # remove control characters except common whitespace
                        cleaned = ''.join(ch for ch in text if ch == '\n' or ch == '\t' or (32 <= ord(ch) <= 0x10FFFF))
                    except Exception:
                        cleaned = text
                    max_len = 2000
                    if len(cleaned) > max_len:
                        cleaned = cleaned[:max_len]
                    await broadcast(request.app, {'type': 'message', 'from': username or 'Anonymous', 'ip': peer_ip, 'text': cleaned})
            elif msg.type == WSMsgType.ERROR:
                logging.error('WebSocket connection closed with exception %s', ws.exception())
    finally:
        request.app['clients'].discard(ws)
        if username:
            try:
                request.app.get('usernames', set()).discard(username)
            except Exception:
                pass
            await broadcast(request.app, {'type': 'leave', 'from': username, 'ip': getattr(ws, '_ip', None)})
    return ws


async def broadcast(app, message):
    data = json.dumps(message)
    to_remove = []
    for ws in set(app['clients']):
        if ws.closed:
            to_remove.append(ws)
            continue
        try:
            await ws.send_str(data)
        except Exception:
            to_remove.append(ws)
    for ws in to_remove:
        app['clients'].discard(ws)


async def index(request):
    resp = web.FileResponse('./static/index.html')
    # add a few safe headers
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    return resp


def main():
    app = web.Application()
    app['clients'] = set()
    app.add_routes([
        web.get('/', index),
        web.get('/ws', websocket_handler),
        web.static('/static', './static'),
    ])
    port = 8765
    # try to find a usable LAN IPv4 address for display
    def get_lan_ip():
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            # doesn't need to be reachable; used to pick the outbound interface
            s.connect(('198.51.100.1', 80))
            addr = s.getsockname()[0]
        except Exception:
            addr = '127.0.0.1'
        finally:
            s.close()
        return addr

    lan_ip = get_lan_ip()
    print(f"Starting server on 0.0.0.0:{port} - open http://{lan_ip}:{port} in a browser (or use your host IP)")
    web.run_app(app, host='0.0.0.0', port=port)


if __name__ == '__main__':
    main()
