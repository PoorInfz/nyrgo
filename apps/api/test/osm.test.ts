import { describe, expect, it } from 'vitest';
import {
  CORDOBA_BBOX,
  classifyElements,
  classifyExclusion,
  classifyPoi,
  overpassQuery,
} from '../src/modules/world/osm.js';
import { SAMPLE } from './fixtures/overpass-sample.js';

describe('classifyPoi', () => {
  it('accepts named public landmarks with a biome', () => {
    expect(classifyPoi({ historic: 'castle', name: 'Alcázar' })).toEqual({
      kind: 'castle',
      biome: 'historic',
    });
    expect(classifyPoi({ leisure: 'garden', name: 'Jardín' })).toEqual({
      kind: 'garden',
      biome: 'park',
    });
    expect(classifyPoi({ tourism: 'museum', name: 'Museo' })).toEqual({
      kind: 'museum',
      biome: 'culture',
    });
    expect(classifyPoi({ place: 'square', name: 'Plaza' })).toEqual({
      kind: 'square',
      biome: 'urban',
    });
  });

  it('accepts unnamed artworks but no other unnamed places', () => {
    expect(classifyPoi({ tourism: 'artwork' })).not.toBeNull();
    expect(classifyPoi({ historic: 'monument' })).toBeNull();
  });

  it('never makes places of worship, private places or sensitive sites into POIs', () => {
    expect(
      classifyPoi({ amenity: 'place_of_worship', tourism: 'attraction', name: 'X' }),
    ).toBeNull();
    expect(classifyPoi({ building: 'church', historic: 'building', name: 'X' })).toBeNull();
    expect(classifyPoi({ leisure: 'garden', access: 'private', name: 'X' })).toBeNull();
    expect(classifyPoi({ amenity: 'school', historic: 'building', name: 'X' })).toBeNull();
  });
});

describe('classifyExclusion', () => {
  it('covers children, health, security and dangerous ground', () => {
    for (const amenity of ['school', 'kindergarten', 'hospital', 'police', 'prison']) {
      expect(classifyExclusion({ amenity }, 'area')?.kind).toBe(amenity);
    }
    expect(classifyExclusion({ leisure: 'playground' }, 'area')?.kind).toBe('playground');
    expect(classifyExclusion({ landuse: 'military' }, 'area')?.kind).toBe('military');
    expect(classifyExclusion({ natural: 'water' }, 'area')?.kind).toBe('water');
  });

  it('pads points and turns roads and rail into corridors', () => {
    expect(classifyExclusion({ amenity: 'school' }, 'point')).toEqual({
      kind: 'school',
      bufferM: 30,
    });
    expect(classifyExclusion({ amenity: 'school' }, 'area')).toEqual({
      kind: 'school',
      bufferM: 0,
    });
    expect(classifyExclusion({ highway: 'motorway' }, 'line')).toEqual({
      kind: 'major_road',
      bufferM: 25,
    });
    expect(classifyExclusion({ railway: 'rail' }, 'line')).toEqual({
      kind: 'railway',
      bufferM: 15,
    });
    expect(classifyExclusion({ highway: 'residential' }, 'line')).toBeNull();
  });

  it('excludes private homes but not other buildings', () => {
    expect(classifyExclusion({ building: 'house' }, 'area')?.kind).toBe('private_home');
    expect(classifyExclusion({ building: 'apartments' }, 'area')?.kind).toBe('private_home');
    expect(classifyExclusion({ building: 'yes' }, 'area')).toBeNull();
  });
});

describe('classifyElements', () => {
  const out = classifyElements(SAMPLE);

  it('splits the sample into POIs, exclusions and skipped elements', () => {
    expect(out.pois.map((p) => p.osmRef).sort()).toEqual(['n1', 'n6', 'w1', 'w2', 'w3']);
    expect(out.exclusions.map((z) => [z.osmRef, z.kind]).sort()).toEqual([
      ['n9', 'playground'],
      ['r4', 'water'],
      ['w5', 'school'],
      ['w7', 'major_road'],
      ['w8', 'private_home'],
    ]);
    expect(out.skipped).toBe(3);
  });

  it('keeps refs unique across element types', () => {
    const refs = [...out.pois, ...out.exclusions].map((x) => x.osmRef);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('keeps only game-relevant tags', () => {
    const square = out.pois.find((p) => p.osmRef === 'n1')!;
    expect(square.tags).toEqual({ name: 'Plaza de Prueba' });
  });

  it('reads multipolygon relations as areas', () => {
    const river = out.exclusions.find((z) => z.osmRef === 'r4')!;
    expect(river.geometry.type).toBe('area');
  });
});

describe('overpassQuery', () => {
  it('asks for geometry inside the Córdoba box', () => {
    const q = overpassQuery(CORDOBA_BBOX);
    expect(q).toContain('out geom;');
    expect(q).toContain('(37.85,-4.85,37.92,-4.72)');
    expect(q).toContain('amenity"~"^(library|fountain|theatre|arts_centre|school');
  });
});
