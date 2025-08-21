import asyncio
import json
import logging
import os
import socket
import re
import secrets
import time
from aiohttp import web, WSMsgType

# module logger
logger = logging.getLogger(__name__)


async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    request.app['clients'].add(ws)
    username = None
    # determine peer ip for this websocket connection
    peer_ip = None
    # helper: token-bucket rate limiter
    def allow_action(app, ip, cost=1):
        if not ip:
            return True, 0
        buckets = app.setdefault('rate_buckets', {})
        now = time.time()
        # config
        capacity = 8
        refill_per_sec = 1.0
        b = buckets.get(ip)
        if b is None:
            b = {'tokens': capacity, 'ts': now}
        # refill
        elapsed = now - b['ts']
        if elapsed > 0:
            add = elapsed * refill_per_sec
            b['tokens'] = min(capacity, b['tokens'] + add)
            b['ts'] = now
        if b['tokens'] >= cost:
            b['tokens'] -= cost
            buckets[ip] = b
            return True, 0
        else:
            # calculate retry-after seconds
            needed = cost - b['tokens']
            retry_after = int((needed / refill_per_sec) + 1)
            buckets[ip] = b
            return False, retry_after

    try:
        peer_ip = request.remote
    except Exception as e:
        logger.debug('unable to read request.remote: %s', e)
        peer_ip = None
    if not peer_ip:
        try:
            peer = request.transport.get_extra_info('peername')
            if isinstance(peer, tuple) and len(peer) >= 1:
                peer_ip = peer[0]
        except Exception as e:
            logger.debug('unable to get peername: %s', e)
            peer_ip = None
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                try:
                    data = json.loads(msg.data)
                except Exception as e:
                    logger.warning('failed to parse JSON from %s: %s', peer_ip, e)
                    # ignore malformed client messages
                    continue
                if data.get('type') == 'join':
                    allowed, retry = allow_action(request.app, peer_ip, cost=1)
                    if not allowed:
                        try:
                            await ws.send_str(json.dumps({'type': 'rate_limited', 'retry_after': retry}))
                        except Exception as e:
                            logger.info('failed to send rate_limited to %s: %s', peer_ip, e)
                        continue
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
                    # enforce per-IP concurrent login limit
                    ip_counts = request.app.setdefault('ip_counts', {})
                    if peer_ip:
                        current = ip_counts.get(peer_ip, 0)
                        if current >= 3:
                            # refuse join
                            try:
                                await ws.send_str(json.dumps({'type': 'too_many_logins', 'limit': 3}))
                            except Exception as e:
                                logger.info('failed to send too_many_logins to %s: %s', peer_ip, e)
                            continue

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
                    # increment per-ip count
                    if peer_ip:
                        ip_counts[peer_ip] = ip_counts.get(peer_ip, 0) + 1
                    # Tell the joining client their final assigned name
                    try:
                        await ws.send_str(json.dumps({'type': 'welcome', 'username': username}))
                    except Exception as e:
                        logger.info('failed to send welcome to %s (user=%s): %s', peer_ip, username, e)
                    await broadcast(request.app, {'type': 'join', 'from': username, 'ip': peer_ip})
                    # Broadcast the current users list after a successful join so clients can render it
                    try:
                        users = sorted(list(request.app.get('usernames', set())))
                        await broadcast(request.app, {'type': 'users', 'users': users})
                    except Exception:
                        logger.exception('failed to broadcast users list after join')
                elif data.get('type') == 'message':
                    allowed, retry = allow_action(request.app, peer_ip, cost=1)
                    if not allowed:
                        try:
                            await ws.send_str(json.dumps({'type': 'rate_limited', 'retry_after': retry}))
                        except Exception as e:
                            logger.info('failed to send rate_limited to %s: %s', peer_ip, e)
                        continue
                    text = data.get('text', '') or ''
                    # basic sanitization server-side: remove null bytes and limit length
                    try:
                        # remove control characters except common whitespace
                        cleaned = ''.join(ch for ch in text if ch == '\n' or ch == '\t' or (32 <= ord(ch) <= 0x10FFFF))
                    except Exception:
                        logger.exception('error cleaning message from %s', peer_ip)
                        cleaned = text
                    max_len = 2000
                    if len(cleaned) > max_len:
                        cleaned = cleaned[:max_len]
                    await broadcast(request.app, {'type': 'message', 'from': username or 'Anonymous', 'ip': peer_ip, 'text': cleaned})
            elif msg.type == WSMsgType.ERROR:
                logger.error('WebSocket connection closed with exception %s', ws.exception())
    finally:
        request.app['clients'].discard(ws)
        if username:
            try:
                request.app.get('usernames', set()).discard(username)
                # decrement per-ip connection count to avoid leaking
                ip = getattr(ws, '_ip', None)
                if ip:
                    ip_counts = request.app.setdefault('ip_counts', {})
                    if ip in ip_counts:
                        ip_counts[ip] = ip_counts.get(ip, 1) - 1
                        if ip_counts[ip] <= 0:
                            ip_counts.pop(ip, None)
            except Exception as e:
                logger.exception('error removing username %s from set: %s', username, e)
            await broadcast(request.app, {'type': 'leave', 'from': username, 'ip': getattr(ws, '_ip', None)})
            # Broadcast updated users list so clients can refresh the online panel
            try:
                users = sorted(list(request.app.get('usernames', set())))
                await broadcast(request.app, {'type': 'users', 'users': users})
            except Exception:
                logger.exception('failed to broadcast users list after leave')
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
        except Exception as e:
            # if a send fails, log and schedule removal of that websocket
            logger.exception('failed to send message to client (will remove): %s', e)
            to_remove.append(ws)
    for ws in to_remove:
        app['clients'].discard(ws)


async def index(request):
    # serve the static/index.html using a path relative to this file
    here = os.path.dirname(__file__)
    path = os.path.join(here, 'static', 'index.html')
    resp = web.FileResponse(path)
    # add a few safe headers
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    return resp


async def _periodic_cleanup(app):
    """Background task to prune closed websockets and stale rate buckets."""
    try:
        while True:
            await asyncio.sleep(60)
            # remove closed websockets
            for ws in list(app.get('clients', set())):
                if getattr(ws, 'closed', False):
                    app['clients'].discard(ws)

            # prune rate buckets that haven't been updated in a while
            now = time.time()
            buckets = app.get('rate_buckets', {})
            for ip, b in list(buckets.items()):
                # use the stored timestamp 'ts' as last seen
                if now - b.get('ts', now) > 600:
                    buckets.pop(ip, None)
            # keep the dict back on the app
            app['rate_buckets'] = buckets
    except asyncio.CancelledError:
        # expected on shutdown
        return


async def on_startup(app):
    # start cleanup task
    app['cleanup_task'] = asyncio.create_task(_periodic_cleanup(app))


async def on_cleanup(app):
    # cancel background task
    t = app.pop('cleanup_task', None)
    if t:
        t.cancel()
        try:
            await t
        except asyncio.CancelledError:
            pass
    # close all connected websockets
    for ws in list(app.get('clients', set())):
        try:
            await ws.close(code=1001, message=b'Server shutdown')
        except Exception:
            pass


def main():
    # basic console logging configuration
    log_level = os.environ.get('LOG_LEVEL', 'INFO').upper()
    logging.basicConfig(
        level=getattr(logging, log_level, logging.INFO),
        format='%(asctime)s %(levelname)-5s %(name)s: %(message)s',
    )

    app = web.Application()
    app['clients'] = set()
    # register startup/cleanup hooks for background tasks and graceful shutdown
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)
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
