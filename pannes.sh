#!/usr/bin/env bash
# pannes.sh : tire une panne au hasard et l'applique sur la machine cible.
# À lancer depuis votre poste, la machine cible doit être joignable en SSH.
# Personne dans l'équipage ne regarde le numéro qui sort, c'est tout l'intérêt.
# Script fourni par le sujet ; seule adaptation : notre troisième service s'appelle stats.
set -u
CIBLE="ssh -i deploy_key -p 2222 root@localhost"
SERVICES=(front api stats)
VICTIME=${SERVICES[$RANDOM % ${#SERVICES[@]}]}
ID="docker ps -qf name=$VICTIME | head -1"

case $((RANDOM % 6)) in
  0) $CIBLE "docker kill \$($ID)" ;;
  1) $CIBLE "docker stop \$(docker ps -qf name=db | head -1)" ;;
  2) $CIBLE "docker exec \$($ID) chmod 000 /data" ;;
  3) $CIBLE "cd /srv/flotte && sed -i 's|^DB_PASSWORD=.*|DB_PASSWORD=|' .env && docker compose up -d api" ;;
  4) $CIBLE "cd /srv/flotte && sed -i 's|^TAG=.*|TAG=nexistepas|' .env && docker compose up -d $VICTIME" ;;
  5) $CIBLE "cd /srv/flotte && sed -i 's|^TABLEAU_URL=.*|TABLEAU_URL=http://127.0.0.1:1|' .env && docker compose up -d $VICTIME" ;;
esac
echo "Le tableau va parler. Qu'est-ce qui s'est éteint, et pourquoi ?"
