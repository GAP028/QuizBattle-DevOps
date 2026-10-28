
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();

// CORS_ORIGIN permet de restreindre les origines autorisées (par défaut : toutes)
app.use(cors(process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(",") } : {}));
app.use(express.json());

// Erreur métier renvoyée telle quelle au client, avec son code HTTP
class ErreurHttp extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// Convertir un identifiant (paramètre d'URL ou champ JSON) en identifiant positif, sinon null
function lireId(valeur) {
    const texte = String(valeur);
    return /^[1-9][0-9]{0,17}$/.test(texte) ? texte : null;
}

// Code de partie : 10 caractères aléatoires (A-Z, 0-9), soit environ 51 bits.
// Il sert de jeton : seul le navigateur qui a créé la partie le connaît.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function genererCode() {
    let code = "";
    for (let i = 0; i < 10; i++) {
        code += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
    return code;
}

// Exécuter plusieurs requêtes dans une seule transaction
async function transaction(travail) {
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        const resultat = await travail(client);
        await client.query("COMMIT");
        return resultat;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

// Répondre à une erreur : message métier, sinon erreur serveur générique
function repondreErreur(res, error, messageServeur) {
    if (error instanceof ErreurHttp) {
        return res.status(error.status).json({ error: error.message });
    }

    console.error(messageServeur + " :", error.message);
    res.status(500).json({ error: messageServeur });
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
        repondreErreur(res, error, "Impossible de récupérer les quiz");
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
        repondreErreur(res, error, "Impossible de récupérer le quiz");
    }
});

// Récupérer les questions d'un quiz, avec leurs options de réponse.
// La bonne réponse n'est jamais envoyée : elle est vérifiée par POST .../reponses.
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
                            json_build_object('id', o.id::text, 'libelle', o.libelle)
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

        res.json(result.rows);
    } catch (error) {
        repondreErreur(res, error, "Impossible de récupérer les questions");
    }
});

// Démarrer une partie : un joueur anonyme, une session en cours et sa participation
app.post("/api/quiz/:id/parties", async (req, res) => {
    const id = lireId(req.params.id);

    if (!id) {
        return res.status(400).json({ error: "Identifiant de quiz invalide" });
    }

    try {
        const partie = await transaction(async (client) => {
            const quiz = await client.query(
                `SELECT q.id, COUNT(qu.id)::int AS nb_questions
                 FROM quiz q
                 LEFT JOIN question qu ON qu.quiz_id = q.id
                 WHERE q.id = $1
                 GROUP BY q.id`,
                [id]
            );

            if (quiz.rows.length === 0) {
                throw new ErreurHttp(404, "Quiz introuvable");
            }

            if (quiz.rows[0].nb_questions === 0) {
                throw new ErreurHttp(409, "Ce quiz ne contient aucune question");
            }

            const code = genererCode();

            const participant = await client.query(
                "INSERT INTO participant (pseudo) VALUES ($1) RETURNING id, pseudo",
                ["joueur-" + code]
            );

            const session = await client.query(
                `INSERT INTO session_quiz (quiz_id, code_session, statut, date_debut)
                 VALUES ($1, $2, 'en_cours', CURRENT_TIMESTAMP)
                 RETURNING id`,
                [id, code]
            );

            await client.query(
                "INSERT INTO participation (session_id, participant_id) VALUES ($1, $2)",
                [session.rows[0].id, participant.rows[0].id]
            );

            return {
                code,
                quiz_id: id,
                pseudo: participant.rows[0].pseudo,
                nb_questions: quiz.rows[0].nb_questions,
            };
        });

        res.status(201).json(partie);
    } catch (error) {
        repondreErreur(res, error, "Impossible de démarrer la partie");
    }
});

// Vérifier et enregistrer la réponse d'un joueur.
// option_id vaut null quand le temps est écoulé : la question compte comme ratée.
app.post("/api/parties/:code/reponses", async (req, res) => {
    const code = req.params.code;
    const corps = req.body || {};
    const questionId = lireId(corps.question_id);
    const optionId = corps.option_id === null || corps.option_id === undefined
        ? null
        : lireId(corps.option_id);
    const temps = corps.temps_reponse_ms;

    if (!/^[A-Z0-9]{10}$/.test(code)) {
        return res.status(404).json({ error: "Partie introuvable" });
    }

    if (!questionId) {
        return res.status(400).json({ error: "question_id invalide" });
    }

    if (corps.option_id !== null && corps.option_id !== undefined && !optionId) {
        return res.status(400).json({ error: "option_id invalide" });
    }

    if (temps !== undefined && temps !== null && !(Number.isInteger(temps) && temps >= 0)) {
        return res.status(400).json({ error: "temps_reponse_ms invalide" });
    }

    try {
        const resultat = await transaction(async (client) => {
            // Verrouiller la session : deux réponses simultanées sont traitées l'une après l'autre
            const session = await client.query(
                `SELECT s.id, s.quiz_id, s.statut, pa.participant_id
                 FROM session_quiz s
                 JOIN participation pa ON pa.session_id = s.id
                 WHERE s.code_session = $1
                 FOR UPDATE OF s`,
                [code]
            );

            if (session.rows.length === 0) {
                throw new ErreurHttp(404, "Partie introuvable");
            }

            const { id: sessionId, quiz_id: quizId, statut, participant_id: participantId } = session.rows[0];

            if (statut === "terminee") {
                throw new ErreurHttp(409, "Partie déjà terminée");
            }

            const question = await client.query(
                "SELECT duree_secondes FROM question WHERE id = $1 AND quiz_id = $2",
                [questionId, quizId]
            );

            if (question.rows.length === 0) {
                throw new ErreurHttp(400, "Cette question n'appartient pas au quiz de la partie");
            }

            const options = await client.query(
                "SELECT id::text, est_correcte FROM option_reponse WHERE question_id = $1 ORDER BY id",
                [questionId]
            );

            const choisie = options.rows.find((option) => option.id === optionId);

            if (optionId && !choisie) {
                throw new ErreurHttp(400, "Cette option n'appartient pas à la question");
            }

            const correcte = Boolean(choisie && choisie.est_correcte);
            const bonne = options.rows.find((option) => option.est_correcte);

            // Un temps supérieur à la durée de la question est ramené à cette durée
            const dureeMs = question.rows[0].duree_secondes * 1000;
            const tempsMs = Number.isInteger(temps) ? Math.min(temps, dureeMs) : null;

            // Une seule réponse par question : la contrainte UNIQUE fait foi
            const insertion = await client.query(
                `INSERT INTO reponse
                     (session_id, participant_id, quiz_id, question_id,
                      option_reponse_id, est_correcte, temps_reponse_ms)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (session_id, participant_id, question_id) DO NOTHING
                 RETURNING id`,
                [sessionId, participantId, quizId, questionId, optionId, correcte, tempsMs]
            );

            if (insertion.rows.length === 0) {
                throw new ErreurHttp(409, "Question déjà répondue");
            }

            const participation = await client.query(
                `UPDATE participation
                 SET score_total = score_total + $3
                 WHERE session_id = $1 AND participant_id = $2
                 RETURNING score_total`,
                [sessionId, participantId, correcte ? 1 : 0]
            );

            const avancement = await client.query(
                `SELECT (SELECT COUNT(*)::int FROM reponse
                         WHERE session_id = $1 AND participant_id = $2) AS repondues,
                        (SELECT COUNT(*)::int FROM question WHERE quiz_id = $3) AS total`,
                [sessionId, participantId, quizId]
            );

            const { repondues, total } = avancement.rows[0];
            const terminee = repondues >= total;

            if (terminee) {
                await client.query(
                    `UPDATE session_quiz
                     SET statut = 'terminee', date_fin = CURRENT_TIMESTAMP
                     WHERE id = $1`,
                    [sessionId]
                );
            }

            return {
                correcte,
                bonne_option_id: bonne ? bonne.id : null,
                score: participation.rows[0].score_total,
                repondues,
                total,
                terminee,
            };
        });

        res.status(201).json(resultat);
    } catch (error) {
        repondreErreur(res, error, "Impossible d'enregistrer la réponse");
    }
});

// Corps JSON mal formé
app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "JSON invalide" });
    }

    next(error);
});

// Route inconnue
app.use((req, res) => {
    res.status(404).json({ error: "Route introuvable" });
});

module.exports = app;
