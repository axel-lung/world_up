'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';
import { useTranslations } from 'next-intl';
import { type Ref, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Supercluster from 'supercluster';
import type { LatLon } from '@/lib/map/geo';
import { MAP_LAND, type MapTheme, mapStyle } from '@/lib/map/style';
import type { Tileset } from '@/lib/map/tiles';
import type { Rarity } from '@/lib/rarity';
import styles from './MonumentMap.module.css';
import { ClusterFace, PinFace, PositionFace } from './Pin';

export interface MapMonument {
  id: number;
  lat: number;
  lon: number;
  rarity: Rarity;
  /** Lowercase, as on the card. */
  name: string;
  department: string | null;
  owned: boolean;
  /** When the player visited it, on site. */
  visitedAt: Date | null;
}

export interface MapPosition {
  lat: number;
  lon: number;
  /** Metres. */
  accuracy: number;
}

/** What the map shows: west, south, east, north, and its center and zoom. */
export interface MapView {
  bounds: [number, number, number, number];
  center: LatLon;
  zoom: number;
}

export interface MonumentMapHandle {
  fit: (bbox: readonly [number, number, number, number]) => void;
  flyTo: (point: LatLon, zoom?: number) => void;
  zoomBy: (delta: number) => void;
}

export type MapStart = { bbox: readonly [number, number, number, number] } | { center: LatLon; zoom: number };

type Item =
  | { key: string; kind: 'pin'; lat: number; lon: number; monument: MapMonument }
  | { key: string; kind: 'cluster'; lat: number; lon: number; id: number; count: number; owned: number };

/** An item on the map: its button is drawn into its marker's element. */
type Placed = Item & { element: HTMLDivElement };

interface Holder {
  element: HTMLDivElement;
  marker: Marker;
}

// Groups form under 72 px apart (a group's sticker is up to 60 px wide), and
// no longer from zoom 17 on: by then the pins of one street stand apart
const CLUSTER_RADIUS = 72;
const CLUSTER_MAX_ZOOM = 16;
const EARTH_CIRCUMFERENCE_M = 40_075_016.686;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Metres a screen pixel covers at a latitude and zoom (512 px tiles). */
const metresPerPixel = (lat: number, zoom: number) =>
  (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);

/**
 * The monuments on the OpenStreetMap background (MapLibre, src/lib/map/style.ts).
 * Pins closer than CLUSTER_RADIUS gather in a group (supercluster) that a
 * touch zooms into; the pins and groups are buttons in the page, put on the
 * map as MapLibre markers, so the keyboard and screen readers reach them.
 */
export function MonumentMap({
  ref,
  monuments,
  chosen,
  position,
  theme,
  tileset,
  start,
  onChoose,
  onView,
  onReady,
}: {
  ref?: Ref<MonumentMapHandle>;
  /** The monuments shown, filters applied. */
  monuments: MapMonument[];
  chosen: number | null;
  position: MapPosition | null;
  theme: MapTheme;
  tileset: Tileset | null;
  /** Where the map opens. */
  start: MapStart;
  onChoose: (id: number) => void;
  onView: (view: MapView) => void;
  onReady: () => void;
}) {
  const t = useTranslations('Map');
  const tRarity = useTranslations('Rarity');
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<typeof import('maplibre-gl') | null>(null);
  // The markers on the map, by item key: made and removed as the view changes
  const holders = useRef(new Map<string, Holder>());
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<Placed[]>([]);
  // The position's marker, made once (in the browser only: it is drawn once the map is ready)
  const [positionElement] = useState(() =>
    typeof document === 'undefined' ? null : Object.assign(document.createElement('div'), { className: styles.position }),
  );
  const [zoom, setZoom] = useState(0);
  // The latest callbacks and props, for the map's own events
  const latest = useRef({ onView, onReady, theme, tileset });
  useLayoutEffect(() => {
    latest.current = { onView, onReady, theme, tileset };
  });

  const index = useMemo(() => {
    const cluster = new Supercluster<{ i: number; owned: number }, { owned: number }>({
      radius: CLUSTER_RADIUS,
      maxZoom: CLUSTER_MAX_ZOOM,
      map: (props) => ({ owned: props.owned }),
      reduce: (sum, props) => {
        sum.owned += props.owned;
      },
    });
    cluster.load(
      monuments.map((m, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [m.lon, m.lat] },
        properties: { i, owned: m.owned ? 1 : 0 },
      })),
    );
    return cluster;
  }, [monuments]);

  // The pins and groups in view, after each move and when the monuments
  // change: a marker for each, the ones out of view taken off
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib) return;
    const update = () => {
      const b = map.getBounds();
      const features = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.floor(map.getZoom()));
      const placed: Placed[] = [];
      for (const feature of features) {
        const [lon, lat] = feature.geometry.coordinates;
        let item: Item;
        if ('cluster' in feature.properties && feature.properties.cluster) {
          const { cluster_id: id, point_count: count, owned } = feature.properties;
          item = { key: `c${id}`, kind: 'cluster', lat, lon, id, count, owned };
        } else {
          const monument = monuments[(feature.properties as { i: number }).i];
          item = { key: `p${monument.id}`, kind: 'pin', lat, lon, monument };
        }
        let holder = holders.current.get(item.key);
        if (!holder) {
          const element = document.createElement('div');
          element.className = styles.marker;
          // A pin's disc is centered on its point, like a group's
          const marker = new lib.Marker({
            element,
            anchor: item.kind === 'pin' ? 'top-left' : 'center',
            offset: item.kind === 'pin' ? [-23, -22] : [0, 0],
          });
          holder = { element, marker: marker.setLngLat([lon, lat]).addTo(map) };
          holders.current.set(item.key, holder);
        }
        placed.push({ ...item, element: holder.element });
      }
      const shown = new Set(placed.map((item) => item.key));
      for (const [key, holder] of holders.current) {
        if (shown.has(key)) continue;
        holder.marker.remove();
        holders.current.delete(key);
      }
      setItems(placed);
    };
    const frame = requestAnimationFrame(update);
    map.on('moveend', update);
    return () => {
      cancelAnimationFrame(frame);
      map.off('moveend', update);
    };
  }, [ready, index, monuments]);

  // The player's position, ringed by its precision, which follows the zoom
  useEffect(() => {
    const map = mapRef.current;
    const lib = libRef.current;
    if (!ready || !map || !lib || !position || !positionElement) return;
    const marker = new lib.Marker({ element: positionElement, anchor: 'center' }).setLngLat([position.lon, position.lat]).addTo(map);
    const follow = () => setZoom(map.getZoom());
    const frame = requestAnimationFrame(follow);
    map.on('zoom', follow);
    return () => {
      cancelAnimationFrame(frame);
      map.off('zoom', follow);
      marker.remove();
    };
  }, [ready, position, positionElement]);

  // The map, once
  useEffect(() => {
    let cancelled = false;
    const placed = holders.current;
    void import('maplibre-gl').then((lib) => {
      if (cancelled || !container.current) return;
      libRef.current = lib;
      // MapLibre looks for its worker next to its own module, which the
      // bundle moved: the bundler serves the file and gives its address
      lib.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href);
      const { theme: startTheme, tileset: startTiles } = latest.current;
      const map = new lib.Map({
        container: container.current,
        style: mapStyle(startTheme, startTiles, window.location.origin),
        ...('bbox' in start
          ? { bounds: [start.bbox[0], start.bbox[1], start.bbox[2], start.bbox[3]], fitBoundsOptions: { padding: 32 } }
          : { center: [start.center[1], start.center[0]], zoom: start.zoom }),
        minZoom: 2,
        maxZoom: 19,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        locale: { 'Map.Title': t('title') },
      });
      map.touchZoomRotate.disableRotation();
      map.keyboard.disableRotation();
      mapRef.current = map;
      const report = () => {
        const b = map.getBounds();
        const c = map.getCenter();
        latest.current.onView({
          bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          center: [c.lat, c.lng],
          zoom: map.getZoom(),
        });
      };
      map.on('moveend', report);
      map.once('load', () => {
        if (cancelled) return;
        report();
        setReady(true);
        latest.current.onReady();
      });
    });
    return () => {
      cancelled = true;
      for (const holder of placed.values()) holder.marker.remove();
      placed.clear();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The start only matters once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The theme switched (the footer's switch, or the device's)
  useEffect(() => {
    mapRef.current?.setStyle(mapStyle(theme, tileset, window.location.origin));
  }, [theme, tileset]);

  useImperativeHandle(ref, () => ({
    fit: ([west, south, east, north]) =>
      mapRef.current?.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        { padding: 32, duration: reducedMotion() ? 0 : 900 },
      ),
    flyTo: ([lat, lon], zoom) => {
      const map = mapRef.current;
      if (!map) return;
      const options = { center: [lon, lat] as [number, number], zoom: zoom ?? Math.max(map.getZoom(), 15) };
      if (reducedMotion()) map.jumpTo(options);
      else map.flyTo({ ...options, duration: 900 });
    },
    zoomBy: (delta) => {
      const map = mapRef.current;
      if (map) map.zoomTo(map.getZoom() + delta, { duration: reducedMotion() ? 0 : 300 });
    },
  }));

  const zoomInto = (item: Extract<Item, { kind: 'cluster' }>) => {
    const map = mapRef.current;
    if (!map) return;
    const target = Math.min(index.getClusterExpansionZoom(item.id), CLUSTER_MAX_ZOOM + 1);
    const options = { center: [item.lon, item.lat] as [number, number], zoom: target };
    if (reducedMotion()) map.jumpTo(options);
    else map.easeTo({ ...options, duration: 500 });
  };

  return (
    <div className={styles.map} style={{ background: MAP_LAND[theme] }}>
      <div ref={container} className={styles.canvas} />
      {ready &&
        items.map((item) =>
          createPortal(
            item.kind === 'pin' ? (
              <button
                type="button"
                className={styles.target}
                aria-label={t('monument.pin', {
                  name: item.monument.name,
                  rarity: tRarity(item.monument.rarity),
                  state: t(item.monument.owned ? 'monument.inCollection' : 'monument.lacking'),
                  visited: item.monument.visitedAt ? 'yes' : 'no',
                })}
                aria-pressed={chosen === item.monument.id}
                onClick={() => onChoose(item.monument.id)}
              >
                <PinFace
                  rarity={item.monument.rarity}
                  owned={item.monument.owned}
                  visited={Boolean(item.monument.visitedAt)}
                  chosen={chosen === item.monument.id}
                />
              </button>
            ) : (
              <button
                type="button"
                className={styles.target}
                aria-label={t('cluster', { count: item.count, owned: item.owned })}
                onClick={() => zoomInto(item)}
              >
                <ClusterFace count={item.count} owned={item.owned} />
              </button>
            ),
            item.element,
            item.key,
          ),
        )}
      {ready &&
        position &&
        positionElement &&
        createPortal(
          <span role="img" aria-label={t('position')}>
            <PositionFace halo={(2 * position.accuracy) / metresPerPixel(position.lat, zoom || 1)} />
          </span>,
          positionElement,
          'me',
        )}
    </div>
  );
}
