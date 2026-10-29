/**
 * Development seed: a handful of well-known public places in central Córdoba so the map has
 * something to show before the OSM import has been run.
 *
 * Coordinates are approximate (hand-entered, a few metres to tens of metres off) and are NOT
 * derived from OpenStreetMap. Run `world:import` for real data; it never touches seed rows.
 * Refuses to run when NODE_ENV=production.
 */
import { createDb } from '../src/db.js';

const SEED: { ref: string; name: string; kind: string; biome: string; lat: number; lng: number }[] =
  [
    {
      ref: 'seed-tendillas',
      name: 'Plaza de las Tendillas',
      kind: 'square',
      biome: 'urban',
      lat: 37.8847,
      lng: -4.7792,
    },
    {
      ref: 'seed-puente-romano',
      name: 'Puente Romano',
      kind: 'bridge',
      biome: 'historic',
      lat: 37.8764,
      lng: -4.7775,
    },
    {
      ref: 'seed-calahorra',
      name: 'Torre de la Calahorra',
      kind: 'tower',
      biome: 'historic',
      lat: 37.8749,
      lng: -4.7768,
    },
    {
      ref: 'seed-alcazar',
      name: 'Alcázar de los Reyes Cristianos',
      kind: 'castle',
      biome: 'historic',
      lat: 37.8769,
      lng: -4.7831,
    },
    {
      ref: 'seed-templo-romano',
      name: 'Templo Romano',
      kind: 'archaeological_site',
      biome: 'historic',
      lat: 37.8853,
      lng: -4.7767,
    },
    {
      ref: 'seed-corredera',
      name: 'Plaza de la Corredera',
      kind: 'square',
      biome: 'urban',
      lat: 37.8833,
      lng: -4.7738,
    },
    {
      ref: 'seed-victoria',
      name: 'Jardines de la Victoria',
      kind: 'park',
      biome: 'park',
      lat: 37.8843,
      lng: -4.7862,
    },
    {
      ref: 'seed-puerta-almodovar',
      name: 'Puerta de Almodóvar',
      kind: 'city_gate',
      biome: 'historic',
      lat: 37.881,
      lng: -4.7838,
    },
    {
      ref: 'seed-capitulares',
      name: 'Plaza de Capitulares',
      kind: 'square',
      biome: 'urban',
      lat: 37.8856,
      lng: -4.776,
    },
    {
      ref: 'seed-molino-martos',
      name: 'Molino de Martos',
      kind: 'museum',
      biome: 'culture',
      lat: 37.8783,
      lng: -4.7708,
    },
  ];

if (process.env.NODE_ENV === 'production') throw new Error('seed-dev must not run in production');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const db = createDb(url);
try {
  for (const p of SEED) {
    await db.query(
      `INSERT INTO pois (osm_ref, source, kind, biome, name, geom, h3_r9)
       VALUES ($1, 'seed', $2, $3, $4,
               ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
               h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($6, $5), 4326), 9))
       ON CONFLICT (osm_ref) DO NOTHING`,
      [p.ref, p.kind, p.biome, p.name, p.lat, p.lng],
    );
  }
  console.warn(`seeded ${SEED.length} approximate POIs in central Córdoba`);
} finally {
  await db.end();
}
