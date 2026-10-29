import type { OverpassResponse } from '../../src/modules/world/osm.js';

/**
 * Synthetic Overpass `out geom` response laid out around central Córdoba for tests.
 * Shapes are invented (not OpenStreetMap data); only the format matches Overpass.
 */
export const SAMPLE: OverpassResponse = {
  elements: [
    // POI node: a square
    {
      type: 'node',
      id: 1,
      lat: 37.8847,
      lon: -4.7792,
      tags: { place: 'square', name: 'Plaza de Prueba', phone: '+34 000' },
    },
    // POI way: a closed park polygon
    {
      type: 'way',
      id: 2,
      tags: { leisure: 'park', name: 'Parque de Prueba' },
      geometry: [
        { lat: 37.884, lon: -4.787 },
        { lat: 37.884, lon: -4.7855 },
        { lat: 37.885, lon: -4.7855 },
        { lat: 37.885, lon: -4.787 },
        { lat: 37.884, lon: -4.787 },
      ],
    },
    // POI way: a bridge (open line) crossing the river relation below
    {
      type: 'way',
      id: 3,
      tags: { historic: 'bridge', name: 'Puente de Prueba' },
      geometry: [
        { lat: 37.8772, lon: -4.7778 },
        { lat: 37.8756, lon: -4.7772 },
      ],
    },
    // Exclusion relation: river as a multipolygon (outer ring only)
    {
      type: 'relation',
      id: 4,
      tags: { type: 'multipolygon', natural: 'water', name: 'Río de Prueba' },
      members: [
        {
          type: 'way',
          role: 'outer',
          geometry: [
            { lat: 37.876, lon: -4.79 },
            { lat: 37.876, lon: -4.765 },
            { lat: 37.8768, lon: -4.765 },
            { lat: 37.8768, lon: -4.79 },
            { lat: 37.876, lon: -4.79 },
          ],
        },
      ],
    },
    // Exclusion way: a school polygon
    {
      type: 'way',
      id: 5,
      tags: { amenity: 'school', name: 'Colegio de Prueba' },
      geometry: [
        { lat: 37.886, lon: -4.78 },
        { lat: 37.886, lon: -4.779 },
        { lat: 37.8866, lon: -4.779 },
        { lat: 37.8866, lon: -4.78 },
        { lat: 37.886, lon: -4.78 },
      ],
    },
    // POI node that sits inside the school: must never be shown
    {
      type: 'node',
      id: 6,
      lat: 37.8863,
      lon: -4.7795,
      tags: { tourism: 'artwork', name: 'Mural del patio' },
    },
    // Exclusion line: motorway (buffered into a corridor)
    {
      type: 'way',
      id: 7,
      tags: { highway: 'motorway' },
      geometry: [
        { lat: 37.89, lon: -4.8 },
        { lat: 37.89, lon: -4.76 },
      ],
    },
    // Exclusion area: a private home
    {
      type: 'way',
      id: 8,
      tags: { building: 'house' },
      geometry: [
        { lat: 37.883, lon: -4.774 },
        { lat: 37.883, lon: -4.7738 },
        { lat: 37.8832, lon: -4.7738 },
        { lat: 37.8832, lon: -4.774 },
        { lat: 37.883, lon: -4.774 },
      ],
    },
    // Exclusion node: a playground mapped as a point
    { type: 'node', id: 9, lat: 37.8845, lon: -4.7862, tags: { leisure: 'playground' } },
    // Skipped: place of worship, even though it is also an attraction
    {
      type: 'node',
      id: 10,
      lat: 37.879,
      lon: -4.7794,
      tags: { amenity: 'place_of_worship', tourism: 'attraction', name: 'Templo de Prueba' },
    },
    // Skipped: unnamed monument
    { type: 'node', id: 11, lat: 37.88, lon: -4.78, tags: { historic: 'monument' } },
    // Skipped: no tags at all
    { type: 'node', id: 12, lat: 37.88, lon: -4.7801 },
    // POI way sharing a numeric id with node 1: refs must not collide
    {
      type: 'way',
      id: 1,
      tags: { tourism: 'museum', name: 'Museo de Prueba' },
      geometry: [
        { lat: 37.878, lon: -4.7712 },
        { lat: 37.878, lon: -4.7706 },
        { lat: 37.8786, lon: -4.7706 },
        { lat: 37.8786, lon: -4.7712 },
        { lat: 37.878, lon: -4.7712 },
      ],
    },
  ],
};
