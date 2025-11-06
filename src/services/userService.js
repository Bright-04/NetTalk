// Placeholder user service for future database-backed user logic.
// Currently uses in-memory structures but is designed to be replaced by
// a DB-backed implementation (see src/db/).

const users = new Set();

function addUser(name) {
	users.add(name);
}

function removeUser(name) {
	users.delete(name);
}

function listUsers() {
	return Array.from(users).sort();
}

module.exports = { addUser, removeUser, listUsers };
