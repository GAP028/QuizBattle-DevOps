# Carnet de la flotte

Tenu par la mesure (Adam). Le relevé chiffré de la journée, **y compris les chiffres décevants**.
Une mesure n'a de sens qu'avec son point de comparaison : on note toujours l'avant et l'après,
et ce qui a changé entre les deux.

Méthode : les chiffres viennent de Prometheus et Grafana (panneaux 1 et 2) ou de `docker images`.
Chaque valeur précise où elle a été prise : **banc de test** ou **flotte réelle**.

## Les relevés

| Ce qu'on mesure | Avant | Après | Ce qui a changé entre les deux |
| --- | --- | --- | --- |
| Taille de l'image front | 93,6 MB (nginx, d'après `docker/frontend/README.md`) | 261 MB (Node, mesuré le 28/10) | Passage de nginx à un serveur Node avec métriques et pulse ; image en une seule étape |
| Taille de l'image API | — | 242 MB (mesuré le 28/10) | Image en une seule étape |
| Taille de l'image stats | — | 244 MB (mesuré le 28/10) | Image en deux étapes dès sa création |
| Durée entre le push et le dernier carré à jour | à mesurer | à mesurer | Nécessite le job de déploiement |
| Coups encaissés par pulse, avec un exemplaire | — | 300 au plus (≈ 55 coups/s mesurés sur stats) | Plafond fixé par `pulse.js` (300 coups par pulse), pas par la vitesse du service |
| Coups encaissés par pulse, avec trois exemplaires (`--scale stats=3`) | 3 000 coups en 54,4 s (1 exemplaire) | 3 000 coups en 17,3 s (3 exemplaires) | 3,1 fois plus vite : chaque exemplaire a son propre pulse. La base n'a pas freiné à cette charge |
| Nombre de coups avant que le carré ne pâlisse | — | dès qu'un service reçoit plus de ≈ 60 coups/s par exemplaire | Au-delà, le retard grossit : chaque pulse n'en encaisse que 300. Le tableau pâlit au-delà de 40 coups en retard |
| Temps de retour à un carré plein après une salve de 1 000 coups | 20,7 s (stats, 1 exemplaire) ; 19,2 s (front) | 9,3 s (stats, 3 exemplaires) | Trois pulses en parallèle au lieu d'un |

Tailles relevées avec `docker images` (Docker Desktop) sur des images construites depuis `main`.

### Comment ces chiffres ont été obtenus, et leurs limites

Mesures du 28/10 sur le vrai `compose.prod.yml` monté en local (vrais front, API et base), avec le
service stats et un **faux tableau** ajoutés hors dépôt. Les salves sont envoyées au faux tableau,
qui en transmet au plus 300 par pulse ; de toute façon, `pulse.js` n'en encaisse jamais plus de 300
par pulse, quel que soit le tableau.

- `/travail` répond vite : p95 de **9,1 ms** pour stats (une requête en base) et **4,8 ms** pour le
  front (qui ne fait rien). Le service n'est jamais le goulot : c'est le pulse.
- Le front ne peut pas être dupliqué tel quel : il publie un port fixe (3003), et deux conteneurs ne
  peuvent pas écouter sur le même port de la machine.
- **À refaire avec le vrai tableau de la classe** : son comportement exact avec plusieurs exemplaires
  d'un même service n'est pas connu.

## Le dernier relevé : combien coûte une livraison ?

À faire deux fois, pour comparer (palier 7).

| La façon de livrer | Carrés éteints pendant la livraison | Coups perdus | Durée totale |
| --- | --- | --- | --- |
| `docker compose up -d` sur la machine cible | à mesurer | | |
| Rolling update sur le cluster | à mesurer | | |

## Comment prendre ces mesures

Une salve sur un service, depuis le poste (le feu doit être ouvert au tableau) :

```bash
for i in $(seq 1 5); do
  curl -s -X POST "$TABLEAU_URL/api/coups" \
    -H 'Content-Type: application/json' \
    -d "{\"groupe\":\"$GROUPE\",\"service\":\"api\",\"nombre\":200}"
done
```

Pendant la salve, relever dans Grafana : panneau 1 (coups par seconde), panneau 2 (p95 de
`/travail`), et noter l'heure à laquelle le carré pâlit puis redevient plein.
