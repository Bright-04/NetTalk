import asyncio
import json
import logging
from aiohttp import web, WSMsgType


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    request.app['clients'].add(ws)
    username = None
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
                    await broadcast(request.app, {'type': 'join', 'from': username})
                elif data.get('type') == 'message':
                    text = data.get('text', '')
                    await broadcast(request.app, {'type': 'message', 'from': username or 'Anonymous', 'text': text})
            elif msg.type == WSMsgType.ERROR:
                logging.error('WebSocket connection closed with exception %s', ws.exception())
    finally:
        request.app['clients'].discard(ws)
        if username:
            await broadcast(request.app, {'type': 'leave', 'from': username})
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
    print(f"Starting server on 0.0.0.0:{port} - open http://<your-ip>:{port} in a browser")
    web.run_app(app, host='0.0.0.0', port=port)


if __name__ == '__main__':
    main()
