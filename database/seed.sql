
-- =========================================================
-- QuizBattle-DevOps : données initiales du quiz
-- =========================================================
-- Questions 1 à 3 : reprises de l'ancienne version de index.html.
-- Questions 4 à 13 : questions DevOps ajoutées ensuite.
-- Ce script peut être relancé : il n'insère que ce qui manque
-- et ne modifie ni ne supprime aucune ligne existante.

BEGIN;

-- 1. Le quiz (identifié par son titre)
INSERT INTO quiz (titre, description)
SELECT 'Quiz informatique', 'Les questions de base du quiz QuizBattle'
WHERE NOT EXISTS (
    SELECT 1 FROM quiz WHERE titre = 'Quiz informatique'
);

-- 2. Les questions (une seule question par ordre dans un quiz)
INSERT INTO question (quiz_id, enonce, ordre, duree_secondes)
SELECT q.id, v.enonce, v.ordre, 15
FROM quiz q
CROSS JOIN (VALUES
    (1, 'Que signifie HTML ?'),
    (2, 'À quoi sert Docker ?'),
    (3, 'Que signifie CI/CD ?'),
    (4, 'Quelle commande liste les conteneurs Docker en cours d''exécution ?'),
    (5, 'Quel fichier décrit plusieurs services lancés ensemble avec Docker Compose ?'),
    (6, 'Quelle commande Git envoie les commits locaux vers GitHub ?'),
    (7, 'Sur quel port PostgreSQL écoute-t-il par défaut ?'),
    (8, 'À quoi sert un volume Docker ?'),
    (9, 'Que collecte Prometheus ?'),
    (10, 'À quoi sert un healthcheck dans un Dockerfile ?'),
    (11, 'Où doit-on stocker le mot de passe d''une base de données ?'),
    (12, 'Que permet GitHub Actions ?'),
    (13, 'Que signifie SQL ?')
) AS v(ordre, enonce)
WHERE q.titre = 'Quiz informatique'
ORDER BY v.ordre
ON CONFLICT (quiz_id, ordre) DO NOTHING;

-- 3. Les options de réponse, insérées dans l'ordre d'affichage
--    (l'API les trie par id)
INSERT INTO option_reponse (question_id, libelle, est_correcte)
SELECT qu.id, v.libelle, v.est_correcte
FROM (VALUES
    (1, 1, 'HyperText Markup Language', TRUE),
    (1, 2, 'HighText Machine Language', FALSE),
    (1, 3, 'HyperTool Main Language', FALSE),
    (1, 4, 'HomeText Markup Language', FALSE),

    (2, 1, 'Créer des vidéos', FALSE),
    (2, 2, 'Exécuter des applications dans des conteneurs', TRUE),
    (2, 3, 'Modifier des images', FALSE),
    (2, 4, 'Envoyer des emails', FALSE),

    (3, 1, 'Code Internet / Code Docker', FALSE),
    (3, 2, 'Continuous Integration / Continuous Delivery', TRUE),
    (3, 3, 'Computer Installation / Computer Development', FALSE),
    (3, 4, 'Cloud Integration / Cloud Database', FALSE),

    (4, 1, 'docker images', FALSE),
    (4, 2, 'docker ps', TRUE),
    (4, 3, 'docker run', FALSE),
    (4, 4, 'docker build', FALSE),

    (5, 1, 'Dockerfile', FALSE),
    (5, 2, 'package.json', FALSE),
    (5, 3, '.env', FALSE),
    (5, 4, 'compose.yml', TRUE),

    (6, 1, 'git push', TRUE),
    (6, 2, 'git pull', FALSE),
    (6, 3, 'git commit', FALSE),
    (6, 4, 'git clone', FALSE),

    (7, 1, '3306', FALSE),
    (7, 2, '8080', FALSE),
    (7, 3, '5432', TRUE),
    (7, 4, '27017', FALSE),

    (8, 1, 'Accélérer le réseau entre conteneurs', FALSE),
    (8, 2, 'Conserver les données après la suppression d''un conteneur', TRUE),
    (8, 3, 'Limiter la mémoire d''un conteneur', FALSE),
    (8, 4, 'Construire une image plus rapidement', FALSE),

    (9, 1, 'Des journaux d''erreurs', FALSE),
    (9, 2, 'Des images Docker', FALSE),
    (9, 3, 'Des sauvegardes SQL', FALSE),
    (9, 4, 'Des métriques', TRUE),

    (10, 1, 'Vérifier régulièrement que le service répond', TRUE),
    (10, 2, 'Réduire la taille de l''image', FALSE),
    (10, 3, 'Mettre à jour l''image automatiquement', FALSE),
    (10, 4, 'Ouvrir un port sur la machine hôte', FALSE),

    (11, 1, 'Dans le code source', FALSE),
    (11, 2, 'Dans le README', FALSE),
    (11, 3, 'Dans un fichier .env non versionné', TRUE),
    (11, 4, 'Dans le Dockerfile', FALSE),

    (12, 1, 'Héberger une base de données', FALSE),
    (12, 2, 'Automatiser les tests et les déploiements', TRUE),
    (12, 3, 'Créer des maquettes graphiques', FALSE),
    (12, 4, 'Remplacer Git', FALSE),

    (13, 1, 'Simple Query Logic', FALSE),
    (13, 2, 'System Quality Level', FALSE),
    (13, 3, 'Server Queue Language', FALSE),
    (13, 4, 'Structured Query Language', TRUE)
) AS v(question_ordre, position, libelle, est_correcte)
JOIN quiz q
    ON q.titre = 'Quiz informatique'
JOIN question qu
    ON qu.quiz_id = q.id
   AND qu.ordre = v.question_ordre
WHERE NOT EXISTS (
    SELECT 1
    FROM option_reponse o
    WHERE o.question_id = qu.id
      AND o.libelle = v.libelle
)
ORDER BY v.question_ordre, v.position;

COMMIT;
