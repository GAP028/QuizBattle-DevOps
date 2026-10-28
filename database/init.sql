
-- Table des quiz
CREATE TABLE quiz (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    titre VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table des questions
CREATE TABLE question (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL
        REFERENCES quiz(id) ON DELETE CASCADE,
    enonce TEXT NOT NULL,
    ordre INTEGER NOT NULL CHECK (ordre > 0),
    duree_secondes INTEGER NOT NULL DEFAULT 15
        CHECK (duree_secondes > 0),
    UNIQUE (quiz_id, ordre)
);

-- Table des options de réponse
CREATE TABLE option_reponse (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    question_id BIGINT NOT NULL
        REFERENCES question(id) ON DELETE CASCADE,
    libelle TEXT NOT NULL,
    est_correcte BOOLEAN NOT NULL DEFAULT FALSE
);

-- Table des participants
CREATE TABLE participant (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pseudo VARCHAR(50) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Table des sessions de quiz en direct
CREATE TABLE session_quiz (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    quiz_id BIGINT NOT NULL REFERENCES quiz(id),
    code_session VARCHAR(10) NOT NULL UNIQUE,
    statut VARCHAR(20) NOT NULL DEFAULT 'en_attente'
        CHECK (statut IN ('en_attente', 'en_cours', 'terminee')),
    date_debut TIMESTAMP,
    date_fin TIMESTAMP,
    CHECK (date_fin IS NULL OR date_debut IS NULL OR date_fin >= date_debut)
);

-- Association entre les participants et les sessions
CREATE TABLE participation (
    session_id BIGINT NOT NULL
        REFERENCES session_quiz(id) ON DELETE CASCADE,
    participant_id BIGINT NOT NULL
        REFERENCES participant(id) ON DELETE CASCADE,
    score_total INTEGER NOT NULL DEFAULT 0 CHECK (score_total >= 0),
    PRIMARY KEY (session_id, participant_id)
);

-- Table des réponses envoyées par les participants
CREATE TABLE reponse (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL
        REFERENCES question(id),
    option_reponse_id BIGINT
        REFERENCES option_reponse(id),
    est_correcte BOOLEAN NOT NULL DEFAULT FALSE,
    temps_reponse_ms INTEGER
        CHECK (temps_reponse_ms IS NULL OR temps_reponse_ms >= 0),
    date_reponse TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id, participant_id)
        REFERENCES participation(session_id, participant_id)
        ON DELETE CASCADE,

    UNIQUE (session_id, participant_id, question_id)
);

-- Index pour accélérer les recherches

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
