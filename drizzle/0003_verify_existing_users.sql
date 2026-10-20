-- Email verification is now enforced at sign-in. Grandfather every account that existed
-- before the change so current users are not locked out.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
