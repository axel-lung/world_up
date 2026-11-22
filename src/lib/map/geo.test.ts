import { describe, expect, it } from 'vitest';
import { departmentName, departmentShape, FRANCE } from './departments';
import { distanceMetres, inBounds, progressStep, rarityAt, roundedDistance } from './geo';
import { mapStyle } from './style';

describe('distances', () => {
  it('measures along the ground', () => {
    // Notre-Dame to the Sainte-Chapelle, about 450 m
    expect(distanceMetres([48.853, 2.3499], [48.8554, 2.345])).toBeCloseTo(447, 0);
    // Paris to Marseille, about 660 km as the crow flies
    expect(distanceMetres([48.8566, 2.3522], [43.2965, 5.3698]) / 1000).toBeCloseTo(661, -1);
    expect(distanceMetres([45, 5], [45, 5])).toBe(0);
  });

  it('shows metres to the ten, then kilometres to one decimal', () => {
    expect(roundedDistance(344)).toEqual({ value: 340, unit: 'm' });
    expect(roundedDistance(996)).toEqual({ value: 1, unit: 'km' });
    expect(roundedDistance(1234)).toEqual({ value: 1.2, unit: 'km' });
  });

  it('tells a point inside a box', () => {
    expect(inBounds([48.85, 2.35], [2.2, 48.8, 2.5, 48.9])).toBe(true);
    expect(inBounds([48.95, 2.35], [2.2, 48.8, 2.5, 48.9])).toBe(false);
  });
});

describe('the legend', () => {
  it('fills a department by the share owned', () => {
    expect([0, 1, 19, 20, 39, 40, 69, 70, 99, 100].map((owned) => progressStep(owned, 100))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    expect(progressStep(0, 0)).toBe(0);
  });

  it('reads the rarity by its index, rarest first', () => {
    expect(rarityAt(0)).toBe('legendary');
    expect(rarityAt(5)).toBe('common');
  });
});

describe('the departments', () => {
  it('draws the 96 metropolitan ones and the 5 overseas', () => {
    expect(FRANCE.metro.departments).toHaveLength(96);
    expect(FRANCE.overseas.map((d) => d.code)).toEqual(['971', '972', '973', '974', '976']);
    expect(departmentShape('2A')?.name).toBe('Corse-du-Sud');
  });

  it('names the overseas collectivities, which have no shape', () => {
    expect(departmentName('21')).toBe("Côte-d'Or");
    expect(departmentName('987')).toBe('Polynésie française');
    expect(departmentName('99')).toBeNull();
    expect(departmentName(null)).toBeNull();
  });
});

describe('the map style', () => {
  const tileset = { name: 'france-2026-11-22', minZoom: 0, maxZoom: 14, bounds: [-5.2, 41.3, 9.6, 51.1] as [number, number, number, number] };

  it('draws the tiles served by the game, in the theme asked', () => {
    const light = mapStyle('light', tileset, 'https://worldup.example');
    expect(light.sources.omt).toMatchObject({
      type: 'vector',
      tiles: ['https://worldup.example/map/tiles/france-2026-11-22/{z}/{x}/{y}.pbf'],
      maxzoom: 14,
    });
    expect(light.glyphs).toBe('https://worldup.example/map/fonts/{fontstack}/{range}.pbf');
    const background = (style: ReturnType<typeof mapStyle>) => style.layers.find((layer) => layer.id === 'land');
    expect(background(light)).toMatchObject({ paint: { 'background-color': '#f5ead8' } });
    expect(background(mapStyle('dark', tileset, 'https://worldup.example'))).toMatchObject({
      paint: { 'background-color': '#24211e' },
    });
  });

  it('keeps the ground alone without tiles', () => {
    const style = mapStyle('light', null, 'https://worldup.example');
    expect(style.sources).toEqual({});
    expect(style.layers.map((layer) => layer.id)).toEqual(['land']);
  });
});
