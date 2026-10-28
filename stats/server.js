// server.js : le service annexe de statistiques du quiz.
// Il lit PostgreSQL en lecture seule et agrège ce que l'API ne calcule pas :
// le taux de réussite par question, le temps de réponse moyen, le classement.
// Comme le front, il embarque metrics.js et pulse.js (copiés depuis monitoring/lib).
import express from "express";
import pg from "pg";
import { exposerMetriques, surveillerDependance } from "./lib/metrics.js";
import { demarrerLePulse } from "./lib/pulse.js";

const PORT = Number(process.env.PORT) || 3000;

// Sans base, ce service n'a rien à calculer : il refuse de démarrer plutôt que
// de tourner en silence avec une configuration incomplète.
if (!process.env.DATABASE_URL) {
  console.error("[stats] DATABASE_URL manquante : impossible de lire les statistiques");
  process.exit(1);
}

const base = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000,
  max: 5,
});
// Une coupure de la base ne doit pas faire tomber le process : la route de santé la signale
base.on("error", (erreur) => console.error("[stats] erreur PostgreSQL :", erreur.message));

const RESUME = `
  SELECT (SELECT count(*) FROM quiz)::int                                   AS quiz,
         (SELECT count(*) FROM question)::int                               AS questions,
         (SELECT count(*) FROM participant)::int                            AS participants,
         (SELECT count(*) FROM reponse)::int                                AS reponses,
         (SELECT count(*) FROM reponse WHERE est_correcte)::int             AS bonnes_reponses,
         (SELECT count(*) FROM session_quiz WHERE statut = 'en_cours')::int AS sessions_en_cours`;

const PAR_QUESTION = `
  SELECT q.quiz_id, q.id AS question_id, q.ordre, q.enonce,
         count(r.id)::int                                AS reponses,
         count(r.id) FILTER (WHERE r.est_correcte)::int  AS bonnes_reponses,
         round(avg(r.temps_reponse_ms))::int             AS temps_moyen_ms
  FROM question q
  LEFT JOIN reponse r ON r.question_id = q.id
  GROUP BY q.id
  ORDER BY q.quiz_id, q.ordre`;

const CLASSEMENT = `
  SELECT p.pseudo, sum(pa.score_total)::int AS score
  FROM participation pa
  JOIN participant p ON p.id = pa.participant_id
  GROUP BY p.id
  ORDER BY score DESC, p.pseudo
  LIMIT 10`;

// Le taux est calculé ici et non en SQL : null tant qu'aucune réponse n'existe
const taux = (bonnes, total) => (total > 0 ? Math.round((bonnes / total) * 100) : null);

const app = express();
exposerMetriques(app); // avant les routes, pour que chacune soit comptée et chronométrée
surveillerDependance("postgres", () => base.query("SELECT 1"));

// Le front appelle ce service depuis le navigateur : on autorise toutes les origines en lecture
app.use((_requete, reponse, suite) => {
  reponse.set("Access-Control-Allow-Origin", "*");
  suite();
});

// Santé réelle : le service ne sert à rien sans sa base, il le dit
app.get("/sante", async (_requete, reponse) => {
  try {
    await base.query("SELECT 1");
    reponse.json({ statut: "ok", service: "stats", base: "ok" });
  } catch {
    reponse.status(503).json({ statut: "degrade", service: "stats", base: "injoignable" });
  }
});

// Un coup encaissé = un vrai calcul en base, comme une consultation des statistiques
app.get("/travail", async (_requete, reponse) => {
  try {
    await base.query(RESUME);
    reponse.sendStatus(200);
  } catch {
    reponse.sendStatus(503);
  }
});

app.get("/stats", async (_requete, reponse) => {
  try {
    const { rows } = await base.query(RESUME);
    const resume = rows[0];
    reponse.json({ ...resume, taux_reussite: taux(resume.bonnes_reponses, resume.reponses) });
  } catch {
    reponse.status(503).json({ erreur: "Statistiques indisponibles : base injoignable" });
  }
});

app.get("/stats/questions", async (_requete, reponse) => {
  try {
    const { rows } = await base.query(PAR_QUESTION);
    reponse.json(rows.map((q) => ({ ...q, taux_reussite: taux(q.bonnes_reponses, q.reponses) })));
  } catch {
    reponse.status(503).json({ erreur: "Statistiques indisponibles : base injoignable" });
  }
});

app.get("/stats/classement", async (_requete, reponse) => {
  try {
    const { rows } = await base.query(CLASSEMENT);
    reponse.json(rows);
  } catch {
    reponse.status(503).json({ erreur: "Statistiques indisponibles : base injoignable" });
  }
});

const serveur = app.listen(PORT, "0.0.0.0", () => {
  console.log(`[stats] service de statistiques sur le port ${PORT}`);
  // Le pulse signale lui-même une configuration du tableau incomplète
  demarrerLePulse();
});

// docker stop envoie SIGTERM : on ferme proprement les connexions à la base
process.on("SIGTERM", () => serveur.close(() => base.end().finally(() => process.exit(0))));
