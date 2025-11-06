// Startup script: create HTTP server and listen. App logic is in src/app.js
const http = require("http");
const { createApp } = require("./app");
const config = require("./config");

const port = process.env.PORT || (config && config.port) || 8765;

const { app, wss } = createApp();

const server = http.createServer(app);

server.on("upgrade", (req, socket, head) => {
	if (req.url !== "/ws") {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		wss.emit("connection", ws, req);
	});
});

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
	const bound = "0.0.0.0";
	const localhostUrl = `http://localhost:${port}`;
	const lanUrl = lan_ip && lan_ip !== "127.0.0.1" ? `http://${lan_ip}:${port}` : null;

	console.log(`Starting server on ${bound}:${port}`);
	console.log(`Local:   ${localhostUrl}`);
	if (lanUrl) console.log(`LAN:     ${lanUrl}  (use this from other machines on the LAN)`);
	else console.log("(No LAN address detected; use the Local URL or check your network)");
});

// graceful shutdown: close server, notify websocket clients, and close DB pool if present
async function shutdown(signal) {
	console.log(`Received ${signal}. Shutting down...`);
	try {
		// stop accepting new connections
		server.close(() => console.log("HTTP server closed"));

		// close all websocket connections politely
		if (wss && typeof wss.clients !== "undefined") {
			for (const client of wss.clients) {
				try {
					client.close(1001, "Server shutting down");
				} catch (e) {
					/* ignore */
				}
			}
		}

		// attempt to close DB pool if exported
		try {
			const db = require("./db");
			if (db && db.pool && typeof db.pool.end === "function") {
				await db.pool.end();
				console.log("DB pool closed");
			}
		} catch (err) {
			// db may not be configured — ignore
		}

		setTimeout(() => {
			console.log("Forcing shutdown");
			process.exit(0);
		}, 3000).unref();
	} catch (err) {
		console.error("Error during shutdown", err);
		process.exit(1);
	}
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
