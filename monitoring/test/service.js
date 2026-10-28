// service.js : faux service pour éprouver la supervision avant que les vrais existent.
// Il joue tour à tour front, api ou stats selon SERVICE, et peut aussi jouer
// le tableau de la classe (FAUX_TABLEAU=1) pour ne jamais polluer le vrai tableau.
// Ce fichier ne part pas en production.
import express from "express";
import pg from "pg";
import { exposerMetriques, surveillerDependance } from "./metrics.js";
import { demarrerLePulse } from "./pulse.js";

const app = express();
exposerMetriques(app);

if (process.env.FAUX_TABLEAU) {
  // Même contrat que le vrai tableau : POST /api/pulse rend les coups à encaisser,
  // POST /api/coups en ajoute à la file d'un service.
  const enAttente = {};
  app.post("/api/pulse", express.json(), (requete, reponse) => {
    const service = requete.body.service;
    // pulse.js n'en encaisse que 300 par pulse : le reste attend, comme un retard au tableau
    const coups = Math.min(enAttente[service] || 0, 300);
    enAttente[service] = (enAttente[service] || 0) - coups;
    reponse.json({ prochain_pulse_ms: 5000, coups_a_encaisser: coups });
  });
  app.post("/api/coups", express.json(), (requete, reponse) => {
    const { service, nombre } = requete.body;
    enAttente[service] = (enAttente[service] || 0) + Number(nombre || 0);
    reponse.status(202).json({ service, en_attente: enAttente[service] });
  });
} else {
  const base = process.env.DATABASE_URL
    ? new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000 })
    : null;
  if (base) {
    base.on("error", () => {});
    surveillerDependance("postgres", () => base.query("SELECT 1"));
  }

  app.get("/sante", async (_requete, reponse) => {
    if (!base) return reponse.json({ statut: "ok" });
    try {
      await base.query("SELECT 1");
      reponse.json({ statut: "ok", base: "ok" });
    } catch {
      reponse.status(503).json({ statut: "degrade", base: "injoignable" });
    }
  });

  // Un vrai petit travail : quelques millisecondes en base, ou de calcul sans base.
  app.get("/travail", async (_requete, reponse) => {
    try {
      if (base) await base.query("SELECT pg_sleep(0.005)");
      else {
        const fin = Date.now() + 5;
        while (Date.now() < fin);
      }
      reponse.sendStatus(200);
    } catch {
      reponse.sendStatus(503);
    }
  });

  demarrerLePulse();
}

app.listen(3000, () => console.log(`[test] ${process.env.SERVICE || "faux-tableau"} écoute sur 3000`));
