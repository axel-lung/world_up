'use client';

import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Layers,
  List,
  LoaderCircle,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Minus,
  Navigation,
  Plus,
  Route,
  SlidersHorizontal,
  WifiOff,
  X,
  ZoomIn,
} from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { displayName } from '@/components/card/card-format';
import { RarityPips } from '@/components/rarity/Rarity';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { departmentName, departmentShape } from '@/lib/map/departments';
import { distanceMetres, inBounds, type LatLon, rarityAt, roundedDistance } from '@/lib/map/geo';
import type { DepartmentProgress, MonumentDetails, MonumentRow } from '@/lib/map/monuments';
import type { MapTheme } from '@/lib/map/style';
import type { Tileset } from '@/lib/map/tiles';
import { RARITIES, type Rarity } from '@/lib/rarity';
import { FranceMap, OverseasInsets, type Progress, ProgressLegend } from './FranceMap';
import styles from './MapExplorer.module.css';
import { type MapMonument, type MapPosition, type MapStart, type MapView, MonumentMap, type MonumentMapHandle } from './MonumentMap';
import { PinFace } from './Pin';

type View = 'france' | 'map' | 'list';
type Choice = { kind: 'department'; code: string } | { kind: 'monument'; id: number } | null;

// Metropolitan France, Corsica included: where the map opens by default
const METROPOLE: [number, number, number, number] = [-5.2, 41.3, 9.6, 51.1];
// A monument opened from its card's page, or the player found, at street level
const STREET_ZOOM = 16;
const AROUND_ZOOM = 15;
// The list shows the nearest ones; zooming in brings the others
const LIST_MAX = 100;
// The history entry an open sheet adds, so that Back closes it
const MARK = 'worldupMapSheet';

export interface MapExplorerProps {
  paths: { collection: string; monuments: string };
  totals: { owned: number; all: number };
  departments: DepartmentProgress[];
  owned: number[];
  tileset: Tileset | null;
  /** A card opened from its page ("Voir sur la carte"). */
  focus: { id: number; lat: number; lon: number } | null;
  /** A department opened from the address (?dept=21). */
  department: string | null;
}

/** The theme the page is drawn in: the forced one (data-theme), else the device's. */
function useResolvedTheme(): MapTheme {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', onChange);
      return () => {
        observer.disconnect();
        media.removeEventListener('change', onChange);
      };
    },
    () => {
      const forced = document.documentElement.dataset.theme;
      if (forced === 'light' || forced === 'dark') return forced;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },
    () => 'light',
  );
}

function useOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('online', onChange);
      window.addEventListener('offline', onChange);
      return () => {
        window.removeEventListener('online', onChange);
        window.removeEventListener('offline', onChange);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

/**
 * The phone's maps app on its way to a point: Android's geo: address (the
 * app passes it on too), Apple Plans on an iPhone, OpenStreetMap elsewhere.
 */
function directionsUrl([lat, lon]: LatLon, name: string): string {
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(agent)) return `geo:0,0?q=${lat},${lon}(${encodeURIComponent(name)})`;
  if (/iPhone|iPad|iPod/i.test(agent)) return `https://maps.apple.com/?daddr=${lat},${lon}`;
  return `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lon}`;
}

/**
 * The "Carte" page (Claude Design, "Carte - Monuments"): France by department,
 * then the monuments as pins once zoomed in, with their filters and list. On
 * a phone the map fills the screen under its head, the sheets rise from the
 * bottom without a shade (the department or pin touched stays in view) and
 * "Liste" swaps the map for the monuments of its area. From 720 px the
 * filters, the sheet and the list stand in a panel on the left.
 */
export function MapExplorer({ paths, totals, departments, owned, tileset, focus, department }: MapExplorerProps) {
  const t = useTranslations('Map');
  const tRarity = useTranslations('Rarity');
  const theme = useResolvedTheme();
  const online = useOnline();
  const mapRef = useRef<MonumentMapHandle>(null);
  const explorerRef = useRef<HTMLDivElement>(null);

  // The page fills the screen under what stands above it (the site's header
  // from 720 px, an announcement): its height is the screen's less that
  useLayoutEffect(() => {
    const explorer = explorerRef.current;
    if (!explorer) return;
    const measure = () => {
      const top = explorer.getBoundingClientRect().top + window.scrollY;
      explorer.style.setProperty('--map-top', `${Math.max(0, Math.round(top))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  const [view, setView] = useState<View>(focus ? 'map' : 'france');
  const [choice, setChoice] = useState<Choice>(
    focus ? { kind: 'monument', id: focus.id } : department ? { kind: 'department', code: department } : null,
  );
  // The map is made the first time it is shown, then kept
  const [mapStart, setMapStart] = useState<MapStart | null>(
    focus ? { center: [focus.lat, focus.lon], zoom: STREET_ZOOM } : null,
  );
  const [mapReady, setMapReady] = useState(false);
  const [mapView, setMapView] = useState<MapView | null>(null);
  // The department the map was zoomed on, named in the head
  const [zone, setZone] = useState<string | null>(null);

  const [rows, setRows] = useState<MonumentRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [details, setDetails] = useState<ReadonlyMap<number, MonumentDetails>>(new Map());

  const [rarities, setRarities] = useState<ReadonlySet<Rarity>>(new Set(RARITIES));
  const [missingOnly, setMissingOnly] = useState(false);

  const [position, setPosition] = useState<MapPosition | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const ownedIds = useMemo(() => new Set(owned), [owned]);
  const progress = useMemo(
    () => new Map<string, Progress & { region: string | null }>(departments.map((d) => [d.code, d])),
    [departments],
  );

  // The monuments, once per version of the list (the browser keeps it)
  const load = useCallback(() => {
    fetch(paths.monuments)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<{ monuments: MonumentRow[] }>;
      })
      .then((data) => {
        setRows(data.monuments);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, [paths.monuments]);
  useEffect(() => {
    load();
  }, [load]);

  const monuments = useMemo<MapMonument[]>(
    () =>
      (rows ?? []).map(([id, lat, lon, rarity, name, departmentCode]) => ({
        id,
        lat,
        lon,
        rarity: rarityAt(rarity),
        name: displayName(name),
        department: departmentCode,
        owned: ownedIds.has(id),
      })),
    [rows, ownedIds],
  );
  const byId = useMemo(() => new Map(monuments.map((m) => [m.id, m])), [monuments]);
  const shown = useMemo(
    () => monuments.filter((m) => rarities.has(m.rarity) && (!missingOnly || !m.owned)),
    [monuments, rarities, missingOnly],
  );

  // The monuments in the map's area, nearest first: from the player when
  // their position is known, else from the map's center
  const inArea = useMemo(() => {
    if (!mapView) return [];
    const origin: LatLon = position ? [position.lat, position.lon] : mapView.center;
    return shown
      .filter((m) => inBounds([m.lat, m.lon], mapView.bounds))
      .map((m) => ({ monument: m, distance: distanceMetres(origin, [m.lat, m.lon]) }))
      .sort((a, b) => a.distance - b.distance);
  }, [shown, mapView, position]);

  const distanceText = (metres: number) => {
    const { value, unit } = roundedDistance(metres);
    return unit === 'm' ? t('metres', { value }) : t('kilometres', { value });
  };

  // A sheet adds a history entry, so that Back (the phone's too) closes it
  const sheetOpen = choice !== null;
  useEffect(() => {
    if (!sheetOpen) return;
    if (!window.history.state?.[MARK]) window.history.pushState({ ...window.history.state, [MARK]: true }, '');
    const onPopState = () => {
      if (!window.history.state?.[MARK]) setChoice(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sheetOpen]);
  const closeSheet = () => {
    if (window.history.state?.[MARK]) window.history.back();
    else setChoice(null);
  };

  // An owned monument's sheet shows its card: its thumbnail and page
  const chosenMonument = choice?.kind === 'monument' ? (byId.get(choice.id) ?? null) : null;
  useEffect(() => {
    if (!chosenMonument || details.has(chosenMonument.id)) return;
    let live = true;
    fetch(`${paths.monuments.split('?')[0]}/${chosenMonument.id}`)
      .then((response) => (response.ok ? (response.json() as Promise<MonumentDetails>) : null))
      .then((found) => {
        if (live && found) setDetails((known) => new Map(known).set(chosenMonument.id, found));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [chosenMonument, details, paths.monuments]);

  const showMap = (start: MapStart) => {
    if (mapStart === null) setMapStart(start);
    else if ('bbox' in start) mapRef.current?.fit(start.bbox);
    else mapRef.current?.flyTo(start.center, start.zoom);
    setView('map');
  };

  const zoomOnDepartment = (code: string) => {
    const shape = departmentShape(code);
    setZone(departmentName(code));
    setChoice(null);
    showMap({ bbox: shape?.bbox ?? METROPOLE });
  };

  const backToFrance = () => {
    setChoice(null);
    setZone(null);
    setView('france');
  };

  const chooseMonument = (id: number, fly: boolean) => {
    setChoice({ kind: 'monument', id });
    const monument = byId.get(id);
    if (fly && monument) mapRef.current?.flyTo([monument.lat, monument.lon]);
  };

  const aroundMe = () => {
    if (!('geolocation' in navigator)) {
      setNotice(t('locationUnavailable'));
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (found) => {
        const here: MapPosition = { lat: found.coords.latitude, lon: found.coords.longitude, accuracy: found.coords.accuracy };
        setPosition(here);
        setLocating(false);
        showMap({ center: [here.lat, here.lon], zoom: AROUND_ZOOM });
      },
      (error) => {
        setLocating(false);
        setNotice(t(error.code === error.PERMISSION_DENIED ? 'locationDenied' : 'locationUnavailable'));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const filtersOn = (rarities.size < RARITIES.length ? 1 : 0) + (missingOnly ? 1 : 0);
  const clearFilters = () => {
    setRarities(new Set(RARITIES));
    setMissingOnly(false);
  };
  const toggleRarity = (rarity: Rarity) =>
    setRarities((current) => {
      const next = new Set(current);
      if (next.has(rarity)) next.delete(rarity);
      else next.add(rarity);
      return next;
    });

  const subtitle =
    view === 'france' ? (
      <span className={styles.subtitle}>{t('owned', { owned: totals.owned, total: totals.all })}</span>
    ) : (
      <span className={styles.subtitle}>
        <button type="button" className={styles.crumb} onClick={backToFrance}>
          {t('france')}
        </button>
        <ChevronRight aria-hidden className={styles.crumbArrow} />
        <span className={styles.zone}>{t('zone', { name: zone ?? t('thisZone'), count: inArea.length })}</span>
      </span>
    );

  const filters = (
    <div className={styles.chips} role="group" aria-label={t('filters')}>
      <Sheet
        title={t('filters')}
        trigger={{
          className: styles.chip,
          label: filtersOn ? `${t('filters')}, ${t('activeFilters', { count: filtersOn })}` : undefined,
          content: (
            <>
              <SlidersHorizontal aria-hidden />
              {t('filters')}
              {filtersOn > 0 && (
                <span className={styles.count} aria-hidden="true">
                  {filtersOn}
                </span>
              )}
            </>
          ),
        }}
      >
        <div className={styles.filterHead}>
          <h3 className={styles.filterLabel}>{t('rarity')}</h3>
          <button type="button" className={styles.clear} onClick={clearFilters}>
            {t('clearFilters')}
          </button>
        </div>
        <ul className={styles.rarities}>
          {RARITIES.map((rarity) => (
            <li key={rarity}>
              <button
                type="button"
                role="checkbox"
                aria-checked={rarities.has(rarity)}
                className={styles.rarity}
                data-rarity={rarity}
                onClick={() => toggleRarity(rarity)}
              >
                <span className={styles.box} aria-hidden="true">
                  {rarities.has(rarity) && <Check />}
                </span>
                <span className={styles.swatch} aria-hidden="true" />
                <span className={styles.rarityText}>
                  {tRarity(rarity)}
                  <RarityPips rarity={rarity} size={5} tone="line" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className={styles.filterLabel}>{t('show')}</h3>
        <div className={styles.switches}>
          <button
            type="button"
            role="switch"
            aria-checked={missingOnly}
            className={styles.switchRow}
            onClick={() => setMissingOnly((on) => !on)}
          >
            <span className={styles.switchText}>
              <span className={styles.switchLabel}>{t('missing')}</span>
              <span className={styles.switchMeta}>{t('missingMeta')}</span>
            </span>
            <span className={styles.switch} aria-hidden="true">
              <span>{missingOnly && <Check />}</span>
            </span>
          </button>
        </div>
        <Button variant="sticker" size="large" block data-sheet-close>
          {t('results', { count: mapView ? inArea.length : shown.length })}
        </Button>
      </Sheet>
      <button
        type="button"
        className={styles.chip}
        aria-pressed={missingOnly}
        onClick={() => setMissingOnly((on) => !on)}
      >
        {missingOnly ? <Check aria-hidden /> : <CircleDashed aria-hidden />}
        {t('missing')}
      </button>
    </div>
  );

  const departmentSheet = choice?.kind === 'department' && (
    <DepartmentPanel
      code={choice.code}
      progress={progress.get(choice.code)}
      cardsHref={`${paths.collection}?tab=all&dept=${encodeURIComponent(choice.code)}`}
      onZoom={() => zoomOnDepartment(choice.code)}
      onClose={closeSheet}
    />
  );

  const monumentSheet = chosenMonument && (
    <MonumentPanel
      monument={chosenMonument}
      details={details.get(chosenMonument.id) ?? null}
      distance={position ? distanceText(distanceMetres([position.lat, position.lon], [chosenMonument.lat, chosenMonument.lon])) : null}
      onClose={closeSheet}
    />
  );

  const list = (
    <section className={styles.list} aria-labelledby="map-list-title">
      <div className={styles.listHead}>
        <h2 id="map-list-title">{t('listTitle', { count: inArea.length })}</h2>
        <span className={styles.listSub}>{position ? t('listFromYou') : t('listFromCenter')}</span>
      </div>
      {inArea.length === 0 ? (
        <p className={styles.listEmpty}>{rows ? t('listEmpty') : t('loading')}</p>
      ) : (
        <ul className={styles.rows}>
          {inArea.slice(0, LIST_MAX).map(({ monument, distance }) => (
            <li key={monument.id}>
              <button
                type="button"
                className={styles.row}
                aria-pressed={chosenMonument?.id === monument.id}
                onClick={() => chooseMonument(monument.id, view === 'map')}
              >
                <PinFace rarity={monument.rarity} owned={monument.owned} size="row" />
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{monument.name}</span>
                  <span className={styles.rowMeta}>
                    {[tRarity(monument.rarity), departmentName(monument.department)].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {position && <span className={styles.rowDistance}>{distanceText(distance)}</span>}
                <ChevronRight aria-hidden className={styles.chevron} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {inArea.length > LIST_MAX && <p className={styles.listSub}>{t('listCapped', { shown: LIST_MAX })}</p>}
    </section>
  );

  const loading = view !== 'france' && (!mapReady || (!rows && !loadError));

  return (
    <div ref={explorerRef} className={styles.explorer} data-view={view} data-sheet={choice?.kind}>
      <aside className={styles.side}>
        <header className={styles.head}>
          <Link href={paths.collection} className={`${styles.round} phone-only`} aria-label={t('back')}>
            <ChevronLeft aria-hidden />
          </Link>
          <div className={styles.titles}>
            <h1>{t('title')}</h1>
            {subtitle}
          </div>
          {view !== 'france' && (
            <button
              type="button"
              className={`${styles.listToggle} phone-only`}
              aria-label={view === 'list' ? t('showMapLabel') : t('showListLabel')}
              onClick={() => setView(view === 'list' ? 'map' : 'list')}
            >
              {view === 'list' ? <MapIcon aria-hidden /> : <List aria-hidden />}
              {view === 'list' ? t('showMap') : t('showList')}
            </button>
          )}
        </header>

        {view !== 'france' && filters}

        {(departmentSheet || monumentSheet) && (
          <div className={styles.sheet} role="dialog" aria-modal="false" aria-label={t(departmentSheet ? 'department.label' : 'monument.label')}>
            <span className={`${styles.handle} phone-only`} aria-hidden="true" />
            {departmentSheet || monumentSheet}
          </div>
        )}

        {view !== 'france' && list}
        {view === 'france' && (
          <div className="wide-only">
            <ProgressLegend />
          </div>
        )}
      </aside>

      <div className={styles.stage}>
        {view === 'france' && (
          <div className={styles.france}>
            <div className={styles.metro}>
              <FranceMap
                progress={progress}
                chosen={choice?.kind === 'department' ? choice.code : null}
                onChoose={(code) => setChoice({ kind: 'department', code })}
              />
            </div>
            <OverseasInsets
              progress={progress}
              chosen={choice?.kind === 'department' ? choice.code : null}
              onChoose={(code) => setChoice({ kind: 'department', code })}
            />
            <div className="phone-only">
              <ProgressLegend />
            </div>
          </div>
        )}

        {mapStart && (
          <div className={styles.mapLayer} hidden={view === 'france'} data-offline={!online || undefined}>
            <MonumentMap
              ref={mapRef}
              monuments={shown}
              chosen={chosenMonument?.id ?? null}
              position={position}
              theme={theme}
              tileset={tileset}
              start={mapStart}
              onChoose={(id) => chooseMonument(id, false)}
              onView={setMapView}
              onReady={() => setMapReady(true)}
            />
            <div className={`${styles.zoom} wide-only`}>
              <button type="button" aria-label={t('zoomIn')} onClick={() => mapRef.current?.zoomBy(1)}>
                <Plus aria-hidden />
              </button>
              <button type="button" aria-label={t('zoomOut')} onClick={() => mapRef.current?.zoomBy(-1)}>
                <Minus aria-hidden />
              </button>
            </div>
            <button type="button" className={styles.aroundMe} aria-pressed={Boolean(position)} onClick={aroundMe} disabled={locating}>
              {locating ? <LoaderCircle aria-hidden className={styles.spin} /> : <LocateFixed aria-hidden />}
              {t('aroundMe')}
            </button>
            <p className={styles.attribution}>
              <a href="https://openmaptiles.org/" target="_blank" rel="noopener">
                © OpenMapTiles
              </a>{' '}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">
                © OpenStreetMap
              </a>
            </p>
          </div>
        )}

        {loading && (
          <div className={styles.loading}>
            <p role="status">
              <LoaderCircle aria-hidden className={styles.spin} />
              {t('loading')}
            </p>
          </div>
        )}

        {view !== 'france' && (!online || loadError) && (
          <div className={styles.banner} role="status">
            <span className={styles.bannerIcon} aria-hidden="true">
              <WifiOff />
            </span>
            <span className={styles.bannerText}>
              <strong>{online ? t('loadError') : t('offline')}</strong>
              {!online && <span>{t('offlineText')}</span>}
            </span>
            <button type="button" className={styles.bannerAction} onClick={load}>
              {t('retry')}
            </button>
          </div>
        )}

        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
      </div>
    </div>
  );
}

function CloseButton({ onClose, floating = false }: { onClose: () => void; floating?: boolean }) {
  const t = useTranslations('Map');
  return (
    <button type="button" className={styles.close} data-floating={floating || undefined} aria-label={t('close')} onClick={onClose}>
      <X aria-hidden />
    </button>
  );
}

/** A department's sheet: the player's progress there, its cards, and zooming on it. */
function DepartmentPanel({ code, progress, cardsHref, onZoom, onClose }: {
  code: string;
  progress: (Progress & { region: string | null }) | undefined;
  cardsHref: string;
  onZoom: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('Map');
  const format = useFormatter();
  const owned = progress?.owned ?? 0;
  const total = progress?.total ?? 0;
  const part = total ? owned / total : 0;
  return (
    <>
      <div className={styles.sheetHead}>
        <div className={styles.sheetTitles}>
          <h2>{departmentName(code) ?? code}</h2>
          <span className={styles.muted}>{progress?.region ? t('department.place', { region: progress.region, code }) : code}</span>
        </div>
        <CloseButton onClose={onClose} />
      </div>
      <div className={styles.score}>
        <p className={styles.scoreLine}>
          <span className={styles.scoreOwned}>{format.number(owned)}</span>
          <span className={styles.scoreTotal}>/ {format.number(total)}</span>
          <span className={styles.scorePart}>{format.number(part, { style: 'percent', maximumFractionDigits: 0 })}</span>
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={t('department.progress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(part * 100)}
        >
          <span style={{ width: `${owned ? Math.max(2, part * 100) : 0}%` }} />
        </div>
        <span className={styles.muted}>{t('department.cardsHere')}</span>
      </div>
      <div className={styles.actions}>
        <ButtonLink href={cardsHref} icon={<Layers aria-hidden />}>
          {t('department.seeCards')}
        </ButtonLink>
        <Button variant="sticker" icon={<ZoomIn aria-hidden />} onClick={onZoom}>
          {t('department.zoom')}
        </Button>
      </div>
    </>
  );
}

/**
 * A monument's sheet: owned, its card's thumbnail and page; lacking, no photo
 * and how to get it. Either way its rarity, place, distance and directions.
 */
function MonumentPanel({ monument, details, distance, onClose }: {
  monument: MapMonument;
  details: MonumentDetails | null;
  distance: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Map');
  const tRarity = useTranslations('Rarity');
  const place = departmentName(monument.department);
  const card = details?.owned ? details : null;
  return (
    <>
      <div className={styles.monumentHead}>
        {monument.owned ? (
          <span className={styles.thumb} data-rarity={monument.rarity}>
            <span className={`washed ${styles.thumbPhoto}`}>
              <MapPin aria-hidden />
              {card?.image && (
                // Plain <img>, like the cards: the import made the 400 px WebP file
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.image} alt="" loading="lazy" decoding="async" />
              )}
            </span>
            <span className={styles.thumbName}>{monument.name}</span>
            <RarityPips rarity={monument.rarity} size={4} />
          </span>
        ) : (
          <span className={styles.thumbMissing} aria-hidden="true">
            <span>?</span>
          </span>
        )}
        <div className={styles.monumentText}>
          <span className={styles.sticker} data-rarity={monument.rarity} data-owned={monument.owned || undefined}>
            {tRarity(monument.rarity)}
            <RarityPips rarity={monument.rarity} size={5} tone={monument.owned ? 'ink' : 'line'} />
          </span>
          <h2>{monument.name}</h2>
          {place && (
            <span className={styles.meta}>
              <MapPin aria-hidden />
              {place}
            </span>
          )}
          {distance && (
            <span className={styles.distance}>
              <Navigation aria-hidden />
              {t('monument.distance', { distance })}
            </span>
          )}
        </div>
        <CloseButton onClose={onClose} floating />
      </div>
      {!monument.owned && <p className={styles.lacking}>{t('monument.lackingText')}</p>}
      <div className={styles.actions} data-single={!card || undefined}>
        <ButtonLink
          href={directionsUrl([monument.lat, monument.lon], monument.name)}
          target="_blank"
          rel="noopener"
          prefetch={false}
          icon={<Route aria-hidden />}
        >
          {t('monument.directions')}
          <ArrowUpRight aria-hidden className={styles.external} />
        </ButtonLink>
        {card && (
          <ButtonLink href={card.href} icon={<Layers aria-hidden />}>
            {t('monument.seeCard')}
          </ButtonLink>
        )}
      </div>
    </>
  );
}
