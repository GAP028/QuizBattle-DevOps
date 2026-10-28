
// Tests de l'API contre une base PostgreSQL jetable, jamais contre la vraie base :
// ils créent des parties et des réponses qui fausseraient les statistiques.
//
// Base de test (depuis la racine du dépôt) :
//   docker run -d --rm --name quizbattle-test-db -e POSTGRES_USER=quizuser \
//     -e POSTGRES_PASSWORD=test -e POSTGRES_DB=quizbattle -p 127.0.0.1:55433:5432 postgres:16
//   docker exec -i quizbattle-test-db psql -U quizuser -d quizbattle < database/init.sql
//   docker exec -i quizbattle-test-db psql -U quizuser -d quizbattle < database/seed.sql
//
// Lancement (depuis api/) :
//   TEST_DATABASE_URL=postgresql://quizuser:test@localhost:55433/quizbattle npm test

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");

const url = process.env.TEST_DATABASE_URL;

if (!url) {
    throw new Error("TEST_DATABASE_URL manquante : les tests exigent une base jetable");
}

if (/:5433\//.test(url)) {
    throw new Error("TEST_DATABASE_URL pointe sur le port 5433 de la vraie base : refusé");
}

process.env.DATABASE_URL = url;

const app = require("../src/app");
const pool = require("../src/db");

let serveur;
let base;
let quizId;
let questions;

async function appeler(methode, chemin, corps) {
    const reponse = await fetch(base + chemin, {
        method: methode,
        headers: corps === undefined ? {} : { "Content-Type": "application/json" },
        body: corps === undefined ? undefined : (typeof corps === "string" ? corps : JSON.stringify(corps)),
    });

    return { status: reponse.status, corps: await reponse.json() };
}

// Bonne et mauvaise option d'une question, lues directement en base
async function options(questionId) {
    const { rows } = await pool.query(
        "SELECT id::text, est_correcte FROM option_reponse WHERE question_id = $1 ORDER BY id",
        [questionId]
    );

    return {
        bonne: rows.find((o) => o.est_correcte).id,
        mauvaise: rows.find((o) => !o.est_correcte).id,
    };
}

async function nouvellePartie() {
    const { status, corps } = await appeler("POST", `/api/quiz/${quizId}/parties`);
    assert.equal(status, 201);
    return corps.code;
}

before(async () => {
    serveur = app.listen(0);
    await new Promise((resolve) => serveur.once("listening", resolve));
    base = `http://127.0.0.1:${serveur.address().port}`;

    const quiz = await pool.query("SELECT id::text FROM quiz WHERE titre = 'Quiz informatique'");
    assert.equal(quiz.rows.length, 1, "seed.sql doit être chargé dans la base de test");
    quizId = quiz.rows[0].id;

    questions = (await appeler("GET", `/api/quiz/${quizId}/questions`)).corps;
});

after(async () => {
    await new Promise((resolve) => serveur.close(resolve));
    await pool.end();
});

test("les questions n'exposent pas la bonne réponse", async () => {
    assert.ok(questions.length > 0);

    const texte = JSON.stringify(questions);
    assert.ok(!texte.includes("correcte"), "aucun champ correcte / est_correcte");

    for (const question of questions) {
        assert.deepEqual(Object.keys(question).sort(), ["duree_secondes", "enonce", "id", "options", "ordre"]);
        for (const option of question.options) {
            assert.deepEqual(Object.keys(option).sort(), ["id", "libelle"]);
        }
    }
});

test("créer une partie enregistre joueur, session et participation", async () => {
    const { status, corps } = await appeler("POST", `/api/quiz/${quizId}/parties`);

    assert.equal(status, 201);
    assert.match(corps.code, /^[A-Z0-9]{10}$/);
    assert.equal(corps.nb_questions, questions.length);

    const { rows } = await pool.query(
        `SELECT s.statut, s.date_debut IS NOT NULL AS demarree, pa.score_total, p.pseudo
         FROM session_quiz s
         JOIN participation pa ON pa.session_id = s.id
         JOIN participant p ON p.id = pa.participant_id
         WHERE s.code_session = $1`,
        [corps.code]
    );

    assert.deepEqual(rows, [{ statut: "en_cours", demarree: true, score_total: 0, pseudo: "joueur-" + corps.code }]);
});

test("créer une partie : quiz invalide, inexistant ou vide", async () => {
    assert.equal((await appeler("POST", "/api/quiz/abc/parties")).status, 400);
    assert.equal((await appeler("POST", "/api/quiz/999999/parties")).status, 404);

    const vide = await pool.query(
        "INSERT INTO quiz (titre) VALUES ('Quiz vide (test)') RETURNING id::text"
    );
    assert.equal((await appeler("POST", `/api/quiz/${vide.rows[0].id}/parties`)).status, 409);
});

test("une bonne réponse est vérifiée, enregistrée et compte un point", async () => {
    const code = await nouvellePartie();
    const question = questions[0];
    const { bonne } = await options(question.id);

    const { status, corps } = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: question.id,
        option_id: bonne,
        temps_reponse_ms: 2500,
    });

    assert.equal(status, 201);
    assert.deepEqual(corps, {
        correcte: true,
        bonne_option_id: bonne,
        score: 1,
        repondues: 1,
        total: questions.length,
        terminee: false,
    });

    const { rows } = await pool.query(
        `SELECT r.option_reponse_id::text, r.est_correcte, r.temps_reponse_ms
         FROM reponse r JOIN session_quiz s ON s.id = r.session_id
         WHERE s.code_session = $1`,
        [code]
    );
    assert.deepEqual(rows, [{ option_reponse_id: bonne, est_correcte: true, temps_reponse_ms: 2500 }]);
});

test("une mauvaise réponse ne compte pas et la bonne option est renvoyée après coup", async () => {
    const code = await nouvellePartie();
    const question = questions[1];
    const { bonne, mauvaise } = await options(question.id);

    const { corps } = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: question.id,
        option_id: mauvaise,
    });

    assert.equal(corps.correcte, false);
    assert.equal(corps.bonne_option_id, bonne);
    assert.equal(corps.score, 0);
});

test("temps écoulé : réponse vide enregistrée comme ratée, temps plafonné", async () => {
    const code = await nouvellePartie();
    const question = questions[0];

    const { status, corps } = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: question.id,
        option_id: null,
        temps_reponse_ms: 999999,
    });

    assert.equal(status, 201);
    assert.equal(corps.correcte, false);

    const { rows } = await pool.query(
        `SELECT r.option_reponse_id, r.temps_reponse_ms
         FROM reponse r JOIN session_quiz s ON s.id = r.session_id
         WHERE s.code_session = $1`,
        [code]
    );
    assert.deepEqual(rows, [{ option_reponse_id: null, temps_reponse_ms: question.duree_secondes * 1000 }]);
});

test("une seule réponse par question : la seconde est refusée et le score ne bouge pas", async () => {
    const code = await nouvellePartie();
    const question = questions[0];
    const { bonne } = await options(question.id);

    await appeler("POST", `/api/parties/${code}/reponses`, { question_id: question.id, option_id: bonne });
    const doublon = await appeler("POST", `/api/parties/${code}/reponses`, { question_id: question.id, option_id: bonne });

    assert.equal(doublon.status, 409);

    const { rows } = await pool.query(
        `SELECT pa.score_total FROM participation pa
         JOIN session_quiz s ON s.id = pa.session_id WHERE s.code_session = $1`,
        [code]
    );
    assert.equal(rows[0].score_total, 1);
});

test("réponses simultanées à la même question : une seule est comptée", async () => {
    const code = await nouvellePartie();
    const question = questions[2];
    const { bonne } = await options(question.id);

    const resultats = await Promise.all(
        Array.from({ length: 5 }, () =>
            appeler("POST", `/api/parties/${code}/reponses`, { question_id: question.id, option_id: bonne })
        )
    );

    assert.deepEqual(resultats.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
});

test("option ou question étrangères à la partie : refusées", async () => {
    const code = await nouvellePartie();
    const { bonne: optionAutreQuestion } = await options(questions[1].id);

    const option = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: questions[0].id,
        option_id: optionAutreQuestion,
    });
    assert.equal(option.status, 400);

    // Question d'un autre quiz
    const autre = await pool.query(
        `WITH q AS (INSERT INTO quiz (titre) VALUES ('Autre quiz (test)') RETURNING id)
         INSERT INTO question (quiz_id, enonce, ordre) SELECT id, 'Question étrangère', 1 FROM q
         RETURNING id::text`
    );
    const question = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: autre.rows[0].id,
        option_id: null,
    });
    assert.equal(question.status, 400);

    // Aucune réponse n'a été enregistrée
    const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM reponse r
         JOIN session_quiz s ON s.id = r.session_id WHERE s.code_session = $1`,
        [code]
    );
    assert.equal(rows[0].n, 0);
});

test("requêtes invalides : 400 ou 404", async () => {
    const code = await nouvellePartie();
    const question = questions[0].id;

    assert.equal((await appeler("POST", "/api/parties/INCONNU123/reponses", { question_id: question })).status, 404);
    assert.equal((await appeler("POST", "/api/parties/abc/reponses", { question_id: question })).status, 404);
    assert.equal((await appeler("POST", `/api/parties/${code}/reponses`, {})).status, 400);
    assert.equal((await appeler("POST", `/api/parties/${code}/reponses`, { question_id: "1; DROP TABLE quiz" })).status, 400);
    assert.equal((await appeler("POST", `/api/parties/${code}/reponses`, { question_id: question, option_id: "x" })).status, 400);
    assert.equal((await appeler("POST", `/api/parties/${code}/reponses`, { question_id: question, temps_reponse_ms: -5 })).status, 400);
    assert.equal((await appeler("POST", `/api/parties/${code}/reponses`, "{pas du json")).status, 400);
});

test("partie complète : score final, session terminée, plus aucune réponse acceptée", async () => {
    const code = await nouvellePartie();
    let dernier;

    // Bonnes réponses sauf à la dernière question
    for (const [index, question] of questions.entries()) {
        const { bonne, mauvaise } = await options(question.id);
        dernier = (await appeler("POST", `/api/parties/${code}/reponses`, {
            question_id: question.id,
            option_id: index === questions.length - 1 ? mauvaise : bonne,
            temps_reponse_ms: 1000,
        })).corps;
    }

    assert.equal(dernier.terminee, true);
    assert.equal(dernier.score, questions.length - 1);
    assert.equal(dernier.repondues, questions.length);

    const { rows } = await pool.query(
        `SELECT statut, date_fin IS NOT NULL AS finie FROM session_quiz WHERE code_session = $1`,
        [code]
    );
    assert.deepEqual(rows[0], { statut: "terminee", finie: true });

    const apres = await appeler("POST", `/api/parties/${code}/reponses`, {
        question_id: questions[0].id,
        option_id: null,
    });
    assert.equal(apres.status, 409);
});
