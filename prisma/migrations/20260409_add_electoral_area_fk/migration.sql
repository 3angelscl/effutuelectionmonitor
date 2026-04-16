-- Clean up orphaned station references before adding the foreign key.
UPDATE "PollingStation"
SET "electoralArea" = NULL
WHERE "electoralArea" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "ElectoralArea"
    WHERE "ElectoralArea"."name" = "PollingStation"."electoralArea"
  );

-- Enforce referential integrity between stations and electoral areas.
ALTER TABLE "PollingStation"
ADD CONSTRAINT "PollingStation_electoralArea_fkey"
FOREIGN KEY ("electoralArea")
REFERENCES "ElectoralArea"("name")
ON DELETE SET NULL
ON UPDATE CASCADE;
