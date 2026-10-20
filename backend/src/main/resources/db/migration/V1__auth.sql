CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    consent_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    credentials_version INTEGER NOT NULL DEFAULT 0,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    reset_token_hash VARCHAR(64) UNIQUE,
    reset_expires_at TIMESTAMPTZ,
    reset_sent_at TIMESTAMPTZ
);

-- A password is only promoted to an account after its matching challenge is verified.
CREATE TABLE email_verifications (
    email VARCHAR(254) PRIMARY KEY,
    challenge_id UUID NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    code_hash VARCHAR(100) NOT NULL,
    consent_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);
