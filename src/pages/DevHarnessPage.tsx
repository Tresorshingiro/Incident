import { useCallback, useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { Spinner } from '../components/IncidentMap';
import {
  findAddressCandidates, geocodeAddresses, reverseGeocode, suggest, wgs84,
} from '../services/geocode';
import { adminLookup } from '../services/adminLookup';
import { nearbyPOI } from '../services/poi';
import { resolveLocation } from '../services/resolveLocation';
import { getToken, onTokenStateChange, tokenError, tokenExpiry, tokenState, type TokenState } from '../services/token';

type PanelRun = {
  request: unknown;
  response: unknown;
  elapsedMs: number;
  error?: string;
};

/**
 * Service-layer harness. Every call the app makes is exercisable here with the
 * request that was actually sent and the normalised output beside it — this is
 * how the service layer gets verified before any of the UI depends on it.
 */
export default function DevHarnessPage() {
  const [token, setToken] = useState<TokenState>(tokenState());
  const [lon, setLon] = useState('30.0915');
  const [lat, setLat] = useState('-1.9403');
  const [text, setText] = useState('Kacyiru');
  const [magicKey, setMagicKey] = useState('');
  const [batch, setBatch] = useState('Kacyiru Bus Station\nNyamirambo');

  useEffect(() => {
    const off = onTokenStateChange(setToken);
    void getToken();
    return off;
  }, []);

  const point = wgs84(Number(lon), Number(lat));

  return (
    <AppShell tokenState={token} lastElapsedMs={null} incidentCount={0}>
      <div className="scroll-slim h-full overflow-y-auto p-4">
        <div className="mx-auto max-w-5xl space-y-3">
          <section className="rounded-md border border-line bg-surface-1 p-3">
            <h2 className="mb-2 text-[12px] font-medium text-ink">Inputs</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Input label="Longitude" value={lon} onChange={setLon} mono />
              <Input label="Latitude" value={lat} onChange={setLat} mono />
              <Input label="Search text" value={text} onChange={setText} />
              <Input label="magicKey" value={magicKey} onChange={setMagicKey} mono />
            </div>
            <div className="mt-2">
              <div className="mb-1 text-[10px] text-ink-muted">
                Batch addresses (one per line)
              </div>
              <textarea
                value={batch}
                onChange={(e) => setBatch(e.target.value)}
                rows={2}
                className="w-full rounded border border-line bg-fill-field px-2 py-1.5 font-mono text-[11px] text-ink focus:outline-none"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-ink-muted">
              <span>token: {token}</span>
              {tokenExpiry() && <span>expires: {new Date(tokenExpiry()!).toLocaleTimeString()}</span>}
              {tokenError() && <span className="text-ink-danger">error: {tokenError()}</span>}
            </div>
          </section>

          <Panel
            title="suggest"
            note="forStorage: n/a · Rwanda constrained"
            run={() => suggest(text)}
            request={{ text, countryCode: 'RWA' }}
          />

          <Panel
            title="findAddressCandidates"
            note="forStorage: false"
            run={() => findAddressCandidates(text, magicKey ? { magicKey } : undefined)}
            request={{ text, magicKey: magicKey || undefined }}
          />

          <Panel
            title="geocodeAddresses (batch)"
            note="forStorage: false · re-sorted by ResultID"
            run={() => geocodeAddresses(batch.split('\n').map((s) => s.trim()).filter(Boolean))}
            request={{ addresses: batch.split('\n').filter(Boolean) }}
          />

          <Panel
            title="reverseGeocode"
            note="forStorage: false"
            run={() => reverseGeocode(point)}
            request={{ location: point }}
          />

          <Panel
            title="adminLookup"
            note="anonymous · boundary polygons"
            run={() => adminLookup(point)}
            request={{ geometry: point, spatialRelationship: 'intersects' }}
          />

          <Panel
            title="nearbyPOI"
            note="category POI · 500 m · max 5"
            run={() => nearbyPOI(point)}
            request={{ location: point, categories: ['POI'], distance: 500 }}
          />

          <Panel
            title="resolveLocation (the funnel)"
            note="reverseGeocode + adminLookup + nearbyPOI in parallel, then merged"
            run={() => resolveLocation(point)}
            request={{ point }}
          />
        </div>
      </div>
    </AppShell>
  );
}

function Panel({
  title, note, run, request,
}: {
  title: string;
  note: string;
  run: () => Promise<unknown>;
  request: unknown;
}) {
  const [state, setState] = useState<PanelRun | null>(null);
  const [busy, setBusy] = useState(false);

  const go = useCallback(async () => {
    setBusy(true);
    const started = performance.now();
    try {
      const response = await run();
      setState({ request, response, elapsedMs: Math.round(performance.now() - started) });
    } catch (error) {
      setState({
        request,
        response: null,
        elapsedMs: Math.round(performance.now() - started),
        error: (error as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }, [run, request]);

  return (
    <section className="rounded-md border border-line bg-surface-1">
      <header className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <h3 className="font-mono text-[12px] text-ink">{title}</h3>
          <p className="truncate text-[10px] text-ink-muted">{note}</p>
        </div>
        <div className="flex items-center gap-2">
          {state && !state.error && (
            <span className="font-mono text-[10px] text-ink-success">{state.elapsedMs} ms</span>
          )}
          {state?.error && <span className="font-mono text-[10px] text-ink-danger">error</span>}
          <button
            type="button"
            onClick={() => void go()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded bg-fill-accent px-2.5 py-1 text-[11px] font-medium text-ink-onaccent transition hover:brightness-110 disabled:opacity-60"
          >
            {busy && <Spinner />}run
          </button>
        </div>
      </header>

      {state && (
        <div className="grid gap-px bg-line md:grid-cols-2">
          <Pre label="request" value={state.request} />
          <Pre label={state.error ? 'error' : 'normalised response'} value={state.error ?? state.response} />
        </div>
      )}
    </section>
  );
}

function Pre({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-surface-1 p-2.5">
      <div className="mb-1 text-[9px] text-ink-muted">{label}</div>
      <pre className="scroll-slim max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-ink-secondary">
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Input({
  label, value, onChange, mono,
}: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[10px] text-ink-muted">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'w-full rounded border border-line bg-fill-field px-2 py-1.5 text-[11px] text-ink focus:outline-none',
          mono ? 'font-mono' : '',
        ].join(' ')}
      />
    </div>
  );
}
