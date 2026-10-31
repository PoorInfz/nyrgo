import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Map as MlMap, GeoJSONSource, Marker } from 'maplibre-gl';
import { DEFAULT_AVATAR, type AvatarLook, type Rarity } from '@nyrgo/shared';
import { RARITY_FX } from '../starter/rarity';
import { Avatar } from '../avatar/Avatar';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LocationFix } from '../geo/location';
import { BIOME_COLORS, OSM_ATTRIBUTION, buildStyle, poisToGeoJSON, type MapPoi } from './style';

const PLAYER_ZOOM = 16;
/** Moves shorter than this are GPS jitter: the explorer stands still. */
const STEP_M = 1.5;
/** How long the explorer keeps walking after the last real move. */
const WALK_HOLD_MS = 3500;
/** The explorer glides to each new fix over this long instead of jumping. */
const GLIDE_MS = 1200;

const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180));
  return Math.hypot((b.lat - a.lat) * 111_195, (b.lng - a.lng) * 111_195 * k);
};

export interface MapCreature {
  id: string;
  creatureId: string;
  /** Sets the colour of the aura around the figure. */
  rarity?: Rarity | undefined;
  lat: number;
  lng: number;
  inRange: boolean;
  /** Creatures placed by an event stand out on the map. */
  eventId?: string | null;
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
  look = DEFAULT_AVATAR,
}: {
  fix: LocationFix | null;
  /** The player's explorer, drawn where they stand. */
  look?: AvatarLook;
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
  const me = useRef<{ marker: Marker; root: Root; at: { lat: number; lng: number } } | null>(null);
  const [walking, setWalking] = useState(false);
  const [facing, setFacing] = useState<'left' | 'right'>('right');
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
        // the player is their explorer, an HTML marker standing on its feet at the fix
        const el = document.createElement('div');
        el.className = 'player-marker';
        el.setAttribute('aria-hidden', 'true');
        const root = createRoot(el);
        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' });
        me.current = { marker, root, at: { lat: 0, lng: 0 } };
        map.current = m;
        setReady(true);
      });
    })();
    const live = markers.current;
    return () => {
      cancelled = true;
      for (const m of live.values()) m.remove();
      live.clear();
      const mine = me.current;
      me.current = null;
      if (mine) {
        mine.marker.remove();
        // unmount after this render pass
        queueMicrotask(() => mine.root.unmount());
      }
      instance?.remove();
      map.current = null;
    };
  }, [lang]);

  // Creatures are HTML markers showing the creature itself; the list below the map is the
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
        // the creature itself, wandering on the spot in its idle animation, over an aura in its
        // rarity's colours
        const el = document.createElement('button');
        el.type = 'button';
        el.tabIndex = -1;
        el.setAttribute('aria-hidden', 'true');
        el.className = 'creature-marker';
        // each one wanders out of step with the others
        el.style.setProperty('--delay', `-${(Math.random() * 6).toFixed(2)}s`);
        const aura = document.createElement('span');
        aura.className = 'cm-aura';
        const shadow = document.createElement('span');
        shadow.className = 'cm-shadow';
        const walk = document.createElement('span');
        walk.className = 'cm-walk';
        const sprite = document.createElement('span');
        sprite.className = 'cm-sprite';
        sprite.style.backgroundImage = `url(/sprites/${c.creatureId}-idle.webp)`;
        walk.append(sprite);
        el.append(aura, shadow, walk);
        el.addEventListener('click', () => tap.current?.(c.id));
        marker = new ml.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([c.lng, c.lat])
          .addTo(m);
        markers.current.set(c.id, marker);
      }
      const el = marker.getElement();
      // the rarity may arrive after the marker (the Dex loads once)
      const rarity = c.rarity ?? 'common';
      const fx = RARITY_FX[rarity];
      // classList, not className: MapLibre keeps its own classes on the element
      for (const k of [...el.classList]) if (k.startsWith('rar-')) el.classList.remove(k);
      el.classList.add(`rar-${rarity}`);
      el.style.setProperty('--aura', fx.colors[0]!);
      el.style.setProperty('--aura2', fx.colors[1] ?? fx.colors[0]!);
      marker.getElement().dataset.inRange = String(c.inRange);
      marker.getElement().dataset.event = String(Boolean(c.eventId));
    }
  }, [ready, creatures]);

  useEffect(() => {
    if (!ready || !map.current) return;
    (map.current.getSource('pois') as GeoJSONSource | undefined)?.setData(poisToGeoJSON(pois));
  }, [ready, pois]);

  // Draw the explorer whenever its look, gait or direction changes.
  useEffect(() => {
    me.current?.root.render(<Avatar look={look} walking={walking} facing={facing} size={52} />);
  }, [ready, look, walking, facing]);

  // Walk to each new fix: glide there, legs moving, facing the way it goes.
  useEffect(() => {
    if (!ready || !map.current || !fix || !me.current) return;
    const p = me.current;
    const from = p.at;
    const to = { lat: fix.lat, lng: fix.lng };
    if (from.lat === 0 && from.lng === 0) {
      p.marker.setLngLat([to.lng, to.lat]).addTo(map.current);
      p.at = to;
      return;
    }
    if (metresBetween(from, to) < STEP_M) {
      // standing still (or GPS jitter): stop walking a moment later
      const t = window.setTimeout(() => setWalking(false), WALK_HOLD_MS);
      return () => window.clearTimeout(t);
    }
    if (to.lng !== from.lng) setFacing(to.lng < from.lng ? 'left' : 'right');
    setWalking(true);
    const still = window.setTimeout(() => setWalking(false), WALK_HOLD_MS);
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / GLIDE_MS);
      const lat = from.lat + (to.lat - from.lat) * k;
      const lng = from.lng + (to.lng - from.lng) * k;
      p.marker.setLngLat([lng, lat]);
      p.at = { lat, lng };
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(still);
    };
  }, [ready, fix]);

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
