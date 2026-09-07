import { ADMIN_LAYERS, ADMIN_LEVELS } from '../config/layers';
import type { AdminHierarchy, AdminLevel, Pt } from '../types';

type Names = Partial<Record<AdminLevel, string | null>>;

const EMPTY: Record<AdminLevel, string | null> = {
  province: null, district: null, sector: null, cell: null, village: null,
};

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

type QueryFn = (...a: unknown[]) => Promise<unknown>;
type PointCtor = new (p: { x: number; y: number; spatialReference: { wkid: number } }) => unknown;

/**
 * Lazy so the SDK stays out of the initial bundle, but memoised so the four
 * parallel fallback queries share one import rather than racing four.
 */
let queryFn: Promise<QueryFn> | null = null;
let pointCtor: Promise<PointCtor> | null = null;

function executeQuery(): Promise<QueryFn> {
  queryFn ??= import('@arcgis/core/rest/query').then((mod) => {
    const m = mod as unknown as { executeQueryJSON?: QueryFn; default?: { executeQueryJSON: QueryFn } };
    const fn = m.executeQueryJSON ?? m.default?.executeQueryJSON;
    if (!fn) throw new Error('executeQueryJSON not available');
    return fn;
  });
  return queryFn;
}

function esriPointCtor(): Promise<PointCtor> {
  pointCtor ??= import('@arcgis/core/geometry/Point').then(
    (m) => m.default as unknown as PointCtor,
  );
  return pointCtor;
}

async function esriPoint(point: Pt) {
  const Point = await esriPointCtor();
  return new Point({ x: point.x, y: point.y, spatialReference: { wkid: 4326 } });
}

/** Tests only. */
export function resetAdminLookupModules(): void {
  queryFn = null;
  pointCtor = null;
}

/**
 * Query one boundary layer for the polygon containing `point`.
 * Returns the level names that layer carries, or null if nothing intersects.
 * Throws only on a genuine request failure — the caller records that.
 */
async function queryLevel(
  level: AdminLevel,
  point: Pt,
  signal?: AbortSignal,
): Promise<Names | null> {
  const cfg = ADMIN_LAYERS[level];
  const [run, geometry] = await Promise.all([executeQuery(), esriPoint(point)]);

  const result = (await run(
    cfg.url,
    {
      geometry,
      geometryType: 'esriGeometryPoint',
      spatialRelationship: 'intersects',
      returnGeometry: false,
      outFields: cfg.outFields,
      where: '1=1',
      num: 1,
    },
    signal ? { signal } : undefined,
  )) as { features?: Array<{ attributes?: Record<string, unknown> }> };

  const features = result?.features ?? [];

  // A query whose geometry filter failed to apply comes back with the whole
  // layer. Refusing that is what stops a silent wrong answer — we saw this
  // return Rubavu for a point in Kigali.
  if (features.length !== 1) return null;

  const attributes = features[0]?.attributes;
  if (!attributes) return null;

  const names: Names = {};
  for (const field of cfg.outFields) {
    names[field as AdminLevel] = clean(attributes[field]);
  }
  return names;
}

/**
 * Resolve the full Rwandan administrative hierarchy for a point.
 *
 * Fast path: one query against the Village layer, which carries every ancestor
 * name. Fallback: the four coarser layers in parallel, merged coarsest-first so
 * a finer answer wins.
 *
 * Never rejects. A level that could not be checked appears in `failed`; a level
 * with no polygon at this point is simply null.
 */
export async function adminLookup(point: Pt, signal?: AbortSignal): Promise<AdminHierarchy> {
  const failed: AdminLevel[] = [];

  // Fast path — the Village layer carries all five names.
  try {
    const names = await queryLevel('village', point, signal);
    if (names && clean(names.village)) {
      return { ...EMPTY, ...names, source: 'village-layer', failed };
    }
  } catch {
    failed.push('village');
  }

  // Fallback: coarsest to finest so finer answers overwrite coarser ones.
  const coarser: AdminLevel[] = ['province', 'district', 'sector', 'cell'];
  const settled = await Promise.allSettled(
    coarser.map((level) => queryLevel(level, point, signal)),
  );

  const merged: Record<AdminLevel, string | null> = { ...EMPTY };
  let anyAnswer = false;

  coarser.forEach((level, i) => {
    const outcome = settled[i];
    if (outcome.status === 'rejected') {
      failed.push(level);
      return;
    }
    const names = outcome.value;
    if (!names) return;
    anyAnswer = true;
    for (const key of ADMIN_LEVELS) {
      const value = clean(names[key]);
      if (value) merged[key] = value;
    }
  });

  // Every layer errored — report a total failure rather than a clean blank.
  if (!anyAnswer && coarser.every((l) => failed.includes(l))) {
    return { ...EMPTY, source: 'none', failed: [...ADMIN_LEVELS] };
  }

  return { ...merged, source: 'fallback', failed };
}
