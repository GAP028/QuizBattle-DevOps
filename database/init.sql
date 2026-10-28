
-- =========================================================
-- QuizBattle-DevOps : initialisation de la base PostgreSQL
-- =========================================================

-- 1. Table des quiz
CREATE TABLE quiz (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titre VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Table des questions
CREATE TABLE question (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL
        REFERENCES quiz(id) ON DELETE CASCADE,
    enonce TEXT NOT NULL,
    ordre INTEGER NOT NULL CHECK (ordre > 0),
    duree_secondes INTEGER NOT NULL DEFAULT 15
        CHECK (duree_secondes > 0),

    UNIQUE (quiz_id, ordre),
    UNIQUE (quiz_id, id)
);

-- 3. Table des options de réponse
CREATE TABLE option_reponse (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id BIGINT NOT NULL
        REFERENCES question(id) ON DELETE CASCADE,
    libelle TEXT NOT NULL,
    est_correcte BOOLEAN NOT NULL DEFAULT FALSE,

    UNIQUE (id, question_id)
);

-- 4. Table des participants
CREATE TABLE participant (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pseudo VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5. Table des sessions de quiz en direct
CREATE TABLE session_quiz (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL
        REFERENCES quiz(id),
    code_session VARCHAR(10) NOT NULL UNIQUE,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'en_cours', 'terminee')),
    date_debut TIMESTAMP,
    date_fin TIMESTAMP,

    CHECK (
        date_fin IS NULL
        OR date_debut IS NULL
        OR date_fin >= date_debut
    ),

    UNIQUE (id, quiz_id)
);

-- 6. Association entre les participants et les sessions
CREATE TABLE participation (
    session_id BIGINT NOT NULL
        REFERENCES session_quiz(id) ON DELETE CASCADE,
    participant_id BIGINT NOT NULL
        REFERENCES participant(id) ON DELETE CASCADE,
    score_total INTEGER NOT NULL DEFAULT 0
        CHECK (score_total >= 0),

    PRIMARY KEY (session_id, participant_id)
);

-- 7. Table des réponses des participants
CREATE TABLE reponse (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    session_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    quiz_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    option_reponse_id BIGINT,

    est_correcte BOOLEAN NOT NULL DEFAULT FALSE,

    temps_reponse_ms INTEGER
        CHECK (
            temps_reponse_ms IS NULL
            OR temps_reponse_ms >= 0
        ),

    date_reponse TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Le participant doit être inscrit à la session
    FOREIGN KEY (session_id, participant_id)
        REFERENCES participation(session_id, participant_id)
        ON DELETE CASCADE,

    -- La session doit correspondre au quiz déclaré
    FOREIGN KEY (session_id, quiz_id)
        REFERENCES session_quiz(id, quiz_id),

    -- La question doit appartenir à ce quiz
    FOREIGN KEY (quiz_id, question_id)
        REFERENCES question(quiz_id, id),

    -- L'option choisie doit appartenir à la question
    FOREIGN KEY (option_reponse_id, question_id)
        REFERENCES option_reponse(id, question_id),

    -- Une seule réponse par participant et par question dans une session
    UNIQUE (session_id, participant_id, question_id)
);

-- 8. Index pour accélérer les recherches
CREATE INDEX idx_question_quiz
    ON question(quiz_id);

CREATE INDEX idx_option_question
    ON option_reponse(question_id);

CREATE INDEX idx_session_quiz
    ON session_quiz(quiz_id);

CREATE INDEX idx_participation_participant
    ON participation(participant_id);

CREATE INDEX idx_reponse_question
    ON reponse(question_id);

CREATE INDEX idx_reponse_session
    ON reponse(session_id);

CREATE INDEX idx_reponse_participation
    ON reponse(session_id, participant_id);
