# PostgreSQL 17 + PostGIS 3.5 + h3-pg, used for local development and CI.
# The base image is Debian with the PGDG apt repository already configured.
FROM postgis/postgis:17-3.5

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-h3 \
 && rm -rf /var/lib/apt/lists/*
