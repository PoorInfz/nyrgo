-- Up Migration
-- Players choose whether their catches appear on the website's globe (on by default for adults;
-- minors never appear). Turning it off also removes the marks already kept.
ALTER TABLE players ADD COLUMN show_on_globe boolean NOT NULL DEFAULT true;

-- Down Migration
ALTER TABLE players DROP COLUMN IF EXISTS show_on_globe;
