// metrics.js : à importer depuis chaque service, à côté de pulse.js.
// Un seul appel suffit : exposerMetriques(app), avant la déclaration des routes.
// Chaque métrique répond à une des quatre questions du tableau de bord.
import fs from "node:fs";
import client from "prom-client";

const SERVICE = process.env.SERVICE || "inconnu";
const VERSION = process.env.VERSION || "dev";
const PAVILLON = process.env.PAVILLON_FICHIER || "/data/pavillon.txt";

export const registre = new client.Registry();
registre.setDefaultLabels({ service: SERVICE });
client.collectDefaultMetrics({ register: registre });

// Question 1 et 2 : reçoit-il du trafic, répond-il et en combien de temps.
// Le label route vient de la route Express, jamais de l'URL brute, pour
// qu'une salve sur des URL inconnues ne crée pas des milliers de séries.
const requetes = new client.Counter({
  name: "quiz_http_requetes_total",
  help: "Requêtes HTTP reçues, par route et par code de réponse",
  labelNames: ["route", "code"],
  registers: [registre],
});

const duree = new client.Histogram({
  name: "quiz_http_duree_secondes",
  help: "Durée de traitement des requêtes HTTP, par route",
  labelNames: ["route"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registre],
});

// Question 3 : ses dépendances vont-elles bien. 1 = joignable, 0 = injoignable.
const dependance = new client.Gauge({
  name: "quiz_dependance_ok",
  help: "État de chaque dépendance du service (1 = joignable, 0 = injoignable)",
  labelNames: ["dependance"],
  registers: [registre],
});

// Question 3, suite : le tableau de la classe est une dépendance comme une autre.
// C'est ce qui sépare la panne 6 (le service va bien, le pulse échoue)
// de la panne 2 (la base est tombée).
const pulses = new client.Counter({
  name: "quiz_pulse_total",
  help: "Pulses envoyés au tableau de la classe, par résultat",
  labelNames: ["resultat"],
  registers: [registre],
});
pulses.inc({ resultat: "ok" }, 0);
pulses.inc({ resultat: "echec" }, 0);

const dernierPulse = new client.Gauge({
  name: "quiz_pulse_dernier_succes_timestamp_secondes",
  help: "Horodatage du dernier pulse accepté par le tableau",
  registers: [registre],
});

// Panne 3 : le pavillon devient illisible alors que tous les carrés restent pleins.
// 1 = lisible, 0 = présent mais illisible, -1 = absent sur ce service.
// Ne marche que si le conteneur tourne sous un utilisateur non root :
// root ignore le chmod 000 et lirait le fichier quand même.
new client.Gauge({
  name: "quiz_pavillon_lisible",
  help: "Le fichier du pavillon est-il lisible (1 oui, 0 non, -1 absent)",
  registers: [registre],
  collect() {
    try {
      fs.accessSync(PAVILLON, fs.constants.R_OK);
      this.set(1);
    } catch (erreur) {
      this.set(erreur.code === "ENOENT" ? -1 : 0);
    }
  },
});

// Question 4 : quelle version tourne vraiment. Toujours 1, l'information est dans le label.
new client.Gauge({
  name: "quiz_version_info",
  help: "Version de l'image qui tourne (le sha du commit)",
  labelNames: ["version"],
  registers: [registre],
}).set({ version: VERSION }, 1);

function mesurerRequetes(requete, reponse, suite) {
  if (requete.path === "/metrics") return suite();
  const fin = duree.startTimer();
  reponse.on("finish", () => {
    const route = requete.route?.path ?? "autre";
    requetes.inc({ route, code: String(reponse.statusCode) });
    fin({ route });
  });
  suite();
}

export function exposerMetriques(app) {
  app.use(mesurerRequetes);
  app.get("/metrics", async (_requete, reponse) => {
    reponse.set("Content-Type", registre.contentType);
    reponse.end(await registre.metrics());
  });
}

// À appeler une fois au démarrage, avec une fonction qui lève une erreur si la
// dépendance ne répond pas. Exemple pour l'API : () => pool.query("SELECT 1").
// Une dépendance qui ne répond pas en trois secondes compte comme tombée.
export function surveillerDependance(nom, verifier, intervalleMs = 5000) {
  const tester = async () => {
    try {
      await Promise.race([
        verifier(),
        new Promise((_, rejeter) => setTimeout(() => rejeter(new Error("délai dépassé")), 3000)),
      ]);
      dependance.set({ dependance: nom }, 1);
    } catch {
      dependance.set({ dependance: nom }, 0);
    }
  };
  tester();
  setInterval(tester, intervalleMs).unref();
}

// Appelé par pulse.js après chaque envoi au tableau.
export function noterPulse(reussi) {
  pulses.inc({ resultat: reussi ? "ok" : "echec" });
  if (reussi) dernierPulse.setToCurrentTime();
}
