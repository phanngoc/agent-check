-- Rollback: Change target_element back to VARCHAR(255)
-- Note: This may fail if there are existing rows with values longer than 255 characters

ALTER TABLE events ALTER COLUMN target_element TYPE VARCHAR(255);

