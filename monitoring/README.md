# Supervision de la flotte QuizBattle

Responsable : Adam (mesure et supervision).

Le tableau de la classe dit qu'un carré s'éteint ; ce dossier sert à dire **pourquoi**.
Chaque service expose ses métriques, Prometheus les collecte toutes les 5 s, et
Grafana les range dans quatre panneaux qui répondent chacun à une question.

## Contenu

| Fichier | Rôle |
| --- | --- |
| `lib/metrics.js` | Métriques à importer dans chaque service : `exposerMetriques(app)`, `surveillerDependance(nom, verifier)` |
| `lib/pulse.js` | Pulse du sujet, avec un seul ajout : il note chaque succès ou échec d'envoi au tableau |
| `prometheus/prometheus.yml` | Une cible par service (`front`, `api`, `stats`) sur `/metrics`, trouvée par le DNS de Docker, plus la sonde du front |
| `blackbox/blackbox.yml` | Sonde HTTP de la page du front, comme un navigateur |
| `grafana/provisioning/` | Source de données et tableau de bord chargés au démarrage, sans clic |
| `grafana/dashboards/flotte.json` | Les quatre panneaux, exportés et versionnés |
| `compose.monitoring.yml` | Prometheus, Grafana et Blackbox, à inclure depuis `compose.prod.yml` |
| `test/` | Banc de test : le vrai front, une base initialisée avec le schéma de l'équipe, un faux `api`, un faux `stats` et un faux tableau |

## Ce que chaque service doit faire

Les trois services de la flotte (`front`, `api`, `stats`) sont des serveurs Node.js. Chacun doit
embarquer `lib/metrics.js` et `lib/pulse.js` : son image se construit donc **depuis la racine du
dépôt**, comme `docker/frontend/Dockerfile` et `stats/Dockerfile`.

État au 28/10 : le front et stats sont branchés ; l'API d'Orokia n'expose pas encore `/metrics` ni
pulse, sa cible Prometheus reste en échec tant que ce n'est pas fait.

Dans chacun (l'image copie `monitoring/lib/` dans `./lib/`) :

```js
import { exposerMetriques, surveillerDependance } from "./lib/metrics.js";
import { demarrerLePulse } from "./lib/pulse.js";

const app = express();
exposerMetriques(app);            // avant les routes : compte et chronomètre chaque requête

// Seulement pour un service qui dépend de la base (ou d'un autre service) :
surveillerDependance("postgres", () => pool.query("SELECT 1"));

// ... routes /sante, /travail, etc.
demarrerLePulse();
```

Dépendances npm : `express`, `prom-client` (et `pg` pour un service qui parle à la base).

Variables d'environnement lues : `SERVICE`, `VERSION` (le sha du commit), `PAVILLON_FICHIER`,
plus celles du pulse (`TABLEAU_URL`, `GROUPE`, `COULEUR`, `URL_INTERNE`).

Chaque service doit écouter sur le port **3000** du réseau interne : c'est le port que
Prometheus interroge. Si un service change de port, `prometheus/prometheus.yml` doit suivre.

## Les quatre panneaux

| Panneau | Question | Métriques | Pannes qu'il nomme |
| --- | --- | --- | --- |
| 1 · Trafic | Le service reçoit-il des requêtes ? | `quiz_http_requetes_total` | 1 (courbe à plat) |
| 2 · Réponse | Répond-il, et en combien de temps ? | `quiz_http_duree_secondes` (p95 de `/travail`), `up` (instances), `probe_duration_seconds` (page du front) | 1, saturation |
| 3 · Dépendances | Vont-elles bien ? | `quiz_dependance_ok`, `quiz_pulse_dernier_succes_timestamp_secondes`, `quiz_pavillon_lisible`, `up` (« répond »), `probe_success` (« page servie ») | 1, 2, 3, 4, 6 |
| 4 · Version | Celle qui tourne est-elle celle qu'on croit ? | `quiz_version_info` | 5 |

Lecture du panneau 3 :

- base KO, tableau OK : panne 2 (base coupée) ou 4 (secret effacé) ;
- base OK, tableau KO : panne 6, le service va bien mais ne joint plus le tableau de la classe ;
- pavillon KO : panne 3 ;
- « répond » KO : le process lui-même ne répond plus (panne 1, ou panne 5 si le conteneur n'a pas pu démarrer) ;
- front « répond » OK mais « page servie » KO : le process vit mais ne sert plus la page.

## Lancer la supervision

Sur la machine cible, la supervision monte avec la flotte grâce à une ligne dans `compose.prod.yml` :

```yaml
include:
  - monitoring/compose.monitoring.yml
```

Le `.env` de la machine cible doit contenir `GRAFANA_MOT_DE_PASSE` (jamais dans le repo).

Les ports publiés valent **9090** (Prometheus) et **3001** (Grafana), ceux que la machine cible
expose. Sur un poste où ils sont déjà pris, les changer dans le `.env` local, sans modifier le
fichier compose : `PORT_PROMETHEUS=9092` et `PORT_GRAFANA=3004` par exemple.

- Prometheus : http://localhost:9090 (page **Status → Targets** pour voir les cibles)
- Grafana : http://localhost:3001 (lecture sans compte, tableau « Flotte du quiz »)

## Banc de test

Pour éprouver la supervision sans les vrais services ni le vrai tableau :

```bash
cd monitoring/test
GRAFANA_MOT_DE_PASSE=admin docker compose -f compose.test.yml up -d --build
```

Le faux tableau répond sur http://localhost:8088. Une salve sur l'API :

```bash
curl -X POST http://localhost:8088/api/coups -H 'Content-Type: application/json' \
  -d '{"service":"api","nombre":1000}'
```

Arrêt : `docker compose -f compose.test.yml down` (ajouter `-v` pour effacer les mesures).

## Pièges connus

- **Après un redémarrage de Prometheus**, les séries des conteneurs disparus restent visibles
  jusqu'à 5 minutes (délai de recherche par défaut) : un compte d'instances ou un pulse peut
  sembler faux pendant ce temps. Attendre, ou repartir de zéro avec `down -v`.
- **Le voyant « tableau » tolère 15 s sans pulse réussi** : le pulse part toutes les 5 s et
  Prometheus lit toutes les 5 s, donc l'âge du dernier pulse monte normalement jusqu'à ~10 s.
  Avec un seuil à 10 s, le voyant clignotait en KO sans panne.
- **La panne 3 ne se voit que si le service tourne en utilisateur non root** : root ignore le
  `chmod 000` et lit le pavillon quand même.
- **Un conteneur tué avec `docker kill` ne redémarre pas**, même avec `restart: unless-stopped` :
  Docker le considère comme arrêté à la main. Vérifié sur le banc : il reste arrêté jusqu'à un
  `docker start`. C'est ce que montrera la panne 1.
- **La panne 3 survit au redéploiement** : le `chmod 000` modifie le volume `/data`, pas le
  conteneur. Vérifié sur le banc : après `up -d --force-recreate`, `/data` était toujours en
  `d---------`. Seul `chmod 755 /data` répare.
- **Si Prometheus démarre alors qu'un service est déjà arrêté**, son nom ne se résout pas et il n'a
  aucune cible : le panneau affiche « aucune donnée » au lieu de KO. Les deux veulent dire que le
  service ne répond pas.
- **La sonde du front est une vraie requête** toutes les 5 s : elle apparaît dans la courbe
  « autres requêtes » du front (route `autre`).
- **Le panneau pavillon affiche « aucune donnée »** tant qu'aucun pavillon n'a été hissé : le
  fichier n'existe pas encore, ce n'est pas une panne.
