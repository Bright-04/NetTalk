const express = require("express");
const path = require("path");
const { WebSocketServer } = require("ws");

// Create and return an Express app plus WebSocket server and helpers.
function createApp(opts = {}) {
	const staticRoot = opts.staticRoot || path.join(__dirname, "..", "static");

	const app = express();
	const wss = new WebSocketServer({ noServer: true });

	const state = {
		clients: new Set(),
		usernames: new Set(),
		user_map: {},
		ip_counts: {},
		rate_buckets: {},
	};

	app.use("/static", express.static(staticRoot));

	app.get("/", (req, res) => {
		res.set("X-Content-Type-Options", "nosniff");
		res.set("X-Frame-Options", "DENY");
		res.sendFile(path.join(staticRoot, "index.html"));
	});

	// health endpoint used by platforms/load-balancers for readiness
	app.get("/health", (req, res) => res.status(200).json({ status: "ok" }));

	function getPeerIp(req) {
		const socket = req.socket || (req.connection && req.connection.socket);
		if (socket && socket.remoteAddress) {
			let ip = socket.remoteAddress;
			if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
			return ip;
		}
		return null;
	}

	function now() {
		return Date.now() / 1000;
	}

	function allow_action(ip, cost = 1) {
		if (!ip) return { allowed: true, retry_after: 0 };
		const buckets = state.rate_buckets;
		const capacity = 8;
		const refill_per_sec = 1.0;
		const nowTs = now();
		let b = buckets[ip];
		if (!b) b = { tokens: capacity, ts: nowTs };
		const elapsed = Math.max(0, nowTs - b.ts);
		if (elapsed > 0) {
			const add = elapsed * refill_per_sec;
			b.tokens = Math.min(capacity, b.tokens + add);
			b.ts = nowTs;
		}
		if (b.tokens >= cost) {
			b.tokens -= cost;
			buckets[ip] = b;
			return { allowed: true, retry_after: 0 };
		} else {
			const needed = cost - b.tokens;
			const retry_after = Math.floor(needed / refill_per_sec + 1);
			buckets[ip] = b;
			return { allowed: false, retry_after };
		}
	}

	async function broadcast(message) {
		const data = JSON.stringify(message);
		const toRemove = [];
		for (const ws of Array.from(state.clients)) {
			if (ws.readyState !== ws.OPEN) {
				toRemove.push(ws);
				continue;
			}
			try {
				ws.send(data);
			} catch (e) {
				console.error("failed to send to client", e);
				toRemove.push(ws);
			}
		}
		for (const ws of toRemove) state.clients.delete(ws);
	}

	function sanitize_name(n) {
		if (!n) n = "Anonymous";
		n = Array.from(n)
			.filter((ch) => ch === "\t" || ch === "\n" || ch.charCodeAt(0) >= 32)
			.join("")
			.trim();
		n = n.replace(/[^^\w \-\.]+/gu, "");
		if (!n) n = "User" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
		if (n.length > 32) n = n.slice(0, 32);
		return n;
	}

	function cleanupTask() {
		setInterval(() => {
			for (const ws of Array.from(state.clients)) {
				if (ws.readyState !== ws.OPEN) state.clients.delete(ws);
			}
			const nowTs = now();
			for (const [ip, b] of Object.entries(state.rate_buckets)) {
				if (nowTs - (b.ts || nowTs) > 600) delete state.rate_buckets[ip];
			}
		}, 60 * 1000);
	}

	cleanupTask();

	// WebSocket connection handling (keeps transport logic inside app)
	wss.on("connection", (ws, req) => {
		state.clients.add(ws);
		let username = null;
		const peer_ip = getPeerIp(req);
		ws._ip = peer_ip;

		ws.on("message", async (raw) => {
			let data = null;
			try {
				data = JSON.parse(raw.toString());
			} catch (e) {
				return;
			}

			if (data.type === "join") {
				const { allowed, retry_after } = allow_action(peer_ip, 1);
				if (!allowed) {
					try {
						ws.send(JSON.stringify({ type: "rate_limited", retry_after }));
					} catch (e) {}
					return;
				}

				let clean_name = sanitize_name(data.username || "Anonymous");
				if (peer_ip) {
					const current = state.ip_counts[peer_ip] || 0;
					if (current >= 3) {
						try {
							ws.send(JSON.stringify({ type: "too_many_logins", limit: 3 }));
						} catch (e) {}
						return;
					}
				}

				const base = clean_name;
				let suffix = 1;
				while (state.usernames.has(clean_name)) {
					suffix += 1;
					clean_name = `${base}-${suffix}`;
					if (clean_name.length > 32) clean_name = clean_name.slice(0, 28) + `-${suffix}`;
				}

				username = clean_name;
				ws._username = username;
				state.usernames.add(username);
				state.user_map[username] = peer_ip;
				if (peer_ip) state.ip_counts[peer_ip] = (state.ip_counts[peer_ip] || 0) + 1;

				try {
					ws.send(JSON.stringify({ type: "welcome", username }));
				} catch (e) {}
				broadcast({ type: "join", from: username, ip: peer_ip });

				try {
					const users = Array.from(state.usernames)
						.sort()
						.map((n) => ({ name: n, ip: state.user_map[n] }));
					broadcast({ type: "users", users });
				} catch (e) {
					console.error("broadcast users failed", e);
				}
			} else if (data.type === "message") {
				const { allowed, retry_after } = allow_action(peer_ip, 1);
				if (!allowed) {
					try {
						ws.send(JSON.stringify({ type: "rate_limited", retry_after }));
					} catch (e) {}
					return;
				}
				let text = data.text || "";
				try {
					text = Array.from(text)
						.filter((ch) => ch === "\n" || ch === "\t" || ch.charCodeAt(0) >= 32)
						.join("");
				} catch (e) {}
				const max_len = 2000;
				if (text.length > max_len) text = text.slice(0, max_len);
				broadcast({ type: "message", from: username || "Anonymous", ip: peer_ip, text });
			}
		});

		ws.on("close", () => {
			state.clients.delete(ws);
			if (username) {
				state.usernames.delete(username);
				const ip = ws._ip;
				if (ip && state.ip_counts[ip]) {
					state.ip_counts[ip] = state.ip_counts[ip] - 1;
					if (state.ip_counts[ip] <= 0) delete state.ip_counts[ip];
				}
				delete state.user_map[username];
				broadcast({ type: "leave", from: username, ip: ws._ip });
				const users = Array.from(state.usernames)
					.sort()
					.map((n) => ({ name: n, ip: state.user_map[n] }));
				broadcast({ type: "users", users });
			}
		});

		ws.on("error", (err) => {
			console.error("ws error", err);
		});
	});

	return { app, wss, state, broadcast };
}

module.exports = { createApp };
