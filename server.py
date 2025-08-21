import asyncio
import json
import logging
import socket
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
                    username = data.get('username', 'Anonymous')
                    ws._username = username
                    ws._ip = peer_ip
                    await broadcast(request.app, {'type': 'join', 'from': username, 'ip': peer_ip})
                elif data.get('type') == 'message':
                    text = data.get('text', '')
                    await broadcast(request.app, {'type': 'message', 'from': username or 'Anonymous', 'ip': peer_ip, 'text': text})
            elif msg.type == WSMsgType.ERROR:
                logging.error('WebSocket connection closed with exception %s', ws.exception())
    finally:
        request.app['clients'].discard(ws)
        if username:
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
    return web.FileResponse('./static/index.html')


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
