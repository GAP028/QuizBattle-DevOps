
// Charger .env avant tout module qui lit process.env (db.js)
require("dotenv").config({ quiet: true });

const app = require("./app");
const pool = require("./db");
const supervision = require("./supervision");

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, (error) => {
    // Express 5 transmet l'erreur d'écoute ici au lieu de la lever :
    // sans ce test, un port occupé donnait un faux démarrage puis un "clean exit"
    if (error) {
        console.error(`Impossible d'écouter sur le port ${PORT} :`, error.code || error.message);
        process.exit(1);
    }

    console.log(`API QuizBattle disponible sur http://localhost:${PORT}`);

    // Pulse vers le tableau de la classe (signale lui-même une configuration incomplète)
    if (supervision.active) {
        supervision.demarrerLePulse();
    }
});

// Arrêt propre (docker stop envoie SIGTERM)
function arreter(signal) {
    console.log(`${signal} reçu, arrêt de l'API`);
    server.close(() => {
        pool.end().finally(() => process.exit(0));
    });
}

process.on("SIGTERM", arreter);
process.on("SIGINT", arreter);
