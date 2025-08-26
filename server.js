// Simple chat server (plain-language comments below for non-developers):
// - Serves a web page and assets from the `static/` folder.
// - Handles real-time chat using WebSockets so people can send messages.
// This file is the server program — it runs on your computer or a server and
// accepts connections from web browsers.
const express = require("express");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");

// `app` is the web application. `port` is the network port it listens on.
const app = express();
const port = process.env.PORT || 8765;

// In-memory state (keeps track of connected people and simple counters).
// This is stored in memory while the program is running. If the server
// restarts, this information is lost. It's a small table for the live chat.
const state = {
	// list of currently connected browser windows (WebSocket objects)
	clients: new Set(),
	// set of usernames currently in use
	usernames: new Set(),
	// map username -> IP address
	user_map: {},
	// how many connections came from each IP (used to limit logins)
	ip_counts: {},
	// simple rate limiting per IP (see allow_action below)
	rate_buckets: {},
};

// Serve files like HTML, images and JavaScript from the `static/` folder.
// When a browser asks for /static/..., we return the matching file.
app.use("/static", express.static(path.join(__dirname, "static")));

// When someone opens the site root ("/"), send them the main web page.
// The security headers above are small protections so browsers treat the
// page safely.
app.get("/", (req, res) => {
	res.set("X-Content-Type-Options", "nosniff");
	res.set("X-Frame-Options", "DENY");
	res.sendFile(path.join(__dirname, "static", "index.html"));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Find the client's IP address from a request. IP is a simple identifier
// for the machine that connected. This is used for small protections like
// limiting how many accounts can be created from one IP.
function getPeerIp(req) {
	// prefer socket remoteAddress
	const socket = req.socket || (req.connection && req.connection.socket);
	if (socket && socket.remoteAddress) {
		let ip = socket.remoteAddress;
		// Some systems include an IPv6 prefix for IPv4 addresses, remove it
		if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
		return ip;
	}
	return null;
}

// Return the current time in seconds (used for rate limiting).
function now() {
	return Date.now() / 1000;
}

// Simple rate limiter per IP. It gives each IP a small number of "tokens"
// that refill over time. If an IP uses too many tokens too quickly, we
// temporarily block actions and tell the client how long to wait.
function allow_action(ip, cost = 1) {
	if (!ip) return { allowed: true, retry_after: 0 };
	const buckets = state.rate_buckets;
	const capacity = 8; // how many tokens an IP can hold
	const refill_per_sec = 1.0; // how quickly tokens come back
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
		// allow the action and remove tokens
		b.tokens -= cost;
		buckets[ip] = b;
		return { allowed: true, retry_after: 0 };
	} else {
		// not enough tokens: deny and tell the client how long to wait
		const needed = cost - b.tokens;
		const retry_after = Math.floor(needed / refill_per_sec + 1);
		buckets[ip] = b;
		return { allowed: false, retry_after };
	}
}

// Send a message to every connected client. `message` is a plain object
// that we convert to text (JSON) before sending. If a connection is closed
// we remove it from the list.
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

// Clean up a user-provided name so it is safe to show to others. This removes
// strange characters and limits the length. If the name is empty, we give
// a default name like "User0123".
function sanitize_name(n) {
	if (!n) n = "Anonymous";
	// remove control chars except tab/newline, trim
	n = Array.from(n)
		.filter((ch) => ch === "\t" || ch === "\n" || ch.charCodeAt(0) >= 32)
		.join("")
		.trim();
	// allow word chars, space, -, .
	n = n.replace(/[^\w \-\.]+/gu, "");
	if (!n) n = "User" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
	if (n.length > 32) n = n.slice(0, 32);
	return n;
}

// Periodic cleanup: remove closed connections from memory and remove old
// rate-limiter entries so the memory use doesn't grow forever.
function cleanupTask() {
	// prune closed sockets and old rate buckets every 60s
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

// Upgrade HTTP connections to WebSocket when the browser asks for /ws.
// WebSocket is the protocol that allows the browser and server to send
// messages back and forth in real time.
server.on("upgrade", (req, socket, head) => {
	if (req.url !== "/ws") {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit("connection", ws, req);
	});
});

// When a new browser connects via WebSocket, this code runs.
// It keeps track of the connection, listens for messages, and reacts
// to join/message/close events.
wss.on("connection", (ws, req) => {
	state.clients.add(ws);
	let username = null;
	const peer_ip = getPeerIp(req);
	ws._ip = peer_ip;

	// When this connection sends a message, it will arrive here.
	// Messages are expected to be JSON objects with a `type` field.
	ws.on("message", async (raw) => {
		let data = null;
		try {
			data = JSON.parse(raw.toString());
		} catch (e) {
			// If the message is not valid JSON, ignore it.
			return;
		}

		// "join" means the user wants to pick or register a name.
		if (data.type === "join") {
			const { allowed, retry_after } = allow_action(peer_ip, 1);
			if (!allowed) {
				// tell the client they are sending too many requests
				try {
					ws.send(JSON.stringify({ type: "rate_limited", retry_after }));
				} catch (e) {}
				return;
			}

			// Clean and possibly modify the requested name to make it safe.
			let clean_name = sanitize_name(data.username || "Anonymous");

			// Small protection: limit number of simultaneous logins from one IP
			if (peer_ip) {
				const current = state.ip_counts[peer_ip] || 0;
				if (current >= 3) {
					try {
						ws.send(JSON.stringify({ type: "too_many_logins", limit: 3 }));
					} catch (e) {}
					return;
				}
			}

			// If the name is already taken, add a number to it (Alice -> Alice-2)
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

			// Tell this connection they are welcomed and announce to everyone
			try {
				ws.send(JSON.stringify({ type: "welcome", username }));
			} catch (e) {}
			broadcast({ type: "join", from: username, ip: peer_ip });

			// Also broadcast the current user list so everyone sees who is online
			try {
				const users = Array.from(state.usernames)
					.sort()
					.map((n) => ({ name: n, ip: state.user_map[n] }));
				broadcast({ type: "users", users });
			} catch (e) {
				console.error("broadcast users failed", e);
			}

			// "message" means the user sent chat text to everyone
		} else if (data.type === "message") {
			const { allowed, retry_after } = allow_action(peer_ip, 1);
			if (!allowed) {
				try {
					ws.send(JSON.stringify({ type: "rate_limited", retry_after }));
				} catch (e) {}
				return;
			}
			let text = data.text || "";
			// remove control chars except tab/newline
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

	// When the browser disconnects, clean up our records and tell others
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

// start server and print LAN address similar to Python script
server.listen(port, "0.0.0.0", () => {
	const os = require("os");
	function getLanIp() {
		const ifaces = os.networkInterfaces();
		for (const name of Object.keys(ifaces)) {
			for (const iface of ifaces[name]) {
				if (iface.family === "IPv4" && !iface.internal) return iface.address;
			}
		}
		return "127.0.0.1";
	}
	const lan_ip = getLanIp();
	console.log(`Starting server on 0.0.0.0:${port} - open http://${lan_ip}:${port} in a browser (or use your host IP)`);
});
