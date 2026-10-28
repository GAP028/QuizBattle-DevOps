// pulse.js : à importer depuis chaque service qui doit tenir un carré au tableau
// Code fourni par le sujet. Seul ajout : les deux appels à noterPulse(),
// qui alimentent la métrique du pulse dans Grafana (panneau Dépendances).
import os from "node:os";
import fs from "node:fs";
import { noterPulse } from "./metrics.js";

const TABLEAU = process.env.TABLEAU_URL;
const GROUPE = process.env.GROUPE;
const COULEUR = process.env.COULEUR || "#888888";
const SERVICE = process.env.SERVICE;
const VERSION = process.env.VERSION || "dev";
const PAVILLON = process.env.PAVILLON_FICHIER || "/data/pavillon.txt";
const MOI = process.env.URL_INTERNE || "http://localhost:3000";

let totalEncaisse = 0; // depuis le démarrage de ce process, affiché sur le carré
let aDeclarer = 0; // encaissés depuis le dernier pulse, ce que le tableau attend

// Le pavillon est relu du disque à chaque pulse : s'il vit dans un volume, il
// traverse le redéploiement, sinon il disparaît du tableau devant toute la classe.
function lirePavillon() {
  try {
    return fs.readFileSync(PAVILLON, "utf8").trim();
  } catch {
    return "";
  }
}

// Un coup, c'est une vraie requête sur sa propre route de travail. Les coups partent
// par paquets de dix en parallèle, sinon un gros retard bloquerait le pulse suivant.
async function encaisser(nombre) {
  const aFaire = Math.min(nombre, 300);
  for (let debut = 0; debut < aFaire; debut += 10) {
    const paquet = [];
    for (let i = debut; i < Math.min(debut + 10, aFaire); i++) {
      paquet.push(
        fetch(`${MOI}/travail`)
          .then((reponse) => {
            if (reponse.ok) {
              totalEncaisse++;
              aDeclarer++;
            }
          })
          .catch(() => {})
      );
    }
    await Promise.all(paquet);
  }
}

async function envoyerPulse() {
  let attente = 5000;
  const declares = aDeclarer;
  try {
    const reponse = await fetch(`${TABLEAU}/api/pulse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupe: GROUPE,
        couleur: COULEUR,
        service: SERVICE,
        conteneur: os.hostname(),
        version: VERSION,
        pavillon: lirePavillon(),
        encaisses: declares,
        total_encaisse: totalEncaisse,
      }),
    });
    noterPulse(reponse.ok);
    // Les coups déclarés ne sont retirés du compteur local qu'une fois le tableau
    // au courant : si l'appel échoue, ils repartiront dans le pulse suivant.
    aDeclarer -= declares;
    const ordre = await reponse.json();
    attente = ordre.prochain_pulse_ms || 5000;
    if (ordre.coups_a_encaisser > 0) await encaisser(ordre.coups_a_encaisser);
  } catch (erreur) {
    noterPulse(false);
    console.error("[pulse] tableau injoignable :", erreur.message);
  }
  setTimeout(envoyerPulse, attente);
}

export function demarrerLePulse() {
  if (!TABLEAU || !GROUPE || !SERVICE) {
    console.error("[pulse] TABLEAU_URL, GROUPE et SERVICE sont obligatoires");
    return;
  }
  console.log(`[pulse] ${GROUPE}/${SERVICE} vers ${TABLEAU}`);
  envoyerPulse();
}
