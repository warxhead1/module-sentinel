-- Migration: Prepare database for migration system
-- This handles the transition from Drizzle's hash-based migrations to our filename-based system

-- This migration does nothing but serves as a marker that we've transitioned
-- from the old Drizzle migration system to our new one
SELECT 1;