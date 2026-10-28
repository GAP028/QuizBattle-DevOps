# Service annexe : statistiques du quiz

Le troisième carré de la flotte. Il lit PostgreSQL **en lecture seule** et calcule ce que l'API ne
calcule pas : le taux de réussite par question, le temps de réponse moyen et le classement.
Il ne fait aucune écriture : l'API et la base restent les seules à faire autorité.

## Routes

| Route | Réponse |
| --- | --- |
| `GET /stats` | Résumé : nombre de quiz, questions, participants, réponses, bonnes réponses, sessions en cours, taux de réussite |
| `GET /stats/questions` | Par question : réponses, bonnes réponses, taux de réussite, temps moyen (ms) |
| `GET /stats/classement` | Les 10 meilleurs scores, toutes sessions confondues |
| `GET /sante` | `200` si la base répond, `503` sinon (la sonde dit la vérité) |
| `GET /travail` | Un vrai calcul en base pour chaque coup : `200` si réussi, `503` sinon |
| `GET /metrics` | Les métriques de `monitoring/lib/metrics.js`, lues par Prometheus |

Un taux vaut `null` tant qu'aucune réponse n'existe : ce n'est pas zéro, c'est « pas encore mesuré ».

## Configuration

| Variable | Rôle | Obligatoire |
| --- | --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL. **Sans elle, le service refuse de démarrer** et le dit dans ses logs | oui |
| `PORT` | Port d'écoute, `3000` par défaut | non |
| `VERSION` | Le sha du commit, affiché par le panneau 4 de Grafana | recommandé |
| `TABLEAU_URL`, `GROUPE`, `COULEUR`, `URL_INTERNE` | Le pulse vers le tableau de la classe | pour avoir un carré |

`SERVICE=stats` est déjà fixé dans l'image.

## Construire et lancer

L'image se construit **depuis la racine du dépôt**, comme le front, pour embarquer `monitoring/lib` :

```bash
docker build -f stats/Dockerfile -t quizbattle-stats .
```

Elle est en deux étapes : la première installe les dépendances depuis `package-lock.json`, la
seconde ne garde que `node_modules`, le code et la bibliothèque de supervision. Le process tourne
en utilisateur `node`, non root.

## Bloc à ajouter dans `compose.prod.yml`

```yaml
  stats:
    image: ${REGISTRY}/${GROUPE}-stats:${TAG}
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}
      TABLEAU_URL: ${TABLEAU_URL}
      GROUPE: ${GROUPE}
      COULEUR: ${COULEUR}
      VERSION: ${TAG}
      URL_INTERNE: http://stats:3000
    depends_on:
      - db
```

Pas de port publié : seuls le front (depuis le navigateur, si besoin) et Prometheus l'interrogent.
Les noms `DB_USER` et `DB_NAME` sont à aligner sur la configuration de la base retenue par l'équipe.

## Ce qui a été vérifié sur le banc de test

- Sans `DATABASE_URL` : arrêt immédiat avec un message clair, code de sortie 1.
- Avec la base de l'équipe (`database/init.sql` et `seed.sql`) : les quatre routes répondent ; avec
  des réponses de test insérées, les taux et le classement sont corrects.
- Prometheus lit sa cible `stats` (`UP`), avec la version et l'état de la base.
- 300 coups encaissés sur `/travail`, tous réussis ; 296 en moins de 25 ms.
- Base arrêtée : `quiz_dependance_ok` passe à 0 en 6 s, le service reste joignable, `/sante` et
  `/stats` renvoient `503`. Base relancée : retour à 1 en 11 s sans toucher au service.

Pas encore vérifié : le service dans `compose.prod.yml` et sur la machine cible.

## Limite actuelle

Personne n'enregistre encore les réponses des joueurs en base : le front calcule le score dans le
navigateur. Tant que ce n'est pas fait, les statistiques restent à zéro sur la vraie flotte.
