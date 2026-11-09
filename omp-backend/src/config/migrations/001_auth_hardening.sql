-- =============================================================================
-- 001_auth_hardening.sql
-- =============================================================================
-- Additive, idempotent migration for the authentication module.
-- It creates TWO NEW tables and does not touch any existing table or column,
-- so customer / seller / admin data is never modified.
--
--   1. password_reset_tokens - single-use, expiring, SHA-256 hashed reset tokens
--   2. revoked_tokens        - JWT blacklist (jti) so logout can really revoke
--
-- Run with:  npm run migrate      (from omp-backend/)
--
-- NOTE ON FOREIGN KEYS: `user_id` is intentionally NOT a foreign key. A reset
-- token or a revoked JWT can belong to a customer, a seller OR an admin, and
-- those live in three separate tables, so a single FK column cannot reference
-- all of them. The `role` column (CHECK constrained) plus the application code
-- is what keeps the reference valid.
-- =============================================================================

-- NOTE: no BEGIN/COMMIT here - src/config/migrate.js wraps each migration file
-- in its own transaction and records it in schema_migrations.

-- -----------------------------------------------------------------------------
-- 1. Per-account token generation ("token version")
-- -----------------------------------------------------------------------------
-- ADDITIVE ONLY: one integer column with a default, added to the three existing
-- user tables. No existing column, row or constraint is touched.
--
-- Its purpose is mass session invalidation. A JWT carries the `tv` it was
-- signed with; when a password is changed or reset we increment this column,
-- which instantly invalidates EVERY token previously issued to that account
-- (useful after a password leak or a reset triggered by an attacker).
-- Single-device logout is handled separately by the revoked_tokens table below.
ALTER TABLE customer ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE seller   ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE admin    ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 1;

-- -----------------------------------------------------------------------------
-- 2. Password reset tokens
-- -----------------------------------------------------------------------------
-- Only the SHA-256 HASH of the reset token is stored. A database leak therefore
-- does not hand out working reset links. Tokens are single-use (`used_at`) and
-- expire (`expires_at`).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     BIGINT       NOT NULL,
    role        VARCHAR(20)  NOT NULL
        CHECK (role IN ('customer', 'seller', 'admin')),
    token_hash  CHAR(64)     NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_hash
    ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_user
    ON password_reset_tokens (role, user_id);

-- -----------------------------------------------------------------------------
-- 3. Revoked JWTs (logout blacklist)
-- -----------------------------------------------------------------------------
-- Every JWT now carries a `jti` (unique id). Logging out inserts that jti here
-- and authMiddleware.authenticate() rejects any token whose jti is present.
-- Rows are only useful until the token would have expired anyway, so
-- `expires_at` lets us prune the table cheaply.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti         UUID         PRIMARY KEY,
    role        VARCHAR(20)  NOT NULL,
    user_id     BIGINT       NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
    ON revoked_tokens (expires_at);
