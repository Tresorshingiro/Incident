import { useState } from 'react';
import { INCIDENT_CATEGORIES, SEVERITIES } from '../config/layers';
import type { Details, LocationFieldKey } from '../state/useIncidentForm';
import type { Field, LocationResult, Severity, SubmitResult } from '../types';
import LocationBlock from './LocationBlock';
import { Spinner } from './IncidentMap';

type Props = {
  details: Details;
  setDetail: <K extends keyof Details>(key: K, value: Details[K]) => void;
  fields: Record<LocationFieldKey, Field>;
  result: LocationResult | null;
  resolving: boolean;
  hasPoint: boolean;
  submitting: boolean;
  submitted: SubmitResult | null;
  onEdit: (key: LocationFieldKey, value: string) => void;
  onRevert: (key: LocationFieldKey) => void;
  onRetry: () => void;
  onSubmit: () => void;
  onReset: () => void;
};

/** Only the active segment carries colour; inactive segments stay plain. */
const SEVERITY_ACTIVE: Record<Severity, string> = {
  low: 'bg-surface-3 text-ink-secondary',
  medium: 'bg-tint-accent text-ink-accent',
  high: 'bg-tint-warning text-ink-warning',
  critical: 'bg-tint-danger text-ink-danger',
};

const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical',
};

export default function IncidentForm(props: Props) {
  const {
    details, setDetail, fields, result, resolving, hasPoint, submitting, submitted,
    onEdit, onRevert, onRetry, onSubmit, onReset,
  } = props;

  const [reporterOpen, setReporterOpen] = useState(false);

  const titleMissing = details.title.trim() === '';
  const blocked = titleMissing || !hasPoint || resolving || submitting;

  const blockReason = resolving
    ? 'Resolving location'
    : titleMissing && !hasPoint
      ? 'Add a title and set a location'
      : titleMissing
        ? 'Add a title'
        : !hasPoint
          ? 'Set a location'
          : null;

  const reporterSummary = [details.reporterName, details.reporterPhone]
    .filter(Boolean).join(' · ');

  return (
    <form
      className="flex h-full min-w-0 flex-col bg-surface-1"
      onSubmit={(e) => { e.preventDefault(); if (!blocked) onSubmit(); }}
    >
      <header className="flex h-10 shrink-0 items-center justify-between px-3.5 hair-b">
        <h2 className="text-[12.5px] font-medium text-ink">New incident</h2>
        <span className="mono text-[10.5px] text-ink-muted">
          {submitted?.ok ? 'saved' : 'draft'}
        </span>
      </header>

      <div className="scroll-slim min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        {/* ---- What happened ---- */}
        <section className="space-y-2.5 px-3.5 py-3">
          <h3 className="text-[12px] font-medium text-ink">What happened</h3>

          <div className="min-w-0">
            <label className="label" htmlFor="title">Title</label>
            <input
              id="title"
              value={details.title}
              onChange={(e) => setDetail('title', e.target.value)}
              placeholder="Short summary"
              className="field"
            />
          </div>

          <div className="min-w-0">
            <label className="label" htmlFor="description">Description</label>
            <textarea
              id="description"
              value={details.description}
              onChange={(e) => setDetail('description', e.target.value)}
              rows={2}
              placeholder="Detail and what is needed"
              className="field"
            />
          </div>

          <div className="min-w-0">
            <label className="label" htmlFor="category">Category</label>
            <select
              id="category"
              value={details.category}
              onChange={(e) => setDetail('category', e.target.value)}
              className="field cursor-pointer appearance-none bg-[length:13px] bg-[right_9px_center] bg-no-repeat pr-7"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238b93a1' stroke-width='2.4' stroke-linecap='round'><path d='m6 9 6 6 6-6'/></svg>\")",
              }}
            >
              {INCIDENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="min-w-0">
            <span className="label">Severity</span>
            <div className="flex flex-wrap gap-1">
              {SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDetail('severity', s)}
                  className={[
                    'cursor-pointer rounded-lg px-2.5 py-1 text-[12px] transition hair',
                    details.severity === s
                      ? `${SEVERITY_ACTIVE[s]} !border-transparent`
                      : 'text-ink-muted hover:bg-fill-hover hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="hair-t" />

        {/* ---- Where ---- */}
        <LocationBlock
          fields={fields}
          result={result}
          busy={resolving}
          hasPoint={hasPoint}
          onEdit={onEdit}
          onRevert={onRevert}
          onRetry={onRetry}
        />

        <div className="hair-t" />

        {/* ---- Who reported (secondary, collapsed) ---- */}
        <section className="px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => setReporterOpen((v) => !v)}
            aria-expanded={reporterOpen}
            className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
          >
            <span className="text-[12px] font-medium text-ink">Who reported</span>
            <span className="flex min-w-0 items-center gap-2">
              {!reporterOpen && reporterSummary && (
                <span className="truncate text-[11px] text-ink-muted">{reporterSummary}</span>
              )}
              <Chevron open={reporterOpen} />
            </span>
          </button>

          {reporterOpen && (
            <div className="mt-2.5 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <label className="label" htmlFor="reporter-name">Name</label>
                  <input
                    id="reporter-name"
                    value={details.reporterName}
                    onChange={(e) => setDetail('reporterName', e.target.value)}
                    placeholder="Full name"
                    className="field"
                  />
                </div>
                <div className="min-w-0">
                  <label className="label" htmlFor="reporter-phone">Phone</label>
                  <input
                    id="reporter-phone"
                    value={details.reporterPhone}
                    onChange={(e) => setDetail('reporterPhone', e.target.value)}
                    placeholder="+250 7.."
                    className="field mono"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <label className="label" htmlFor="occurred">Occurred at</label>
                <input
                  id="occurred"
                  type="datetime-local"
                  value={details.occurredAt}
                  onChange={(e) => setDetail('occurredAt', e.target.value)}
                  className="field mono"
                />
              </div>
            </div>
          )}
        </section>
      </div>

      <footer className="shrink-0 space-y-2 px-3.5 py-2.5 hair-t">
        {submitted && (
          <div
            className={[
              'rounded-lg px-2.5 py-1.5 text-[11.5px] leading-relaxed',
              submitted.ok ? 'bg-tint-success text-ink-success' : 'bg-tint-danger text-ink-danger',
            ].join(' ')}
          >
            {submitted.ok
              ? 'Payload built and logged to the console.'
              : `Submit failed: ${submitted.error}`}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={blocked}
            className={[
              'flex h-8 flex-1 items-center justify-center gap-2 rounded-lg text-[12.5px] font-medium transition',
              blocked
                ? 'cursor-not-allowed bg-surface-3 text-ink-muted'
                : 'cursor-pointer bg-fill-accent text-ink-onaccent hover:bg-[var(--fill-accent-hover)]',
            ].join(' ')}
          >
            {submitting && <Spinner />}
            {submitting ? 'Saving' : 'Save incident'}
          </button>

          {submitted?.ok && (
            <button
              type="button"
              onClick={onReset}
              className="h-8 cursor-pointer rounded-lg px-2.5 text-[12px] text-ink-secondary transition hair hover:bg-fill-hover"
            >
              New
            </button>
          )}
        </div>

        {blockReason && !submitting && (
          <p className="text-center text-[11px] text-ink-muted">{blockReason}</p>
        )}
      </footer>
    </form>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 text-ink-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
