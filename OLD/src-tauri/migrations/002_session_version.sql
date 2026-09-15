-- Add session_version to users table for real JWT invalidation on logout.
-- Incrementing this column makes all previously issued tokens for a user invalid.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version INT NOT NULL DEFAULT 1;
