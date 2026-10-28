import express from "express";
import { exposerMetriques } from "./lib/metrics.js";
import { demarrerLePulse } from "./lib/pulse.js";

const app = express();
const PORT = 3000;

exposerMetriques(app);

app.get("/sante", (_req, res) => {
  res.json({ statut: "ok", service: process.env.SERVICE || "front" });
});

app.get("/travail", (_req, res) => {
  res.sendStatus(200);
});

app.use(express.static("public"));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`QuizBattle frontend écoute sur le port ${PORT}`);

  if (process.env.TABLEAU_URL && process.env.GROUPE && process.env.SERVICE) {
    demarrerLePulse();
  } else {
    console.warn("Pulse en attente de la configuration du tableau.");
  }
});
