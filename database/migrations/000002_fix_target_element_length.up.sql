-- Fix target_element column length from VARCHAR(255) to TEXT
-- This allows storing HTML elements up to 500 characters as sent by the tracker

ALTER TABLE events ALTER COLUMN target_element TYPE TEXT;

