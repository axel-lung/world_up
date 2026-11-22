import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Tileset } from './tiles';

// The map's background in the Organic palette, both themes (Claude Design,
// "Carte - Monuments", 2c). The layers follow the OpenMapTiles schema of the
// archive (map/README.md). No place name is in terracotta: that color is the
// game objects'.

export type MapTheme = 'light' | 'dark';

const PALETTE = {
  land: ['#f5ead8', '#24211e'],
  residential: ['#efe2cb', '#2a2722'],
  landcover: ['#e3e6c6', '#2b3125'],
  park: ['#d6e2bb', '#323b27'],
  water: ['#bcd5cf', '#1d3133'],
  waterway: ['#a4c4bd', '#29474a'],
  building: ['#ecdec6', '#322d26'],
  buildingOutline: ['#dccaa8', '#3d372e'],
  minor: ['#fbf4e8', '#37322a'],
  mid: ['#fffaf2', '#423c32'],
  major: ['#ffe6d3', '#5a3d28'],
  motorway: ['#f9cfae', '#74482a'],
  casing: ['#e0c9a6', '#1a1816'],
  path: ['#d3bf9e', '#4d463b'],
  rail: ['#bcaa8c', '#5c5446'],
  boundary: ['#bba684', '#6b6252'],
  city: ['#201e1d', '#f5ead8'],
  quarter: ['#645c50', '#c0b6a5'],
  street: ['#645c50', '#c0b6a5'],
  waterName: ['#3f6660', '#9cc2bb'],
  halo: ['#f5ead8', '#201e1d'],
} as const;

/** The ground under the map, the same as the style's background: shown while it loads. */
export const MAP_LAND: Record<MapTheme, string> = { light: PALETTE.land[0], dark: PALETTE.land[1] };

const SOURCE = 'omt';
const width = (low: number, high: number): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  12,
  low,
  18,
  high,
];
const classes = (...values: string[]): ExpressionSpecification => ['match', ['get', 'class'], values, true, false];
const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const;

// A layer of the vector source, without what layer() adds (distributed over the union of layer types)
type SourceLayer = Exclude<LayerSpecification, { type: 'background' }>;
type LayerBody = SourceLayer extends infer L ? (L extends SourceLayer ? Omit<L, 'id' | 'source' | 'source-layer'> : never) : never;

/** The MapLibre style; without tiles, the ground alone (the pins still show). */
export function mapStyle(theme: MapTheme, tileset: Tileset | null, origin: string): StyleSpecification {
  const c = Object.fromEntries(Object.entries(PALETTE).map(([key, pair]) => [key, pair[theme === 'light' ? 0 : 1]])) as Record<
    keyof typeof PALETTE,
    string
  >;
  const background: LayerSpecification = { id: 'land', type: 'background', paint: { 'background-color': c.land } };
  if (!tileset) return { version: 8, sources: {}, layers: [background] };

  const layer = (id: string, sourceLayer: string, body: LayerBody) =>
    ({ id, source: SOURCE, 'source-layer': sourceLayer, ...body }) as LayerSpecification;
  const label = (color: string, halo = 1.4) => ({ 'text-color': color, 'text-halo-color': c.halo, 'text-halo-width': halo });

  return {
    version: 8,
    glyphs: `${origin}/map/fonts/{fontstack}/{range}.pbf`,
    sources: {
      [SOURCE]: {
        type: 'vector',
        tiles: [`${origin}/map/tiles/${tileset.name}/{z}/{x}/{y}.pbf`],
        minzoom: tileset.minZoom,
        maxzoom: tileset.maxZoom,
        bounds: tileset.bounds,
        attribution: '© OpenStreetMap',
      },
    },
    layers: [
      background,
      layer('residential', 'landuse', {
        type: 'fill',
        filter: classes('residential', 'suburb', 'neighbourhood'),
        paint: { 'fill-color': c.residential },
      }),
      layer('landcover', 'landcover', {
        type: 'fill',
        filter: classes('wood', 'grass', 'farmland'),
        paint: { 'fill-color': c.landcover },
      }),
      layer('park', 'park', { type: 'fill', paint: { 'fill-color': c.park } }),
      layer('landuse-green', 'landuse', {
        type: 'fill',
        filter: classes('cemetery', 'pitch', 'stadium'),
        paint: { 'fill-color': c.park },
      }),
      layer('water', 'water', { type: 'fill', paint: { 'fill-color': c.water } }),
      layer('waterway', 'waterway', { type: 'line', paint: { 'line-color': c.waterway, 'line-width': width(1, 4) } }),
      layer('building', 'building', {
        type: 'fill',
        minzoom: 13,
        paint: { 'fill-color': c.building, 'fill-outline-color': c.buildingOutline },
      }),
      layer('path', 'transportation', {
        type: 'line',
        minzoom: 14,
        filter: classes('path', 'track'),
        paint: { 'line-color': c.path, 'line-width': width(0.6, 1.6), 'line-dasharray': [2, 1.5] },
      }),
      layer('rail', 'transportation', {
        type: 'line',
        filter: classes('rail', 'transit'),
        paint: { 'line-color': c.rail, 'line-width': width(0.8, 2), 'line-dasharray': [3, 2] },
      }),
      layer('road-casing', 'transportation', {
        type: 'line',
        filter: classes('motorway', 'trunk', 'primary', 'secondary', 'tertiary'),
        layout: ROUND,
        paint: { 'line-color': c.casing, 'line-width': width(3, 26) },
      }),
      layer('road-minor', 'transportation', {
        type: 'line',
        filter: classes('minor', 'service'),
        layout: ROUND,
        paint: { 'line-color': c.minor, 'line-width': width(1, 12) },
      }),
      layer('road-mid', 'transportation', {
        type: 'line',
        filter: classes('secondary', 'tertiary'),
        layout: ROUND,
        paint: { 'line-color': c.mid, 'line-width': width(2, 22) },
      }),
      layer('road-major', 'transportation', {
        type: 'line',
        filter: classes('primary', 'trunk'),
        layout: ROUND,
        paint: { 'line-color': c.major, 'line-width': width(2.2, 24) },
      }),
      layer('road-motorway', 'transportation', {
        type: 'line',
        filter: classes('motorway'),
        layout: ROUND,
        paint: { 'line-color': c.motorway, 'line-width': width(2.4, 24) },
      }),
      layer('boundary', 'boundary', {
        type: 'line',
        filter: ['<=', ['get', 'admin_level'], 6],
        paint: { 'line-color': c.boundary, 'line-width': 1.2, 'line-dasharray': [3, 2] },
      }),
      layer('water-name', 'water_name', {
        type: 'symbol',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 13,
          'symbol-placement': 'line',
          'text-letter-spacing': 0.1,
        },
        paint: label(c.waterName),
      }),
      layer('waterway-name', 'waterway', {
        type: 'symbol',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Italic'],
          'text-size': 13,
          'symbol-placement': 'line',
          'text-letter-spacing': 0.1,
        },
        paint: label(c.waterName),
      }),
      layer('road-name', 'transportation_name', {
        type: 'symbol',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11.5,
          'symbol-placement': 'line',
        },
        paint: label(c.street),
      }),
      layer('place-quarter', 'place', {
        type: 'symbol',
        filter: classes('suburb', 'quarter', 'neighbourhood'),
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 12,
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-max-width': 7,
        },
        paint: label(c.quarter, 1.6),
      }),
      layer('place-city', 'place', {
        type: 'symbol',
        maxzoom: 13,
        filter: classes('city', 'town', 'village'),
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 16 },
        paint: label(c.city, 1.8),
      }),
    ],
  };
}
