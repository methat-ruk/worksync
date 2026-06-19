-- Abort before changing data when multiple existing emails normalize to the same value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    GROUP BY LOWER(BTRIM("email"))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize User.email because normalized duplicates exist';
  END IF;
END $$;

UPDATE "User"
SET "email" = LOWER(BTRIM("email"))
WHERE "email" <> LOWER(BTRIM("email"));

ALTER TABLE "User"
ADD COLUMN "passwordHash" TEXT;
