ALTER TABLE inspections ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE offers ADD COLUMN archived boolean NOT NULL DEFAULT false;
ALTER TABLE contracts ADD COLUMN archived boolean NOT NULL DEFAULT false;