
// Charger .env avant tout module qui lit process.env (db.js)
require("dotenv").config({ quiet: true });

const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS_ORIGIN permet de restreindre les origines autorisées (par défaut : toutes)
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(",") } : {}));
app.use(express.json());

// Convertir un paramètre d'URL en identifiant positif, sinon null
function lireId(valeur) {
    return /^[1-9][0-9]{0,17}$/.test(valeur) ? valeur : null;
}

// Vérifier que l'API fonctionne
app.get("/api/health", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS server_time");

        res.json({
            status: "ok",
            message: "API connectée à PostgreSQL",
            databaseTime: result.rows[0].server_time,
        });
    } catch (error) {
        console.error("Erreur de connexion :", error.message);

        res.status(500).json({
            status: "error",
            message: "Connexion à PostgreSQL impossible",
        });
    }
});

// Récupérer la liste des quiz
app.get("/api/quiz", async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT q.id, q.titre, q.description, q.created_at,
                    COUNT(qu.id)::int AS nb_questions
             FROM quiz q
             LEFT JOIN question qu ON qu.quiz_id = q.id
             GROUP BY q.id
             ORDER BY q.id`
        );

        res.json(result.rows);
    } catch (error) {
        console.error("Erreur lors de la récupération des quiz :", error.message);

        res.status(500).json({
            error: "Impossible de récupérer les quiz",
        });
    }
});

// Récupérer un quiz
app.get("/api/quiz/:id", async (req, res) => {
    const id = lireId(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "Identifiant de quiz invalide" });
    }

    try {
        const result = await pool.query(
            `SELECT q.id, q.titre, q.description, q.created_at,
                    COUNT(qu.id)::int AS nb_questions
             FROM quiz q
             LEFT JOIN question qu ON qu.quiz_id = q.id
             WHERE q.id = $1
             GROUP BY q.id`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Quiz introuvable" });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("Erreur lors de la récupération du quiz :", error.message);

        res.status(500).json({
            error: "Impossible de récupérer le quiz",
        });
    }
});

// Récupérer les questions d'un quiz, avec leurs options de réponse
app.get("/api/quiz/:id/questions", async (req, res) => {
    const id = lireId(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "Identifiant de quiz invalide" });
    }

    try {
        const quiz = await pool.query("SELECT id FROM quiz WHERE id = $1", [id]);

        if (quiz.rows.length === 0) {
            return res.status(404).json({ error: "Quiz introuvable" });
        }

        // Les options sont triées par id : c'est l'ordre d'insertion du seed
        const result = await pool.query(
            `SELECT qu.id, qu.enonce, qu.ordre, qu.duree_secondes,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'id', o.id,
                                'libelle', o.libelle,
                                'est_correcte', o.est_correcte
                            )
                            ORDER BY o.id
                        ) FILTER (WHERE o.id IS NOT NULL),
                        '[]'
                    ) AS options
             FROM question qu
             LEFT JOIN option_reponse o ON o.question_id = qu.id
             WHERE qu.quiz_id = $1
             GROUP BY qu.id
             ORDER BY qu.ordre`,
            [id]
        );

        // Le frontend calcule le score : on lui transmet l'index de la bonne option
        const questions = result.rows.map((question) => ({
            id: question.id,
            enonce: question.enonce,
            ordre: question.ordre,
            duree_secondes: question.duree_secondes,
            options: question.options.map((option) => ({
                id: String(option.id),
                libelle: option.libelle,
            })),
            correcte: question.options.findIndex((option) => option.est_correcte),
        }));

        res.json(questions);
    } catch (error) {
        console.error("Erreur lors de la récupération des questions :", error.message);

        res.status(500).json({
            error: "Impossible de récupérer les questions",
        });
    }
});

// Route inconnue
app.use((req, res) => {
    res.status(404).json({ error: "Route introuvable" });
});

const server = app.listen(PORT, (error) => {
    // Express 5 transmet l'erreur d'écoute ici au lieu de la lever :
    // sans ce test, un port occupé donnait un faux démarrage puis un "clean exit"
    if (error) {
        console.error(`Impossible d'écouter sur le port ${PORT} :`, error.code || error.message);
        process.exit(1);
    }

    console.log(`API QuizBattle disponible sur http://localhost:${PORT}`);
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
