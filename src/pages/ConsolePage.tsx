import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import IncidentMap from '../components/IncidentMap';
import IncidentsRail from '../components/IncidentsRail';
import IncidentForm from '../components/IncidentForm';
import SearchBox from '../components/SearchBox';
import { useIncidentForm } from '../state/useIncidentForm';
import { resolveLocation } from '../services/resolveLocation';
import { submitIncident } from '../services/incidents';
import { getToken, onTokenStateChange, tokenState, type TokenState } from '../services/token';
import type { LocationOrigin, Pt, SavedIncident, SubmitResult } from '../types';

export default function ConsolePage() {
  const form = useIncidentForm();
  const [resolving, setResolving] = useState(false);
  const [highlight, setHighlight] = useState<Pt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [token, setToken] = useState<TokenState>(tokenState());
  const [sheetOpen, setSheetOpen] = useState(false);

  const [incidents, setIncidents] = useState<SavedIncident[]>([]);
  const [railOpen, setRailOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const off = onTokenStateChange(setToken);
    void getToken();
    return off;
  }, []);

  /**
   * The single funnel. Every entry point lands here, so all three fill the
   * same fields the same way.
   */
  const resolve = useCallback(
    async (point: Pt, how: LocationOrigin) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      form.setPointOnly(point, how);
      setResolving(true);
      setSubmitted(null);
      try {
        const result = await resolveLocation(point, controller.signal);
        if (controller.signal.aborted) return;
        form.applyResolve(result, how);
      } finally {
        if (!controller.signal.aborted) setResolving(false);
      }
    },
    [form],
  );

  const retry = useCallback(() => {
    if (form.point) void resolve(form.point, form.origin);
  }, [form.point, form.origin, resolve]);

  const onSubmit = useCallback(async () => {
    if (!form.draft) return;
    setSubmitting(true);
    try {
      const result = await submitIncident(form.draft);
      setSubmitted(result);
      if (result.ok) {
        const saved: SavedIncident = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: form.draft.title,
          severity: form.draft.severity,
          sector: form.draft.admin.sector,
          district: form.draft.admin.district,
          point: form.draft.point,
          savedAt: Date.now(),
        };
        setIncidents((list) => [saved, ...list]);
        setActiveId(saved.id);
        setRailOpen(true);
      }
    } finally {
      setSubmitting(false);
    }
  }, [form.draft]);

  const selectIncident = useCallback(
    (incident: SavedIncident) => {
      setActiveId(incident.id);
      void resolve(incident.point, 'map');
    },
    [resolve],
  );

  /** Sector · cell for the map status bar. */
  const place = useMemo(() => {
    const parts = [form.fields.sector.value, form.fields.cell.value].filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }, [form.fields.sector.value, form.fields.cell.value]);

  const panel = (
    <IncidentForm
      details={form.details}
      setDetail={form.setDetail}
      fields={form.fields}
      result={form.lastResult}
      resolving={resolving}
      hasPoint={form.point !== null}
      submitting={submitting}
      submitted={submitted}
      onEdit={form.editField}
      onRevert={form.revertField}
      onRetry={retry}
      onSubmit={onSubmit}
      onReset={() => { form.reset(); setSubmitted(null); setActiveId(null); }}
    />
  );

  return (
    <AppShell
      tokenState={token}
      lastElapsedMs={form.lastResult?.elapsedMs ?? null}
      incidentCount={incidents.length}
    >
      <div className="grid h-full min-w-0 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-0 min-w-0 lg:hair-r">
          <IncidentMap
            point={form.point}
            highlight={highlight}
            incidents={incidents}
            hoveredId={hoveredId}
            busy={resolving}
            place={place}
            onPick={(p) => void resolve(p, 'map')}
          />

          {/* Search: top-left, inset 16px, fixed max width. */}
          <div className="pointer-events-none absolute left-4 top-4 z-20 w-full max-w-[400px] pr-4">
            <div className="pointer-events-auto">
              <SearchBox
                disabled={token !== 'ready'}
                disabledReason={
                  token === 'failed'
                    ? 'Locator unavailable — pin on the map'
                    : 'Connecting to locator…'
                }
                onPreview={setHighlight}
                onChoose={(p, how) => void resolve(p, how)}
              />
            </div>
          </div>

          {/* Incidents rail, bottom-left above the status bar. */}
          <div className="pointer-events-none absolute bottom-9 left-4 z-20">
            <IncidentsRail
              incidents={incidents}
              open={railOpen}
              activeId={activeId}
              onToggle={() => setRailOpen((v) => !v)}
              onSelect={selectIncident}
              onHover={(i) => setHoveredId(i?.id ?? null)}
            />
          </div>
        </div>

        {/* Desktop rail */}
        <aside className="hidden min-h-0 min-w-0 bg-surface-1 lg:block">{panel}</aside>

        {/* Mobile bottom sheet */}
        <div className="lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="fixed inset-x-0 bottom-0 z-30 flex cursor-pointer items-center justify-between bg-surface-1 px-4 py-3 text-[12.5px] font-medium text-ink hair-t"
          >
            <span>{sheetOpen ? 'Hide incident form' : 'New incident'}</span>
            <span
              className={[
                'mono rounded-md px-1.5 py-[2px] text-[10.5px] font-normal',
                form.point ? 'bg-tint-accent text-ink-accent' : 'bg-surface-3 text-ink-muted',
              ].join(' ')}
            >
              {form.point ? 'located' : 'no location'}
            </span>
          </button>

          {sheetOpen && (
            <div className="fixed inset-x-0 bottom-0 z-40 h-[86dvh] overflow-hidden rounded-t-xl bg-surface-1 hair-t">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="mx-auto my-2 block h-1 w-9 cursor-pointer rounded-full bg-line-strong"
                aria-label="Close form"
              />
              <div className="h-[calc(86dvh-1.75rem)]">{panel}</div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
