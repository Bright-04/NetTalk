// Minimal database client wrapper. Uses `pg` when DATABASE_URL is provided.
// This file is intentionally small - it provides a single exported `query`
// function that services can call. If DATABASE_URL is not set, the module
// falls back to a no-op implementation so the codebase remains runnable
// without a database during early development.

const config = require("../config");

let pool = null;
let enabled = false;
if (config.db.url) {
	const { Pool } = require("pg");
	pool = new Pool({ connectionString: config.db.url });
	enabled = true;
}

async function query(text, params) {
	if (!enabled) {
		throw new Error("Database not configured. Set DATABASE_URL to enable DB.");
	}
	const res = await pool.query(text, params);
	return res;
}

module.exports = {
	enabled,
	query,
	// expose pool for advanced use (transactions, etc.)
	pool,
};
