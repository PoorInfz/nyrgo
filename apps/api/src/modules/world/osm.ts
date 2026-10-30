/**
 * OpenStreetMap → game world. Pure functions only (no I/O), so every rule is unit tested.
 *
 * Input is an Overpass API response produced with `out geom;`. Output is a list of POIs and
 * exclusion zones whose geometry is still raw OSM coordinates; PostGIS builds and buffers the
 * shapes when they are loaded.
 *
 * Data © OpenStreetMap contributors, ODbL 1.0. The derived POI table is a Derivative Database
 * under the ODbL: it must keep attribution and be offered under the same licence if published.
 */

export type Tags = Record<string, string>;
export interface LatLon {
  lat: number;
  lon: number;
}

export interface OverpassNode {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Tags;
}
export interface OverpassWay {
  type: 'way';
  id: number;
  geometry?: LatLon[];
  tags?: Tags;
}
export interface OverpassRelation {
  type: 'relation';
  id: number;
  members?: { type: string; role: string; geometry?: LatLon[] }[];
  tags?: Tags;
}
export type OverpassElement = OverpassNode | OverpassWay | OverpassRelation;

export interface OverpassResponse {
  elements: OverpassElement[];
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Urban Córdoba, Spain (pilot city). */
export const CORDOBA_BBOX: BBox = { south: 37.85, west: -4.85, north: 37.92, east: -4.72 };

export type Biome = 'urban' | 'park' | 'historic' | 'culture';

export type PoiRule = { kind: string; biome: Biome };
export type ExclusionRule = { kind: string; bufferM: number };

/** Raw geometry as OSM gives it; `lines` become polygons in PostGIS with ST_BuildArea. */
export type RawGeometry =
  | { type: 'point'; lat: number; lon: number }
  | { type: 'line'; coords: LatLon[] }
  | { type: 'area'; lines: LatLon[][] };

export interface PoiRecord {
  osmRef: string;
  kind: string;
  biome: Biome;
  name: string;
  /** Representative point: the node itself, or the centroid of the shape for ways. */
  geometry: RawGeometry;
  tags: Tags;
}

export interface ExclusionRecord {
  osmRef: string;
  kind: string;
  bufferM: number;
  geometry: RawGeometry;
}

const HISTORIC_POI = new Set([
  'monument',
  'memorial',
  'castle',
  'ruins',
  'archaeological_site',
  'building',
  'city_gate',
  'fort',
  'tower',
  'bridge',
  'aqueduct',
]);
const TOURISM_POI = new Set(['artwork', 'museum', 'attraction', 'viewpoint', 'gallery']);
const AMENITY_POI = new Set(['library', 'fountain', 'theatre', 'arts_centre']);

const AMENITY_EXCLUDED = new Set([
  'school',
  'kindergarten',
  'childcare',
  'hospital',
  'clinic',
  'police',
  'prison',
  'fire_station',
  'grave_yard',
]);
const LANDUSE_EXCLUDED = new Set([
  'military',
  'cemetery',
  'construction',
  'railway',
  'reservoir',
  'basin',
]);
const ROADS_EXCLUDED = new Set(['motorway', 'trunk', 'motorway_link', 'trunk_link']);
const HOMES = new Set([
  'house',
  'residential',
  'apartments',
  'detached',
  'semidetached_house',
  'terrace',
]);

/**
 * Where nothing may ever be placed. Points get a small radius; roads and rail get a corridor.
 * Order matters only for the `kind` label: the first matching rule names the zone.
 */
export function classifyExclusion(
  tags: Tags,
  shape: 'point' | 'line' | 'area',
): ExclusionRule | null {
  const pointPad = (m: number) => (shape === 'point' ? m : 0);
  if (tags.amenity && AMENITY_EXCLUDED.has(tags.amenity)) {
    return { kind: tags.amenity, bufferM: pointPad(30) };
  }
  if (tags.military) return { kind: 'military', bufferM: pointPad(50) };
  if (tags.landuse && LANDUSE_EXCLUDED.has(tags.landuse)) {
    return { kind: tags.landuse, bufferM: pointPad(30) };
  }
  if (tags.leisure === 'playground') return { kind: 'playground', bufferM: pointPad(15) };
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.water) {
    return { kind: 'water', bufferM: 0 };
  }
  if (shape === 'line' && tags.highway && ROADS_EXCLUDED.has(tags.highway)) {
    return { kind: 'major_road', bufferM: 25 };
  }
  if (shape === 'line' && tags.railway === 'rail') return { kind: 'railway', bufferM: 15 };
  if (shape === 'area' && tags.building && HOMES.has(tags.building)) {
    return { kind: 'private_home', bufferM: 0 };
  }
  if (shape === 'area' && tags.access === 'private') return { kind: 'private_area', bufferM: 0 };
  return null;
}

/**
 * Public places worth visiting. Places of worship are deliberately never POIs (respect for
 * worshippers; see DECISIONS.md), even when also tagged as attractions.
 */
export function classifyPoi(tags: Tags): PoiRule | null {
  if (!tags.name && tags.tourism !== 'artwork') return null;
  if (
    tags.amenity === 'place_of_worship' ||
    tags.building === 'church' ||
    tags.building === 'mosque'
  ) {
    return null;
  }
  if (tags.access === 'private' || tags.access === 'no') return null;
  if (classifyExclusion(tags, 'area') || classifyExclusion(tags, 'point')) return null;
  if (tags.historic && HISTORIC_POI.has(tags.historic))
    return { kind: tags.historic, biome: 'historic' };
  if (tags.tourism && TOURISM_POI.has(tags.tourism)) {
    return { kind: tags.tourism, biome: tags.tourism === 'viewpoint' ? 'urban' : 'culture' };
  }
  if (tags.leisure === 'park' || tags.leisure === 'garden')
    return { kind: tags.leisure, biome: 'park' };
  if (tags.amenity && AMENITY_POI.has(tags.amenity))
    return { kind: tags.amenity, biome: 'culture' };
  if (tags.place === 'square') return { kind: 'square', biome: 'urban' };
  return null;
}

function isClosed(coords: LatLon[]): boolean {
  if (coords.length < 4) return false;
  const a = coords[0]!;
  const b = coords.at(-1)!;
  return a.lat === b.lat && a.lon === b.lon;
}

function rawGeometry(el: OverpassElement): RawGeometry | null {
  if (el.type === 'node') return { type: 'point', lat: el.lat, lon: el.lon };
  if (el.type === 'way') {
    const coords = el.geometry ?? [];
    if (coords.length < 2) return null;
    return isClosed(coords) ? { type: 'area', lines: [coords] } : { type: 'line', coords };
  }
  const lines = (el.members ?? [])
    .filter((m) => m.type === 'way' && (m.role === 'outer' || m.role === 'inner' || m.role === ''))
    .map((m) => m.geometry ?? [])
    .filter((g) => g.length >= 2);
  return lines.length > 0 ? { type: 'area', lines } : null;
}

const REF_PREFIX = { node: 'n', way: 'w', relation: 'r' } as const;

export interface Classified {
  pois: PoiRecord[];
  exclusions: ExclusionRecord[];
  skipped: number;
}

export function classifyElements(response: OverpassResponse): Classified {
  const pois: PoiRecord[] = [];
  const exclusions: ExclusionRecord[] = [];
  let skipped = 0;
  for (const el of response.elements) {
    const tags = el.tags ?? {};
    const geometry = rawGeometry(el);
    if (!geometry || Object.keys(tags).length === 0) {
      skipped++;
      continue;
    }
    const osmRef = `${REF_PREFIX[el.type]}${el.id}`;
    const ex = classifyExclusion(tags, geometry.type);
    if (ex) {
      exclusions.push({ osmRef, kind: ex.kind, bufferM: ex.bufferM, geometry });
      continue;
    }
    const poi = classifyPoi(tags);
    if (poi) {
      pois.push({
        osmRef,
        kind: poi.kind,
        biome: poi.biome,
        name: (tags.name ?? tags['name:es'] ?? '').slice(0, 120),
        geometry,
        tags: pickTags(tags),
      });
      continue;
    }
    skipped++;
  }
  return { pois, exclusions, skipped };
}

/** Only tags useful to the game are kept; contact details and the like are dropped. */
function pickTags(tags: Tags): Tags {
  const keep = [
    'name',
    'name:es',
    'name:en',
    'historic',
    'tourism',
    'leisure',
    'amenity',
    'artwork_type',
    'wikidata',
  ];
  return Object.fromEntries(Object.entries(tags).filter(([k]) => keep.includes(k)));
}

/** Overpass QL for every tag the classifiers understand, inside a bounding box. */
export function overpassQuery(b: BBox): string {
  const box = `(${b.south},${b.west},${b.north},${b.east})`;
  return [
    '[out:json][timeout:180];',
    '(',
    `  nwr["historic"]${box};`,
    `  nwr["tourism"~"^(artwork|museum|attraction|viewpoint|gallery)$"]${box};`,
    `  nwr["leisure"~"^(park|garden|playground)$"]${box};`,
    `  nwr["amenity"~"^(library|fountain|theatre|arts_centre|school|kindergarten|childcare|hospital|clinic|police|prison|fire_station|grave_yard)$"]${box};`,
    `  nwr["landuse"~"^(military|cemetery|construction|railway|reservoir|basin)$"]${box};`,
    `  nwr["military"]${box};`,
    `  nwr["natural"="water"]${box};`,
    `  nwr["waterway"="riverbank"]${box};`,
    `  way["highway"~"^(motorway|trunk|motorway_link|trunk_link)$"]${box};`,
    `  way["railway"="rail"]${box};`,
    `  way["building"~"^(house|residential|apartments|detached|semidetached_house|terrace)$"]${box};`,
    `  nwr["place"="square"]${box};`,
    ');',
    'out geom;',
  ].join('\n');
}

/** Public Overpass servers, tried in order: the main one is often busy. */
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Fetches the world query for a box, trying each server until one answers. */
export async function fetchOverpass(
  bbox: BBox,
  urls: string[] = OVERPASS_URLS,
  fetchFn: typeof fetch = fetch,
): Promise<OverpassResponse> {
  const errors: string[] = [];
  for (const url of urls) {
    try {
      const res = await fetchFn(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': 'nyrgo-world-import/0.4 (geolocation game; https://nyrgo.fun)',
        },
        body: new URLSearchParams({ data: overpassQuery(bbox) }),
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      return (await res.json()) as OverpassResponse;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${(e as Error).message}`);
    }
  }
  throw new Error(`Overpass unavailable (${errors.join('; ')})`);
}
