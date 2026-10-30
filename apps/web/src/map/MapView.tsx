import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, GeoJSONSource, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LocationFix } from '../geo/location';
import { BIOME_COLORS, OSM_ATTRIBUTION, buildStyle, poisToGeoJSON, type MapPoi } from './style';

const PLAYER_ZOOM = 16;

export interface MapCreature {
  id: string;
  creatureId: string;
  lat: number;
  lng: number;
  inRange: boolean;
}

/**
 * The interactive map. MapLibre needs WebGL, so it is loaded lazily and only in the browser;
 * the list of nearby places beside it is the accessible equivalent.
 */
export default function MapView({
  fix,
  pois,
  creatures = [],
  onCreature,
  lang,
  label,
}: {
  fix: LocationFix | null;
  pois: MapPoi[];
  creatures?: MapCreature[];
  /** Tapping a creature on the map; the list beside the map does the same for keyboards. */
  onCreature?: (id: string) => void;
  lang: string;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const centred = useRef(false);
  const lib = useRef<typeof import('maplibre-gl') | null>(null);
  const markers = useRef(new Map<string, Marker>());
  const tap = useRef(onCreature);
  useEffect(() => {
    tap.current = onCreature;
  }, [onCreature]);

  useEffect(() => {
    let cancelled = false;
    let instance: MlMap | null = null;
    void (async () => {
      const [maplibregl, { Protocol }, { default: workerUrl }] = await Promise.all([
        import('maplibre-gl'),
        import('pmtiles'),
        // MapLibre builds its worker URL at runtime, which bundlers cannot see; hand it over.
        import('maplibre-gl/dist/maplibre-gl-worker.mjs?url'),
      ]);
      if (cancelled || !container.current) return;
      maplibregl.setWorkerUrl(workerUrl);
      lib.current = maplibregl;
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
      const created = new maplibregl.Map({
        container: container.current,
        style: buildStyle({
          tilesUrl: import.meta.env.VITE_TILES_URL,
          origin: window.location.origin,
          pmtilesUrl: import.meta.env.VITE_PMTILES_URL,
          assetsUrl: import.meta.env.VITE_MAP_ASSETS_URL,
          lang,
        }),
        center: [-4.7792, 37.8847],
        zoom: 15,
        attributionControl: { compact: true },
      });
      instance = created;
      created.on('load', () => {
        const m = created;
        // POIs are OSM-derived, so they carry the attribution even without a basemap.
        m.addSource('pois', {
          type: 'geojson',
          data: poisToGeoJSON([]),
          attribution: OSM_ATTRIBUTION,
        });
        m.addLayer({
          id: 'pois',
          type: 'circle',
          source: 'pois',
          paint: {
            'circle-radius': ['case', ['get', 'inRange'], 11, 8],
            'circle-color': [
              'match',
              ['get', 'biome'],
              ...Object.entries(BIOME_COLORS).flat(),
              '#94a3b8',
            ] as never,
            'circle-stroke-color': '#0f1720',
            'circle-stroke-width': 2,
          },
        });
        m.addSource('player', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        m.addLayer({
          id: 'player-accuracy',
          type: 'circle',
          source: 'player',
          paint: { 'circle-radius': 18, 'circle-color': '#5eead4', 'circle-opacity': 0.15 },
        });
        m.addLayer({
          id: 'player',
          type: 'circle',
          source: 'player',
          paint: {
            'circle-radius': 7,
            'circle-color': '#5eead4',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        });
        map.current = m;
        setReady(true);
      });
    })();
    const live = markers.current;
    return () => {
      cancelled = true;
      for (const m of live.values()) m.remove();
      live.clear();
      instance?.remove();
      map.current = null;
    };
  }, [lang]);

  // Creatures are HTML markers showing their portrait; the list below the map is the
  // accessible way to reach them, so markers stay out of the tab order.
  useEffect(() => {
    const m = map.current;
    const ml = lib.current;
    if (!ready || !m || !ml) return;
    const keep = new Set(creatures.map((c) => c.id));
    for (const [id, marker] of markers.current) {
      if (!keep.has(id)) {
        marker.remove();
        markers.current.delete(id);
      }
    }
    for (const c of creatures) {
      let marker = markers.current.get(c.id);
      if (!marker) {
        const el = document.createElement('button');
        el.type = 'button';
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
        el.className = 'creature-marker';
        const img = document.createElement('img');
        img.src = `/creatures/${c.creatureId}-thumb.webp`;
        img.alt = '';
        el.append(img);
        el.addEventListener('click', () => tap.current?.(c.id));
        marker = new ml.Marker({ element: el }).setLngLat([c.lng, c.lat]).addTo(m);
        markers.current.set(c.id, marker);
      }
      marker.getElement().dataset.inRange = String(c.inRange);
    }
  }, [ready, creatures]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('pois') as GeoJSONSource | undefined)?.setData(poisToGeoJSON(pois));
  }, [ready, pois]);

  useEffect(() => {
    if (!ready || !map.current || !fix) return;
    (map.current.getSource('player') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'Point', coordinates: [fix.lng, fix.lat] },
        },
      ],
    });
    if (!centred.current) {
      map.current.jumpTo({ center: [fix.lng, fix.lat], zoom: PLAYER_ZOOM });
      centred.current = true;
    } else {
      map.current.easeTo({ center: [fix.lng, fix.lat], duration: 600 });
    }
  }, [ready, fix]);

  // A region, not an image: the map holds controls and creature markers. The lists beside it
  // are the accessible equivalent of what it shows.
  return <div ref={container} className="map" role="region" aria-label={label} />;
}
