
const { Pool } = require("pg");

// Les variables d'environnement sont chargées une seule fois, dans server.js
if (!process.env.DATABASE_URL) {
    throw new Error("Variable DATABASE_URL manquante (voir api/.env.example)");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
});

pool.on("error", (error) => {
    console.error("Erreur inattendue PostgreSQL :", error.message);
});

module.exports = pool;
