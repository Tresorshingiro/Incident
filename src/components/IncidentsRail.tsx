import type { SavedIncident, Severity } from '../types';

type Props = {
  incidents: SavedIncident[];
  open: boolean;
  activeId: string | null;
  onToggle: () => void;
  onSelect: (incident: SavedIncident) => void;
  onHover: (incident: SavedIncident | null) => void;
};

const SEVERITY_DOT: Record<Severity, string> = {
  low: 'bg-[var(--sev-low)]',
  medium: 'bg-[var(--sev-medium)]',
  high: 'bg-[var(--sev-high)]',
  critical: 'bg-[var(--sev-critical)]',
};

function relativeTime(then: number): string {
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86400)}d`;
}

/**
 * Incidents saved this session. Collapsed to a slim tab by default so it never
 * competes with the map; hovering a row highlights that marker.
 */
export default function IncidentsRail({
  incidents, open, activeId, onToggle, onSelect, onHover,
}: Props) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="map-chrome pointer-events-auto flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-[11.5px] text-ink-secondary transition hover:bg-fill-hover"
        title="Show incidents saved this session"
      >
        <ListIcon />
        <span className="mono text-[11px]">{incidents.length}</span>
      </button>
    );
  }

  return (
    <div className="map-chrome pointer-events-auto flex max-h-[min(420px,60vh)] w-[248px] flex-col overflow-hidden rounded-xl">
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 pl-3 pr-1.5 hair-b">
        <span className="text-[11.5px] text-ink-secondary">
          Incidents
          <span className="mono ml-1.5 text-[11px] text-ink-muted">{incidents.length}</span>
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-label="Hide incidents"
          className="grid h-6 w-6 cursor-pointer place-items-center rounded-md text-ink-muted transition hover:bg-fill-hover hover:text-ink-secondary"
        >
          <CloseIcon />
        </button>
      </div>

      {incidents.length === 0 ? (
        <p className="px-3 py-3 text-[11.5px] leading-relaxed text-ink-muted">
          Incidents you save appear here for the rest of the session.
        </p>
      ) : (
        <div
          className="scroll-slim min-h-0 overflow-y-auto"
          onMouseLeave={() => onHover(null)}
        >
          {incidents.map((incident, i) => (
            <button
              key={incident.id}
              type="button"
              onClick={() => onSelect(incident)}
              onMouseEnter={() => onHover(incident)}
              className={[
                'flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition',
                i > 0 ? 'hair-t' : '',
                activeId === incident.id ? 'bg-fill-selected' : 'hover:bg-fill-hover',
              ].join(' ')}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY_DOT[incident.severity]}`}
                title={incident.severity}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-ink">{incident.title}</span>
                <span className="block truncate text-[11px] text-ink-muted">
                  {incident.sector ?? incident.district ?? 'unlocated'}
                </span>
              </span>
              <span className="mono shrink-0 text-[10.5px] text-ink-muted">
                {relativeTime(incident.savedAt)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}
