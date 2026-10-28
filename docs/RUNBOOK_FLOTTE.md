# Runbook de la flotte QuizBattle

Ce document permet à quelqu'un qui n'a jamais vu le projet de remonter la flotte et de réparer
les six pannes du sujet, **sans nous poser de question**. Si vous bloquez, notez où : c'est ce qui
nous permet de corriger le document.

> **État au 28/10.** Le fichier de production `compose.prod.yml` et le job de déploiement n'existent
> pas encore dans le dépôt. Les étapes qui en dépendent sont marquées **[à compléter]**. Tout le
> reste est vérifié.

## La flotte en une minute

| Service | Rôle | Port interne | Carré au tableau |
| --- | --- | --- | --- |
| `front` | La page du quiz (serveur Node) | 3000 | oui |
| `api` | Quiz et questions, lus dans la base | 3000 | oui, une fois instrumentée |
| `stats` | Statistiques du quiz, lues dans la base | 3000 | oui |
| `db` | PostgreSQL 16 | 5432 | non |
| `prometheus` | Collecte des mesures | 9090 | non |
| `grafana` | Tableau de bord « Flotte du quiz » | 3001 | non |
| `blackbox` | Sonde la page du front | — | non |

Machine cible : `vm-prod`, joignable en SSH sur le port **2222**, flotte installée dans
`/srv/flotte`.

## 1. Remonter la flotte de zéro sur une autre machine

**Prérequis** : Docker avec Docker Compose, Git, et un accès aux images publiées **[à compléter :
nom du registry et des images]**.

1. Récupérer le dépôt :
   ```bash
   git clone https://github.com/GAP028/QuizBattle-DevOps.git
   cd QuizBattle-DevOps
   ```
2. Créer le fichier `.env` à côté de `compose.prod.yml` **[à compléter : modèle `.env.example`]**.
   Les variables attendues aujourd'hui :
   - `TAG` : le sha du commit à déployer ;
   - `GROUPE`, `COULEUR`, `TABLEAU_URL` : pour le pulse vers le tableau de la classe ;
   - `DB_PASSWORD` : le mot de passe de la base (jamais dans le dépôt) ;
   - `GRAFANA_MOT_DE_PASSE` : sans elle, **Docker Compose refuse de démarrer toute la flotte**.
3. Démarrer la flotte **[à compléter : nom exact du fichier]** :
   ```bash
   docker compose -f compose.prod.yml pull
   docker compose -f compose.prod.yml up -d
   ```
   Le dossier `monitoring/` doit être présent à côté du fichier : la supervision y est incluse.
4. Vérifier, dans cet ordre :
   - `docker compose -f compose.prod.yml ps` : chaque service est `Up`, et `(healthy)` quand il a
     un healthcheck ;
   - Prometheus, `http://<machine>:9090`, menu **Status → Targets** : `front`, `api`, `stats` et
     `front-sonde` sont `UP` ;
   - Grafana, `http://<machine>:3001`, tableau « Flotte du quiz » : panneau 3 entièrement vert ;
   - le tableau de la classe : les carrés de l'équipe sont pleins, avec le pavillon dessous.

## 2. Les trois commandes à taper en premier quand un carré s'éteint

Depuis `/srv/flotte` sur la machine cible :

1. **Qui tourne ?**
   ```bash
   docker compose -f compose.prod.yml ps -a
   ```
   Écarte ou confirme les pannes 1 et 5 : un service `Exited (137)` a été tué ; un service absent ou
   qui ne démarre pas a souvent une image introuvable.
2. **Que dit le service ?**
   ```bash
   docker compose -f compose.prod.yml logs --tail 30 <service>
   ```
   Distingue la panne 6 (`[pulse] tableau injoignable`), la panne 4 (refus de connexion à la base,
   variable manquante) et la panne 5 (image introuvable).
3. **La configuration a-t-elle été modifiée ?**
   ```bash
   grep -E '^(TAG|TABLEAU_URL)=' .env ; grep -c '^DB_PASSWORD=.' .env
   ```
   Affiche le tag et l'adresse du tableau, et `1` si le mot de passe est renseigné, `0` s'il est
   vide. Le mot de passe lui-même n'est jamais affiché.

Avant tout terminal, regardez le **panneau 3 de Grafana** : il nomme la plupart des pannes en dix
secondes.

## 3. Les six pannes

Le script `pannes.sh` en tire une au hasard. Pour chacune : ce que montre le tableau, la cause, la
manœuvre, et le temps de réparation mesuré chez nous.

### Panne 1 · Le conteneur tué
- **Symptôme** : un carré s'éteint et ne revient pas seul ; Grafana, panneau 3 : « répond » en KO.
- **Cause** : le process a été tué (`Exited (137)`). `restart: unless-stopped` ne relance pas un
  conteneur arrêté par `docker kill`.
- **Manœuvre** : `docker compose -f compose.prod.yml up -d <service>`.
- **Temps chez nous** : non chronométré (banc de test).

### Panne 2 · La base coupée
- **Symptôme** : le carré de l'API (et de stats) pâlit ou s'éteint ; panneau 3 : `→ postgres` en
  KO, « répond » et « tableau » verts.
- **Cause** : le conteneur `db` est arrêté. Les services, eux, ne sont pas cassés.
- **Manœuvre** : `docker compose -f compose.prod.yml up -d db`. Les services se rétablissent seuls.
- **Temps chez nous** : 11 s de retour à la normale après relance de la base (banc de test).

### Panne 3 · Le pavillon illisible
- **Symptôme** : le pavillon disparaît sous les carrés, **tous les carrés restent pleins** ;
  panneau 3 : `→ pavillon` en KO.
- **Cause** : le dossier `/data` a perdu ses droits (`chmod 000`).
- **Attention** : **un redéploiement ne répare pas** : le `chmod` touche le volume, qui survit au
  conteneur.
- **Manœuvre** : `docker compose -f compose.prod.yml exec <service> chmod 755 /data`.
- **Temps chez nous** : 2 s (banc de test).

### Panne 4 · Le secret effacé
- **Symptôme** : le carré de l'API s'éteint au redémarrage suivant.
- **Cause** : `DB_PASSWORD` vide dans `.env` (commande 3 ci-dessus : affiche `0`). La base, elle,
  tourne.
- **Manœuvre** : remettre la valeur de `DB_PASSWORD` dans `.env`, puis
  `docker compose -f compose.prod.yml up -d api`.
- **Temps chez nous** : pas encore testée.

### Panne 5 · La version introuvable
- **Symptôme** : un carré s'éteint et ne revient pas ; panneau 4 : le service disparaît ou garde un
  ancien sha.
- **Cause** : `TAG=nexistepas` dans `.env` (commande 3) : l'image n'existe pas sur le registry.
- **Manœuvre** : remettre le dernier sha connu comme bon dans `TAG`, puis
  `docker compose -f compose.prod.yml up -d <service>`.
- **Temps chez nous** : pas encore testée.

### Panne 6 · Le tableau injoignable
- **Symptôme** : un carré s'éteint alors que le service va bien ; panneau 3 : `→ tableau (pulse)`
  en KO, « répond » vert. L'application fonctionne dans un navigateur.
- **Cause** : `TABLEAU_URL` faussée dans `.env` (commande 3), log `[pulse] tableau injoignable`.
- **Manœuvre** : remettre la bonne `TABLEAU_URL`, puis
  `docker compose -f compose.prod.yml up -d <service>`.
- **Temps chez nous** : non chronométré (banc de test).

## 4. Pièges connus

- **`pannes.sh` appelle `docker compose up -d` sans préciser de fichier.** Docker Compose cherche
  alors `compose.yaml` ou `docker-compose.yml`, pas `compose.prod.yml`. Ajouter dans le `.env` de la
  machine cible la ligne `COMPOSE_FILE=compose.prod.yml` : Compose la lit et trouve le bon fichier.
- **Juste après un redémarrage de Prometheus**, les séries des anciens conteneurs restent visibles
  jusqu'à 5 minutes : un exemplaire en trop ou un voyant rouge peut être un fantôme. Attendre avant
  de conclure.
- **« Aucune donnée »** sur un voyant n'est jamais un OK : la mesure n'existe pas (service disparu,
  pavillon jamais hissé).

## Testé par un autre équipage

| Date | Testeur (équipage) | Où il a bloqué | Corrigé |
| --- | --- | --- | --- |
| | | | |
