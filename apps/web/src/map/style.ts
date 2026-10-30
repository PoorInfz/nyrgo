import { layers, namedFlavor } from '@protomaps/basemaps';
import type { StyleSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';

export const OSM_ATTRIBUTION =
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';

/** Default glyphs and sprites published by Protomaps; set VITE_MAP_ASSETS_URL to self-host. */
export const DEFAULT_ASSETS_URL = 'https://protomaps.github.io/basemaps-assets';

/** Zoom of the most detailed tiles we publish; MapLibre enlarges them beyond it. */
export const TILES_MAX_ZOOM = 15;

/**
 * Map style. With tiles (a `{z}/{x}/{y}` URL template of our own files, or a PMTiles archive) it
 * draws the Protomaps basemap; without either (fresh dev checkout) it draws a plain background so
 * the game layers still work. A template relative to the app (`/tiles/…`) is made absolute with
 * `origin`, since MapLibre fetches tiles from a worker.
 */
export function buildStyle(opts: {
  tilesUrl?: string | undefined;
  origin?: string | undefined;
  pmtilesUrl?: string | undefined;
  assetsUrl?: string | undefined;
  lang: string;
}): StyleSpecification {
  const background: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#d8f5e6' } }],
  };
  // Without a basemap nothing needs fonts or icons, so no third-party request is made at all.
  if (!opts.tilesUrl && !opts.pmtilesUrl) return background;
  const assets = (opts.assetsUrl ?? DEFAULT_ASSETS_URL).replace(/\/+$/, '');
  return {
    ...background,
    glyphs: `${assets}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${assets}/sprites/v4/dark`,
    sources: {
      protomaps: opts.tilesUrl
        ? {
            type: 'vector',
            // joined by hand: URL() would escape the {z}/{x}/{y} placeholders
            tiles: [
              opts.tilesUrl.startsWith('/')
                ? `${(opts.origin ?? '').replace(/\/+$/, '')}${opts.tilesUrl}`
                : opts.tilesUrl,
            ],
            maxzoom: TILES_MAX_ZOOM,
            attribution: OSM_ATTRIBUTION,
          }
        : {
            type: 'vector',
            url: `pmtiles://${opts.pmtilesUrl}`,
            attribution: OSM_ATTRIBUTION,
          },
    },
    layers: layers('protomaps', namedFlavor('dark'), { lang: opts.lang }),
  };
}

export interface MapPoi {
  id: string;
  name: string | null;
  kind: string;
  biome: string;
  lat: number;
  lng: number;
  distanceM: number;
  inRange: boolean;
}

/** GeoJSON for the POI layer. */
export function poisToGeoJSON(pois: MapPoi[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, name: p.name ?? '', biome: p.biome, inRange: p.inRange },
    })),
  };
}

export const BIOME_COLORS: Record<string, string> = {
  historic: '#fbbf24',
  culture: '#c084fc',
  park: '#4ade80',
  urban: '#60a5fa',
};
