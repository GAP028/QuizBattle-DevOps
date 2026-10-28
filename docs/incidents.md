# Journal de bord des pannes

Tenu par l'astreinte (Adam). Une entrée par panne, **y compris celles qu'on n'a pas su réparer**.
La plus récente en haut. Chaque entrée dit où la panne a eu lieu :

- **banc de test** : `monitoring/test`, faux services ;
- **flotte en local** : le vrai `compose.prod.yml` (vrais front, API et base) monté sur un poste,
  avec stats et un faux tableau ajoutés hors dépôt ;
- **flotte réelle** : la machine cible, pendant la journée.

Ce que chaque entrée doit contenir :

- **Heure** du déclenchement, et durée jusqu'au retour à la normale ;
- **Ce que le tableau de la classe a montré** ;
- **Le panneau Grafana** qui a révélé la panne ;
- **Les hypothèses écartées**, et pourquoi ;
- **La cause confirmée**, et comment elle a été confirmée ;
- **La manœuvre** qui a réparé.

## Bilan

| Panne | Banc de test | Flotte en local | Machine cible | Réparation chronométrée |
| --- | --- | --- | --- | --- |
| 1 · Conteneur tué | ✅ | — | à faire | non |
| 2 · Base coupée | ✅ | ✅ | à faire | ✅ 11 s (banc), 9 s et 29 s (local) |
| 3 · Pavillon illisible | ✅ | — | à faire | ✅ 2 s |
| 4 · Secret effacé | — | ✅ | à faire | ✅ 20 s |
| 5 · Version introuvable | — | ✅ | à faire | non |
| 6 · Tableau injoignable | ✅ | — | à faire | non |

Le sujet demande au moins **trois réparations chronométrées** : elles sont faites (pannes 2, 3 et 4).
Les six pannes ont été provoquées au moins une fois, mais pas encore sur la machine cible.

---

## 28/10 · Panne 2 · Base coupée — flotte en local

- **Déclenchement** : `docker stop` du conteneur `db`, avec le vrai `compose.prod.yml`.
- **Panneau qui l'a révélée** : 3 · Dépendances — `stats → postgres` à **0** en **2 s**, alors que
  `stats → répond` reste vert. Le healthcheck de Docker n'a déclaré l'API `unhealthy` qu'au bout de
  **86 s** : la supervision voit la panne bien avant `docker compose ps`.
- **Hypothèses écartées** : panne 1 (le process répond), panne 6 (le pulse est vert).
- **Manœuvre** : `docker start` de la base.
- **Retour à la normale** : stats en **9 s**, API `healthy` en **29 s**, sans toucher aux services.

## 28/10 · Panne 5 · Version introuvable — flotte en local

- **Déclenchement** : `TAG=nexistepas` dans le `.env`, puis `docker compose up -d front`, comme le
  fait `pannes.sh`.
- **Ce qui s'est passé** : `compose.prod.yml` contient `build:`. Docker n'a pas trouvé l'image sur le
  registry, l'a **reconstruite sur place** sous le tag `nexistepas` et a relancé le front.
  **Rien ne s'est éteint.** Seul le panneau 4 aurait trahi la panne : version `nexistepas`.
- **Contre-essai** avec l'image publiée par le CI (`gomaso/quizbattle-front`), sans `build:` : le
  téléchargement échoue (`not found`) et Docker Compose **laisse l'ancien conteneur tourner**, même
  version, même heure de démarrage. Rien ne s'éteint non plus : la panne est latente jusqu'au
  prochain redémarrage.
- **Cause confirmée** : `grep TAG .env` montre `TAG=nexistepas`.
- **Manœuvre** : remettre le tag d'origine et relancer le service. Non chronométrée.
- **À retenir** : le sujet annonce un carré qui s'éteint ; avec notre configuration, ce n'est pas le
  cas. Il faut le dire pendant le passage plutôt que chercher un carré éteint.

## 28/10 · Panne 4 · Secret effacé — flotte en local

- **Déclenchement, tel que `pannes.sh` le faisait** : vider `DB_PASSWORD`. Cette variable n'existe
  pas dans notre `.env` (`compose.prod.yml` utilise `POSTGRES_PASSWORD`) : **la commande ne changeait
  rien**. `pannes.sh` a été corrigé.
- **Sur la vraie variable, vidée** : Docker Compose **refuse de relancer l'API**
  (`POSTGRES_PASSWORD manquant dans le .env`). L'API déjà lancée continue de tourner ; rien ne
  s'éteint. La panne est latente : le prochain déploiement échouera.
- **Variante, mot de passe faux** : l'API redémarre mais ne joint plus la base. Elle passe
  `unhealthy` au bout de **101 s**, `/api/health` répond `500`, ses logs disent
  `password authentication failed`, alors que `db` reste `healthy`.
- **Panneau qui l'a révélée** : aucun. L'API n'expose pas encore `/metrics` : Grafana ne la voit pas.
  Diagnostic fait avec `docker compose ps` et les logs.
- **Hypothèses écartées** : panne 2 (la base est `healthy`), panne 1 (le conteneur tourne).
- **Manœuvre** : remettre le bon mot de passe dans `.env`, puis `docker compose up -d api`.
- **Retour à la normale** : `/api/health` répond `200` **20 s** après la manœuvre (`healthy` à 25 s).


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
