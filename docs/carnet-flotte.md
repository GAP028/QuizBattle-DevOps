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
| Coups encaissés par pulse, avec un exemplaire | à mesurer | | |
| Coups encaissés par pulse, avec trois exemplaires (`--scale api=3`) | à mesurer | | La base n'est pas dupliquée : on s'attend à moins de trois fois plus |
| Nombre de coups avant que le carré ne pâlisse | à mesurer | | |
| Temps de retour à un carré plein après une salve de 1 000 coups | à mesurer | | |

Tailles relevées avec `docker images` (Docker Desktop) sur des images construites depuis `main`.

### Ce qui a déjà été observé sur le banc

- Service stats, 300 coups sur `/travail` : tous réussis, 296 en moins de 25 ms (seaux de
  l'histogramme). Le banc ne remplace pas la mesure sur la flotte réelle.

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
