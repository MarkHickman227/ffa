-- Fix invalid BUYER_SOLICITOR role values
-- Convert any BUYER_SOLICITOR entries to BUYER (the closest valid role)
UPDATE "users" SET "role" = 'BUYER' WHERE "role" = 'BUYER_SOLICITOR';

