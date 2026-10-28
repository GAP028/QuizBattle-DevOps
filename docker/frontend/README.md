# Docker — QuizBattle Frontend

## Objectif

Conteneuriser le frontend statique de QuizBattle avec Nginx.

## Technologies

- Docker
- Nginx Alpine
- HTML, CSS et JavaScript

## Construction de l'image

Depuis la racine du dépôt :

```cmd
docker build -t quizbattle-frontend:1.1 ./docker/frontend
```

## Lancement du conteneur

```cmd
docker run -d --name quizbattle-frontend -p 8085:80 quizbattle-frontend:1.1
```

L'application est accessible sur `http://localhost:8085`.

## Vérification

```cmd
docker ps
docker inspect --format="{{.State.Health.Status}}" quizbattle-frontend
```

Le statut attendu du healthcheck est `healthy`.

## Taille de l'image

- Image initiale `quizbattle-frontend:1.0` : 93,6 MB sur disque.
- Image avec healthcheck `quizbattle-frontend:1.1` : à mesurer.

Pour mesurer la taille :

```cmd
docker images quizbattle-frontend
```

## Reconstruction après modification

Après modification du frontend ou du Dockerfile, reconstruire l'image avec la commande de construction ci-dessus. Si le conteneur existe déjà, le supprimer avant de le relancer.
