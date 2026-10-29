# PostgreSQL 17 + PostGIS 3 + h3-pg, used for local development and CI.
# Built on the official image (Debian bookworm, PGDG apt repository already configured).
# Was postgis/postgis:17-3.5, which is Debian bullseye: PGDG no longer builds packages for
# bullseye, so installing h3 there broke.
FROM postgres:17-bookworm

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      postgresql-17-postgis-3 \
      postgresql-17-postgis-3-scripts \
      postgresql-17-h3 \
 && rm -rf /var/lib/apt/lists/*
