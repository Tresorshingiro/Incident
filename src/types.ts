/** A point, always WGS84 once it has left the service layer. */
export type Pt = { x: number; y: number; spatialReference: { wkid: number } };

export type AdminLevel = 'province' | 'district' | 'sector' | 'cell' | 'village';

export type AdminNames = Record<AdminLevel, string | null>;

/** Normalised geocode match. The UI never reads `attributes`. */
export type GeoResult = {
  label: string;
  point: Pt;
  score: number;
  /** The hierarchy the locator itself reported for this match. */
  admin: AdminNames;
  /** Server-reported distance in metres, when the response carried one. */
  distanceM: number | null;
  attributes: Record<string, unknown>;
};

export type Suggestion = {
  text: string;
  magicKey: string;
  /** True when resolving this magicKey may return many candidates. */
  isCollection: boolean;
};

/** What the boundary polygons said. */
export type AdminHierarchy = AdminNames & {
  source: 'village-layer' | 'fallback' | 'none';
  /** Levels whose query errored, as distinct from levels with no polygon. */
  failed: AdminLevel[];
};

export type LevelSource = 'boundary' | 'locator' | 'none';

/** The merged answer the form actually uses. */
export type ResolvedAdmin = AdminNames & {
  levelSource: Record<AdminLevel, LevelSource>;
  /** Levels where the boundary and the locator disagreed. */
  conflicts: AdminLevel[];
  boundary: AdminHierarchy;
  locator: AdminNames;
};

export type POI = GeoResult & { distanceM: number };

export type SectionStatus = 'ok' | 'empty' | 'failed';

export type LocationResult = {
  point: Pt;
  address: string | null;
  admin: ResolvedAdmin;
  poi: POI[];
  status: { address: SectionStatus; admin: SectionStatus; poi: SectionStatus };
  elapsedMs: number;
};

export type FieldOrigin = 'auto' | 'user' | 'empty';

/** A form value that remembers what the last resolve suggested. */
export type Field = {
  value: string;
  autoValue: string | null;
  origin: FieldOrigin;
};

export type LocationOrigin = 'map' | 'search' | 'suggest';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentDraft = {
  title: string;
  description: string;
  category: string;
  severity: Severity;
  occurredAt: string;
  reporterName: string;
  reporterPhone: string;
  point: Pt;
  admin: AdminNames;
  nearbyPoi: string | null;
  matchedAddress: string | null;
  locationOrigin: LocationOrigin;
};

export type IncidentFeature = {
  geometry: Pt;
  attributes: Record<string, string | number | null>;
};

export type SubmitResult =
  | { ok: true; feature: IncidentFeature }
  | { ok: false; error: string };

/** An incident saved during this session. Cleared on reload — no backend yet. */
export type SavedIncident = {
  id: string;
  title: string;
  severity: Severity;
  sector: string | null;
  district: string | null;
  point: Pt;
  savedAt: number;
};
