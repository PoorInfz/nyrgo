import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LocationFix } from '../geo/location';
import { BIOME_COLORS, OSM_ATTRIBUTION, buildStyle, poisToGeoJSON, type MapPoi } from './style';

const PLAYER_ZOOM = 16;

/**
 * The interactive map. MapLibre needs WebGL, so it is loaded lazily and only in the browser;
 * the list of nearby places beside it is the accessible equivalent.
 */
export default function MapView({
  fix,
  pois,
  lang,
  label,
}: {
  fix: LocationFix | null;
  pois: MapPoi[];
  lang: string;
  label: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const centred = useRef(false);

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
      const protocol = new Protocol();
      maplibregl.addProtocol('pmtiles', protocol.tile);
      const created = new maplibregl.Map({
        container: container.current,
        style: buildStyle({
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
    return () => {
      cancelled = true;
      instance?.remove();
      map.current = null;
    };
  }, [lang]);

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

  return <div ref={container} className="map" role="img" aria-label={label} />;
}
