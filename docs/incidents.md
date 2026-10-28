# Journal de bord des pannes

Tenu par l'astreinte (Adam). Une entrée par panne, **y compris celles qu'on n'a pas su réparer**.
La plus récente en haut. Chaque entrée dit où la panne a eu lieu : sur le **banc de test**
(`monitoring/test`, faux services) ou sur la **flotte** (machine cible, vrais services).

Ce que chaque entrée doit contenir :

- **Heure** du déclenchement, et durée jusqu'au retour à la normale ;
- **Ce que le tableau de la classe a montré** ;
- **Le panneau Grafana** qui a révélé la panne ;
- **Les hypothèses écartées**, et pourquoi ;
- **La cause confirmée**, et comment elle a été confirmée ;
- **La manœuvre** qui a réparé.

## Bilan

| Panne | Banc de test | Flotte réelle | Réparation chronométrée |
| --- | --- | --- | --- |
| 1 · Conteneur tué | ✅ | à faire | non |
| 2 · Base coupée | ✅ | à faire | ✅ 11 s (stats) |
| 3 · Pavillon illisible | ✅ | à faire | ✅ 2 s |
| 4 · Secret effacé | — | à faire | — |
| 5 · Version introuvable | — | à faire | — |
| 6 · Tableau injoignable | ✅ | à faire | non |

Le sujet demande au moins **trois réparations chronométrées** : deux sont faites, sur le banc.

---

## 28/10 · Panne 3 · Pavillon illisible — banc de test

- **Déclenchement** : `docker exec test-api-1 chmod 000 /data`, après avoir hissé un pavillon.
- **Tableau de la classe** : non concerné (banc de test). Attendu en vrai : le pavillon disparaît,
  tous les carrés restent pleins.
- **Panneau qui l'a révélée** : 3 · Dépendances — `api → pavillon` passe en **KO**, tous les autres
  voyants restent verts.
- **Hypothèses écartées** : pannes 1, 2, 4, 5 et 6, qui éteignent toutes un carré ou un autre
  voyant ; « pavillon jamais hissé », qui afficherait « aucune donnée » et non KO.
- **Cause confirmée** : `docker exec test-api-1 ls -ld /data` affiche `d---------`.
- **Observation importante** : la panne **survit au redéploiement**. Le conteneur `api` a été
  recréé (`up -d --force-recreate`) et `/data` est resté en `d---------`, parce que le `chmod`
  modifie le volume et non le conteneur. Redéployer ne répare donc pas cette panne.
- **Manœuvre** : `docker exec test-api-1 chmod 755 /data`.
- **Retour à la normale** : voyant vert **2 s** après la manœuvre.

## 28/10 · Panne 2 · Base coupée — banc de test, vrai service stats

- **Déclenchement** : `docker stop test-db-1`, avec le vrai service stats branché sur la base de
  l'équipe.
- **Panneau qui l'a révélée** : 3 · Dépendances — `stats → postgres` passe à **0** en 6 s, alors
  que `stats → répond` reste vert (`up = 1`).
- **Hypothèses écartées** : panne 1 (le process répond), panne 6 (le pulse est vert).
- **Cause confirmée** : `/sante` du service répond `503 {"base":"injoignable"}`, et le conteneur de
  la base est arrêté.
- **Manœuvre** : `docker start test-db-1`.
- **Retour à la normale** : `stats → postgres` revient à 1 **11 s** après, **sans toucher au
  service**.

## 28/10 · Panne 1 · Conteneur tué — banc de test

- **Déclenchement** : `docker kill test-front-1` (le front était alors un nginx sondé par blackbox).
- **Panneau qui l'a révélée** : 3 · Dépendances — `front → répond (sonde)` passe à **0**.
- **Cause confirmée** : `docker ps -a` montre le conteneur `Exited (137)`.
- **Observation importante** : `restart: unless-stopped` **ne relance pas** un conteneur tué par
  `docker kill`, considéré comme arrêté à la main. Il est resté arrêté.
- **Manœuvre** : `docker start test-front-1`. Retour à 1 constaté, durée non chronométrée.

## 28/10 · Panne 6 · Tableau injoignable — banc de test

- **Déclenchement** : relance du faux service stats avec `TABLEAU_URL=http://127.0.0.1:1`.
- **Panneau qui l'a révélée** : 3 · Dépendances — `stats → tableau (pulse)` passe en **KO** pendant
  que `stats → répond` reste vert.
- **Hypothèses écartées** : panne 1 (le process répond), panne 2 (pas de dépendance base en défaut).
- **Manœuvre** : relance du service avec la bonne `TABLEAU_URL`. Retour constaté, durée non
  chronométrée.

## 28/10 · Panne 2 · Base coupée — banc de test, faux service api

- **Déclenchement** : `docker stop test-db-1`.
- **Panneau qui l'a révélée** : 3 · Dépendances — `api → postgres` passe à **0**.
- **Manœuvre** : `docker start test-db-1`. Retour à 1 sans toucher à l'API, durée non chronométrée.
