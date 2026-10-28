# Runbook de la flotte QuizBattle

Ce document permet à quelqu'un qui n'a jamais vu le projet de remonter la flotte et de réparer
les six pannes du sujet, **sans nous poser de question**. Si vous bloquez, notez où : c'est ce qui
nous permet de corriger le document.

> **État au 28/10, 17 h.** `compose.prod.yml` existe et a été monté en local avec succès (front, API,
> base). Le job qui déploie sur la machine cible n'existe pas encore : les étapes qui en dépendent
> sont marquées **[à compléter]**.

## La flotte en une minute

| Service | Rôle | Port interne | Port publié | Carré au tableau |
| --- | --- | --- | --- | --- |
| `front` | La page du quiz (serveur Node) | 3000 | 3003 | oui |
| `api` | Parties, réponses et scores, en base | 3000 | — | pas encore : ni métriques ni pulse |
| `stats` | Statistiques du quiz, lues dans la base | 3000 | — | oui, **absent de `compose.prod.yml`** |
| `db` | PostgreSQL 16, données dans le volume `postgres_data` | 5432 | — | non |
| `prometheus` | Collecte des mesures | 9090 | 9090 | non |
| `grafana` | Tableau de bord « Flotte du quiz » | 3000 | 3001 | non |
| `blackbox` | Sonde la page du front | 9115 | — | non |

Les ports publiés de Prometheus et Grafana se changent par `PORT_PROMETHEUS` et `PORT_GRAFANA`
(pull request n°15 ; avant sa fusion, `main` publie 9092 et 3004). Le sujet attend le front sur le
port **3000** de la machine cible : `compose.prod.yml` le publie aujourd'hui sur 3003.

Machine cible : `vm-prod`, joignable en SSH sur le port **2222**, flotte installée dans
`/srv/flotte` **[à compléter quand le déploiement existera]**.

## 1. Remonter la flotte de zéro sur une autre machine

**Prérequis** : Docker avec Docker Compose et Git. Aujourd'hui, `compose.prod.yml` **construit** les
images sur place (`build:`) : pas besoin d'accès au registry. Le CI publie par ailleurs
`gomaso/quizbattle-front` et `gomaso/quizbattle-api` sur Docker Hub, taguées au sha du commit.

1. Récupérer le dépôt :
   ```bash
   git clone https://github.com/GAP028/QuizBattle-DevOps.git
   cd QuizBattle-DevOps
   ```
2. Créer le fichier `.env` à la racine, à côté de `compose.prod.yml` :
   ```bash
   COMPOSE_FILE=compose.prod.yml
   TAG=<sha du commit déployé>
   GROUPE=<nom de l'équipage>
   TABLEAU_URL=<adresse du tableau de la classe>
   POSTGRES_PASSWORD=<mot de passe de la base>
   GRAFANA_MOT_DE_PASSE=<mot de passe admin de Grafana>
   ```
   `GROUPE`, `TABLEAU_URL`, `POSTGRES_PASSWORD` et `GRAFANA_MOT_DE_PASSE` sont **obligatoires** :
   s'il en manque une, Docker Compose refuse de démarrer et nomme la variable. `COMPOSE_FILE` évite de
   répéter `-f compose.prod.yml`, et permet à `pannes.sh` de trouver le bon fichier. Facultatives :
   `POSTGRES_USER` et `POSTGRES_DB` (par défaut `quizbattle`), `COULEUR_FRONT`, `COULEUR_API`,
   `PORT_PROMETHEUS`, `PORT_GRAFANA`.
3. Démarrer la flotte :
   ```bash
   docker compose up -d --build
   ```
   La base est créée au premier démarrage avec `database/init.sql` et `database/seed.sql`, puis
   conservée dans le volume `postgres_data`. L'API attend que la base soit `healthy` avant de démarrer.
4. Vérifier, dans cet ordre :
   - `docker compose ps` : `db`, `front` et `api` sont `(healthy)` ;
   - Prometheus, `http://<machine>:9090`, menu **Status → Targets** : `front` et `front-sonde` sont
     `UP` ; `api` est en échec (404) tant que l'API n'expose pas `/metrics` ;
   - Grafana, `http://<machine>:3001`, tableau « Flotte du quiz » : les voyants du front sont verts ;
   - le tableau de la classe : le carré du front est plein, avec le pavillon dessous.

Vérifié en local le 28/10 : `db`, `front` et `api` deviennent `healthy`, une partie jouée par l'API
est enregistrée en base et lue par le service stats.

## 2. Les trois commandes à taper en premier quand un carré s'éteint

Depuis le dossier de la flotte, sur la machine cible :

1. **Qui tourne ?**
   ```bash
   docker compose ps -a
   ```
   Un service `Exited (137)` a été tué (panne 1). Un service `unhealthy` tourne mais ne fonctionne
   plus (panne 2 ou 4).
2. **Que dit le service ?**
   ```bash
   docker compose logs --tail 30 <service>
   ```
   `[pulse] tableau injoignable` : panne 6. `password authentication failed` : panne 4.
3. **La configuration a-t-elle été modifiée ?**
   ```bash
   grep -E '^(TAG|TABLEAU_URL)=' .env ; grep -c '^POSTGRES_PASSWORD=.' .env
   ```
   Affiche le tag et l'adresse du tableau, et `1` si le mot de passe est renseigné, `0` s'il est vide.
   Le mot de passe lui-même n'est jamais affiché. Un `TAG=nexistepas` signe la panne 5.

Avant tout terminal, regardez le **panneau 3 de Grafana** : il nomme la plupart des pannes en dix
secondes.

## 3. Les six pannes

Le script `pannes.sh` en tire une au hasard. Pour chacune : ce que montre le tableau, la cause, la
manœuvre, et le temps de réparation mesuré chez nous.

### Panne 1 · Le conteneur tué
- **Symptôme** : un carré s'éteint et ne revient pas seul ; Grafana, panneau 3 : « répond » en KO.
- **Cause** : le process a été tué (`Exited (137)`). `restart: unless-stopped` ne relance pas un
  conteneur arrêté par `docker kill`.
- **Manœuvre** : `docker compose up -d <service>`.
- **Temps chez nous** : non chronométré (banc de test).

### Panne 2 · La base coupée
- **Symptôme** : le carré de stats pâlit ou s'éteint ; panneau 3 : `stats → postgres` en KO,
  « répond » et « tableau » verts. L'API passe `unhealthy`.
- **Cause** : le conteneur `db` est arrêté. Les services, eux, ne sont pas cassés.
- **Ce qu'on a mesuré en local, avec `compose.prod.yml`** : Grafana montre `stats → postgres` à 0
  **2 s** après l'arrêt de la base, alors que le healthcheck de Docker ne déclare l'API `unhealthy`
  qu'au bout de **86 s**. Regarder Grafana avant `docker compose ps`.
- **Manœuvre** : `docker compose up -d db`. Les services se rétablissent seuls.
- **Temps chez nous** : stats revient en **9 s** et l'API en **29 s** après la relance de la base,
  sans toucher aux services.

### Panne 3 · Le pavillon illisible
- **Symptôme** : le pavillon disparaît sous les carrés, **tous les carrés restent pleins** ;
  panneau 3 : `→ pavillon` en KO.
- **Cause** : le dossier `/data` a perdu ses droits (`chmod 000`).
- **Attention** : **un redéploiement ne répare pas** : le `chmod` touche le volume, qui survit au
  conteneur.
- **Manœuvre** : `docker compose exec <service> chmod 755 /data`.
- **Temps chez nous** : 2 s (banc de test).

### Panne 4 · Le secret effacé
- **Ce que fait `pannes.sh`** : il vide `POSTGRES_PASSWORD` dans `.env`, puis relance l'API.
- **Ce qui se passe réellement** (vérifié en local) : `compose.prod.yml` exige ce mot de passe.
  Docker Compose **refuse donc de relancer l'API** et affiche `POSTGRES_PASSWORD manquant dans le
  .env`. **L'API déjà lancée continue de tourner** : rien ne change au tableau. La panne est
  latente : c'est le prochain déploiement qui échouera.
- **Variante, mot de passe faux au lieu de vide** : l'API redémarre mais ne peut plus parler à la
  base. Elle passe `unhealthy` (101 s chez nous), `/api/health` répond 500 et ses logs disent
  `password authentication failed`, alors que `db` est `healthy`.
- **Manœuvre** : remettre la bonne valeur de `POSTGRES_PASSWORD` dans `.env`, puis
  `docker compose up -d api`.
- **Temps chez nous** : **20 s** jusqu'à ce que `/api/health` réponde de nouveau (en local, variante
  du mot de passe faux).

### Panne 5 · La version introuvable
- **Ce que fait `pannes.sh`** : il met `TAG=nexistepas` dans `.env`, puis relance la victime.
- **Ce qui se passe réellement** (vérifié en local) :
  - **avec `compose.prod.yml` tel qu'il est** (`build:` présent) : Docker ne trouve pas l'image, la
    **reconstruit sur place** sous le tag `nexistepas` et relance le service. Rien ne s'éteint. Seul
    le panneau 4 de Grafana trahit la panne : la version affichée devient `nexistepas` ;
  - **avec les images du registry, sans `build:`** : le téléchargement échoue (`not found`) et Docker
    Compose **laisse l'ancien conteneur tourner**, avec sa version d'avant. Rien ne s'éteint non plus :
    la panne est latente, le prochain redémarrage échouera.
- **Diagnostic** : commande 3 ci-dessus, `TAG=nexistepas`.
- **Manœuvre** : remettre le dernier sha connu comme bon dans `TAG`, puis `docker compose up -d
  <service>`.
- **Temps chez nous** : non chronométré.

### Panne 6 · Le tableau injoignable
- **Symptôme** : un carré s'éteint alors que le service va bien ; panneau 3 : `→ tableau (pulse)`
  en KO, « répond » vert. L'application fonctionne dans un navigateur.
- **Cause** : `TABLEAU_URL` faussée dans `.env` (commande 3), log `[pulse] tableau injoignable`.
- **Manœuvre** : remettre la bonne `TABLEAU_URL`, puis `docker compose up -d <service>`.
- **Temps chez nous** : non chronométré (banc de test).

## 4. Pièges connus

- **Sans `COMPOSE_FILE=compose.prod.yml` dans `.env`**, `pannes.sh` et les commandes courtes
  `docker compose …` ne trouvent pas le fichier : Docker Compose cherche `compose.yaml`.
- **Juste après un redémarrage de Prometheus**, les séries des anciens conteneurs restent visibles
  jusqu'à 5 minutes : un exemplaire en trop ou un voyant rouge peut être un fantôme. Attendre avant
  de conclure.
- **« Aucune donnée »** sur un voyant n'est jamais un OK : la mesure n'existe pas (service disparu,
  pavillon jamais hissé).
- **L'API est invisible dans Grafana** tant qu'elle n'expose pas `/metrics` : sa cible est en échec
  et ses pannes ne s'y lisent pas. Il faut alors passer par `docker compose ps` et ses logs.

## Testé par un autre équipage

| Date | Testeur (équipage) | Où il a bloqué | Corrigé |
| --- | --- | --- | --- |
| | | | |
