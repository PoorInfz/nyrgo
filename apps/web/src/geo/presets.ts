import type { Waypoint } from './location';

/** Approximate places in central Córdoba for the dev simulator (hand-entered, not survey data). */
export const PLACES: { id: string; name: string; at: Waypoint }[] = [
  { id: 'tendillas', name: 'Plaza de las Tendillas', at: { lat: 37.8847, lng: -4.7792 } },
  { id: 'puente', name: 'Puente Romano', at: { lat: 37.8764, lng: -4.7775 } },
  { id: 'alcazar', name: 'Alcázar', at: { lat: 37.8769, lng: -4.7831 } },
  { id: 'corredera', name: 'Plaza de la Corredera', at: { lat: 37.8833, lng: -4.7738 } },
  { id: 'victoria', name: 'Jardines de la Victoria', at: { lat: 37.8843, lng: -4.7862 } },
];

/** Walk from Las Tendillas down to the river and across the Roman bridge. */
export const ROUTES: { id: string; name: string; points: Waypoint[] }[] = [
  {
    id: 'centro-rio',
    name: 'Tendillas → Puente Romano',
    points: [
      { lat: 37.8847, lng: -4.7792 },
      { lat: 37.8822, lng: -4.7788 },
      { lat: 37.8795, lng: -4.779 },
      { lat: 37.8778, lng: -4.7781 },
      { lat: 37.8764, lng: -4.7775 },
      { lat: 37.8749, lng: -4.7768 },
    ],
  },
  {
    id: 'judería',
    name: 'Victoria → Alcázar',
    points: [
      { lat: 37.8843, lng: -4.7862 },
      { lat: 37.881, lng: -4.7838 },
      { lat: 37.8789, lng: -4.7834 },
      { lat: 37.8769, lng: -4.7831 },
    ],
  },
];

export const SPEEDS_KMH = [
  { id: 'walk', kmh: 5 },
  { id: 'bike', kmh: 15 },
  { id: 'car', kmh: 50 },
] as const;
