// Chat service abstraction — currently thin wrapper around broadcasting
// and user tracking. Intended to centralize business logic away from
// the WebSocket handlers so it's easier to add persistence later.

const userService = require("./userService");

function broadcastAll(broadcastFn, message) {
	// broadcastFn should be a function that takes a message object and
	// performs the transport-specific broadcast (e.g. JSON->ws.send)
	broadcastFn(message);
}

module.exports = { broadcastAll, userService };
