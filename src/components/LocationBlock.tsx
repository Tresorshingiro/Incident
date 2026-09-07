import type { AdminLevel, Field, LocationResult } from '../types';
import type { LocationFieldKey } from '../state/useIncidentForm';
import AdminRows from './AdminRows';
import ProvenanceField from './ProvenanceField';
import { Spinner } from './IncidentMap';

type Props = {
  fields: Record<LocationFieldKey, Field>;
  result: LocationResult | null;
  busy: boolean;
  hasPoint: boolean;
  onEdit: (key: LocationFieldKey, value: string) => void;
  onRevert: (key: LocationFieldKey) => void;
  onRetry: () => void;
};

export default function LocationBlock({
  fields, result, busy, hasPoint, onEdit, onRevert, onRetry,
}: Props) {
  const status = result?.status;
  const nearest = result?.poi[0];

  return (
    <section className="space-y-2.5 px-3.5 py-3">
      <header className="flex h-4 items-center justify-between">
        <h3 className="text-[12px] font-medium text-ink">Where</h3>

        {busy ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <Spinner />resolving
          </span>
        ) : result ? (
          <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span className="h-1 w-1 rounded-full bg-ink-accent" />
            auto-filled
            <span className="mono text-[10.5px]">{result.elapsedMs}ms</span>
          </span>
        ) : null}
      </header>

      {!hasPoint ? (
        <p className="text-[12px] leading-relaxed text-ink-muted">
          Click the map, drag the marker, or search to set the location.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ProvenanceField
              label="Latitude" mono field={fields.latitude} placeholder="-1.940300"
              onChange={(v) => onEdit('latitude', v)} onRevert={() => onRevert('latitude')}
            />
            <ProvenanceField
              label="Longitude" mono field={fields.longitude} placeholder="30.091500"
              onChange={(v) => onEdit('longitude', v)} onRevert={() => onRevert('longitude')}
            />
          </div>

          {status?.admin === 'failed' && (
            <Notice tone="danger" onRetry={onRetry}>
              Administrative lookup failed — the rows below are editable.
            </Notice>
          )}

          <AdminRows
            fields={fields as Record<AdminLevel, Field>}
            result={result}
            onEdit={(level, v) => onEdit(level, v)}
            onRevert={(level) => onRevert(level)}
          />

          {status?.address === 'failed' && (
            <Notice tone="danger" onRetry={onRetry}>Reverse geocode failed.</Notice>
          )}

          <ProvenanceField
            label="Matched address"
            field={fields.matchedAddress}
            failed={status?.address === 'failed'}
            placeholder={status?.address === 'empty' ? 'no address at this point' : 'Matched address'}
            onChange={(v) => onEdit('matchedAddress', v)}
            onRevert={() => onRevert('matchedAddress')}
          />

          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <label className="label">Nearest point of interest</label>
              {nearest && (
                <span className="mb-[5px] mono shrink-0 text-[11px] text-ink-muted">
                  {nearest.distanceM} m
                </span>
              )}
            </div>
            <input
              list="poi-options"
              value={fields.nearbyPoi.value}
              placeholder={status?.poi === 'empty' ? 'nothing within 500 m' : 'Nearest place'}
              onChange={(e) => onEdit('nearbyPoi', e.target.value)}
              className={[
                'field',
                fields.nearbyPoi.origin === 'user' && fields.nearbyPoi.autoValue !== null
                  ? '!border-line-accent !bg-tint-accent'
                  : '',
              ].join(' ')}
            />
            <datalist id="poi-options">
              {result?.poi.map((p) => <option key={p.label} value={p.label} />)}
            </datalist>
          </div>
        </>
      )}
    </section>
  );
}

function Notice({
  tone, children, onRetry,
}: { tone: 'warning' | 'danger'; children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div
      className={[
        'flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed',
        tone === 'danger' ? 'bg-tint-danger text-ink-danger' : 'bg-tint-warning text-ink-warning',
      ].join(' ')}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 cursor-pointer underline underline-offset-2 hover:opacity-70"
        >
          retry
        </button>
      )}
    </div>
  );
}
