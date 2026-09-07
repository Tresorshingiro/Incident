import { useEffect, useRef, useState } from 'react';
import { RWANDA_CENTER, RWANDA_ZOOM } from '../config/layers';
import { BASEMAPS, DEFAULT_BASEMAP, type BasemapId } from '../config/basemaps';
import type { Pt, SavedIncident, Severity } from '../types';

type Props = {
  /** The committed incident location. */
  point: Pt | null;
  /** A search result being previewed, drawn more subtly than the pin. */
  highlight: Pt | null;
  /** Incidents saved this session. */
  incidents: SavedIncident[];
  /** Incident being hovered in the rail — drawn emphasised. */
  hoveredId: string | null;
  busy: boolean;
  /** Sector / cell for the status bar, once resolved. */
  place: string | null;
  onPick: (point: Pt) => void;
};

const ACCENT: [number, number, number] = [42, 95, 216];

const INCIDENT_SYMBOL = {
  type: 'simple-marker' as const,
  style: 'circle' as const,
  size: 12,
  color: [...ACCENT, 1],
  outline: { color: [255, 255, 255, 1], width: 2 },
};

/** Soft halo so the eye finds the pin immediately on any basemap. */
const HALO_OUTER = {
  type: 'simple-marker' as const,
  style: 'circle' as const,
  size: 46,
  color: [...ACCENT, 0.1],
  outline: { color: [0, 0, 0, 0], width: 0 },
};

const HALO_INNER = {
  type: 'simple-marker' as const,
  style: 'circle' as const,
  size: 26,
  color: [...ACCENT, 0.16],
  outline: { color: [...ACCENT, 0.35], width: 1 },
};

const HIGHLIGHT_SYMBOL = {
  type: 'simple-marker' as const,
  style: 'diamond' as const,
  size: 12,
  color: [168, 98, 10, 0.95],
  outline: { color: [255, 255, 255, 0.95], width: 1.5 },
};

const SEVERITY_RGB: Record<Severity, [number, number, number]> = {
  low: [139, 147, 161],
  medium: [35, 83, 159],
  high: [168, 98, 10],
  critical: [173, 19, 58],
};

const savedSymbol = (severity: Severity, emphasised: boolean) => ({
  type: 'simple-marker' as const,
  style: 'circle' as const,
  size: emphasised ? 14 : 9,
  color: [...SEVERITY_RGB[severity], 0.95],
  outline: { color: [255, 255, 255, 0.95], width: emphasised ? 2.5 : 1.5 },
});

/**
 * Build a Basemap from keyless tile services and swap it onto the map.
 * The SDK's named basemaps require an ArcGIS Online key, which this app
 * deliberately does not have — see src/config/basemaps.ts.
 */
async function applyBasemap(map: __esri.Map, id: BasemapId) {
  const config = BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
  const [{ default: Basemap }, { default: TileLayer }, { default: OpenStreetMapLayer }] =
    await Promise.all([
      import('@arcgis/core/Basemap'),
      import('@arcgis/core/layers/TileLayer'),
      import('@arcgis/core/layers/OpenStreetMapLayer'),
    ]);

  const baseLayers = config.tiles.map((tile) =>
    tile.kind === 'osm' ? new OpenStreetMapLayer() : new TileLayer({ url: tile.url }),
  );

  // Do not set `id` here: the SDK treats a well-known id ("streets", "topo")
  // as a portal basemap to resolve, which needs an ArcGIS Online key.
  const basemap = new Basemap({ baseLayers, title: config.label });
  await basemap.loadAll();
  map.basemap = basemap;
}

/** Web Mercator or geographic map point -> our normalised WGS84 Pt. */
function toPt(mapPoint: __esri.Point | null | undefined): Pt | null {
  if (!mapPoint) return null;
  const { longitude, latitude } = mapPoint;
  if (longitude == null || latitude == null) return null;
  return {
    x: Number(longitude.toFixed(6)),
    y: Number(latitude.toFixed(6)),
    spatialReference: { wkid: 4326 },
  };
}

/**
 * MapView with a draggable incident marker.
 *
 * The marker is never local state: it is redrawn from the `point` prop, so the
 * map and the form's latitude/longitude fields cannot drift apart.
 */
export default function IncidentMap({
  point, highlight, incidents, hoveredId, busy, place, onPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<__esri.MapView | null>(null);
  const layerRef = useRef<__esri.GraphicsLayer | null>(null);
  const mapRef = useRef<__esri.Map | null>(null);
  const graphicCtor = useRef<typeof __esri.Graphic | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP);
  const [cursor, setCursor] = useState<Pt | null>(null);

  useEffect(() => {
    let destroyed = false;

    (async () => {
      try {
        const [{ default: Map }, { default: MapView }, { default: GraphicsLayer }, { default: Graphic }] =
          await Promise.all([
            import('@arcgis/core/Map'),
            import('@arcgis/core/views/MapView'),
            import('@arcgis/core/layers/GraphicsLayer'),
            import('@arcgis/core/Graphic'),
          ]);

        if (destroyed || !containerRef.current) return;

        graphicCtor.current = Graphic;
        const layer = new GraphicsLayer({ id: 'incident-marker' });
        layerRef.current = layer;

        const map = new Map({ layers: [layer] });
        mapRef.current = map;
        await applyBasemap(map, DEFAULT_BASEMAP);

        const view = new MapView({
          container: containerRef.current,
          map,
          center: [RWANDA_CENTER.longitude, RWANDA_CENTER.latitude],
          zoom: RWANDA_ZOOM,
          // Snap to the basemap's tile LODs; between-LOD scales resample and
          // read as a blurry map.
          constraints: { minZoom: 7 },
          ui: { components: [] },
          popupEnabled: false,
        });
        viewRef.current = view;

        await view.when();
        if (destroyed) return;
        setReady(true);

        view.on('click', (event) => {
          const picked = toPt(event.mapPoint);
          if (picked) onPickRef.current(picked);
        });

        view.on('pointer-move', (event) => {
          setCursor(toPt(view.toMap({ x: event.x, y: event.y })));
        });

        // Drag the marker: take over the pointer only when the drag started on
        // the existing graphic, otherwise let the map pan normally.
        let dragging = false;
        view.on('drag', (event) => {
          if (event.action === 'start') {
            const existing = layer.graphics.find((g) => g.attributes?.role === 'incident');
            const screenPin = existing && view.toScreen(existing.geometry as __esri.Point);
            if (screenPin) {
              dragging = Math.hypot(screenPin.x - event.x, screenPin.y - event.y) <= 22;
            }
            if (dragging) event.stopPropagation();
            return;
          }

          if (!dragging) return;
          event.stopPropagation();

          const mapPoint = view.toMap({ x: event.x, y: event.y });
          if (!mapPoint) return;

          if (event.action === 'end') {
            dragging = false;
            const dropped = toPt(mapPoint);
            if (dropped) onPickRef.current(dropped);
          } else {
            layer.removeAll();
            const G = graphicCtor.current!;
            layer.addMany([
              new G({ geometry: mapPoint, symbol: HALO_OUTER }),
              new G({ geometry: mapPoint, symbol: HALO_INNER }),
              new G({ geometry: mapPoint, symbol: INCIDENT_SYMBOL, attributes: { role: 'incident' } }),
            ]);
          }
        });
      } catch (e) {
        if (!destroyed) setError((e as Error).message);
      }
    })();

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, []);

  // Redraw every graphic whenever the inputs change.
  useEffect(() => {
    const layer = layerRef.current;
    const G = graphicCtor.current;
    if (!layer || !G || !ready) return;

    layer.removeAll();

    for (const incident of incidents) {
      layer.add(
        new G({
          geometry: { type: 'point', longitude: incident.point.x, latitude: incident.point.y } as never,
          symbol: savedSymbol(incident.severity, incident.id === hoveredId),
        }),
      );
    }

    if (highlight) {
      layer.add(
        new G({
          geometry: { type: 'point', longitude: highlight.x, latitude: highlight.y } as never,
          symbol: HIGHLIGHT_SYMBOL,
        }),
      );
    }

    if (point) {
      const geometry = { type: 'point', longitude: point.x, latitude: point.y } as never;
      layer.addMany([
        new G({ geometry, symbol: HALO_OUTER }),
        new G({ geometry, symbol: HALO_INNER }),
        new G({ geometry, symbol: INCIDENT_SYMBOL, attributes: { role: 'incident' } }),
      ]);
    }
  }, [point, highlight, incidents, hoveredId, ready]);

  // Keep the active location in view without yanking the camera around.
  useEffect(() => {
    const view = viewRef.current;
    const target = highlight ?? point;
    if (!view || !ready || !target) return;

    const inView = view.extent?.contains({
      type: 'point', longitude: target.x, latitude: target.y,
      spatialReference: { wkid: 4326 },
    } as never);

    if (!inView) {
      view
        .goTo({ center: [target.x, target.y], zoom: Math.max(view.zoom, 14) },
          { duration: 550, easing: 'ease-in-out' })
        .catch(() => {
          // Superseded by another animation — harmless.
        });
    }
  }, [point, highlight, ready]);

  function nudgeZoom(delta: number) {
    const view = viewRef.current;
    if (!view) return;
    view.goTo({ zoom: view.zoom + delta }, { duration: 220 }).catch(() => {});
  }

  function recentre() {
    const view = viewRef.current;
    if (!view) return;
    view
      .goTo({ center: [RWANDA_CENTER.longitude, RWANDA_CENTER.latitude], zoom: RWANDA_ZOOM },
        { duration: 500, easing: 'ease-in-out' })
      .catch(() => {});
  }

  const readout = point ?? cursor;

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2">
          <span className="flex items-center gap-2 text-[12px] text-ink-muted">
            <Spinner />Loading map
          </span>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 grid place-items-center bg-surface-2 p-6">
          <div className="max-w-sm rounded-xl p-3.5 text-[12px] leading-relaxed text-ink-secondary hair">
            <div className="mb-1 text-ink-danger">Map failed to load</div>
            {error}
          </div>
        </div>
      )}

      {ready && !error && (
        <>
          {/* Basemap toggles — compact text, top right. */}
          <div className="map-chrome absolute right-3 top-[60px] z-20 flex overflow-hidden rounded-lg sm:right-4 sm:top-4">
            {BASEMAPS.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setBasemapId(b.id);
                  if (mapRef.current) void applyBasemap(mapRef.current, b.id);
                }}
                className={[
                  'cursor-pointer px-2.5 py-1.5 text-[11px] transition',
                  i > 0 ? 'hair-l' : '',
                  basemapId === b.id
                    ? 'bg-fill-selected text-ink-accent'
                    : 'text-ink-muted hover:bg-fill-hover hover:text-ink-secondary',
                ].join(' ')}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Zoom / recentre. */}
          <div className="map-chrome absolute right-4 top-[68px] z-20 hidden flex-col overflow-hidden rounded-lg sm:flex">
            <MapButton label="Zoom in" onClick={() => nudgeZoom(1)}>
              <path d="M12 5v14M5 12h14" />
            </MapButton>
            <span className="hair-t" />
            <MapButton label="Zoom out" onClick={() => nudgeZoom(-1)}>
              <path d="M5 12h14" />
            </MapButton>
            <span className="hair-t" />
            <MapButton label="Recentre on Rwanda" onClick={recentre}>
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </MapButton>
          </div>

          {/* Status bar, bottom left. */}
          <div className="map-chrome absolute bottom-[46px] left-0 z-20 flex h-6 items-center gap-3 rounded-tr-lg border-b-0 border-l-0 px-2.5 lg:bottom-0">
            <span className="mono text-[10.5px] text-ink-secondary">
              {readout ? `${readout.y.toFixed(4)}, ${readout.x.toFixed(4)}` : '—, —'}
            </span>
            {place && (
              <>
                <span className="h-2.5 w-px bg-line" />
                <span className="hidden max-w-[240px] truncate text-[10.5px] text-ink-muted sm:inline">{place}</span>
              </>
            )}
            {busy && (
              <>
                <span className="h-2.5 w-px bg-line" />
                <span className="flex items-center gap-1.5 text-[10.5px] text-ink-muted">
                  <Spinner />resolving
                </span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MapButton({
  label, onClick, children,
}: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 cursor-pointer place-items-center text-ink-secondary transition hover:bg-fill-hover hover:text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

export function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
      aria-hidden
    />
  );
}
