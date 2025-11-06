// Centralized config. Values prefer environment variables for 12-factor apps.
const DEFAULT_PORT = 8765;

module.exports = {
	port: Number(process.env.PORT || DEFAULT_PORT),
	db: {
		// Postgres connection URL, e.g. postgres://user:pass@host:5432/dbname
		url: process.env.DATABASE_URL || null,
	},
};
