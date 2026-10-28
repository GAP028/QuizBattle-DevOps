
-- =========================================================
-- QuizBattle-DevOps : données initiales du quiz
-- =========================================================
-- Reprend les trois questions présentes dans index.html.
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
    (3, 'Que signifie CI/CD ?')
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
    (3, 4, 'Cloud Integration / Cloud Database', FALSE)
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
