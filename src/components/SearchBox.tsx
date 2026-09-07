import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createSuggestDebounced, findAddressCandidates } from '../services/geocode';
import type { GeoResult, Pt, Suggestion } from '../types';
import { Spinner } from './IncidentMap';

type Props = {
  disabled: boolean;
  disabledReason?: string;
  placeholder?: string;
  /** Ties an external <label> to the input. */
  inputId?: string;
  /**
   * `overlay` floats over the map and needs a scrim to stay legible on
   * satellite; `inline` sits in the panel and matches the other fields.
   */
  variant?: 'overlay' | 'inline';
  onPreview: (point: Pt | null) => void;
  onChoose: (point: Pt, how: 'search' | 'suggest') => void;
};

type Mode =
  | { kind: 'suggestions'; items: Suggestion[] }
  | { kind: 'candidates'; items: GeoResult[]; from: string };

/**
 * Custom combobox over our own suggest / findAddressCandidates, rather than
 * the Esri Search widget, so the Rwanda constraint and the magicKey flow are
 * ours to control.
 *
 * A suggestion marked `isCollection` can resolve to many candidates, so
 * selecting one may open a second-level picker instead of committing a point.
 */
export default function SearchBox({
  disabled, disabledReason, placeholder, inputId, variant = 'overlay',
  onPreview, onChoose,
}: Props) {
  const listId = useId();
  // One debouncer per box, so the map's search and the panel's do not cancel
  // each other's in-flight requests.
  const debouncedSuggest = useMemo(createSuggestDebounced, []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'suggestions', items: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = mode.items;

  const runSuggest = useCallback(async (value: string) => {
    setError(null);
    if (!value.trim()) {
      debouncedSuggest.cancel();
      setMode({ kind: 'suggestions', items: [] });
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const outcome = await debouncedSuggest.call(value, {});
      if (outcome.superseded) return;
      setMode({ kind: 'suggestions', items: outcome.value });
      setActive(outcome.value.length ? 0 : -1);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [debouncedSuggest]);

  useEffect(() => () => debouncedSuggest.cancel(), [debouncedSuggest]);

  const commit = useCallback(
    (result: GeoResult, how: 'search' | 'suggest') => {
      setText(result.label);
      setOpen(false);
      setActive(-1);
      onPreview(null);
      onChoose(result.point, how);
    },
    [onChoose, onPreview],
  );

  const chooseSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      setBusy(true);
      setError(null);
      try {
        const candidates = await findAddressCandidates(suggestion.text, {
          magicKey: suggestion.magicKey,
          maxLocations: suggestion.isCollection ? 10 : 1,
        });

        if (candidates.length === 0) {
          setError('That suggestion did not resolve to a location.');
          return;
        }
        if (candidates.length === 1) {
          commit(candidates[0], 'suggest');
          return;
        }

        // A collection — let the operator pick which one.
        setMode({ kind: 'candidates', items: candidates, from: suggestion.text });
        setActive(0);
        setOpen(true);
        onPreview(candidates[0].point);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [commit, onPreview],
  );

  const searchText = useCallback(async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const candidates = await findAddressCandidates(text);
      if (candidates.length === 0) {
        setError(`No match in Rwanda for "${text}".`);
        setMode({ kind: 'suggestions', items: [] });
        setOpen(true);
        return;
      }
      if (candidates.length === 1) {
        commit(candidates[0], 'search');
        return;
      }
      setMode({ kind: 'candidates', items: candidates, from: text });
      setActive(0);
      setOpen(true);
      onPreview(candidates[0].point);
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }, [text, commit, onPreview]);

  const selectActive = useCallback(() => {
    if (active < 0 || active >= items.length) {
      void searchText();
      return;
    }
    if (mode.kind === 'suggestions') void chooseSuggestion(mode.items[active]);
    else commit(mode.items[active], 'search');
  }, [active, items.length, mode, chooseSuggestion, commit, searchText]);

  const move = useCallback(
    (delta: number) => {
      if (!items.length) return;
      const next = (active + delta + items.length) % items.length;
      setActive(next);
      if (mode.kind === 'candidates') onPreview(mode.items[next].point);
    },
    [active, items.length, mode, onPreview],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); setOpen(true); move(1); break;
      case 'ArrowUp': event.preventDefault(); setOpen(true); move(-1); break;
      case 'Enter': event.preventDefault(); selectActive(); break;
      case 'Escape':
        event.preventDefault();
        if (mode.kind === 'candidates') {
          setMode({ kind: 'suggestions', items: [] });
          onPreview(null);
          void runSuggest(text);
        } else {
          setOpen(false);
        }
        break;
      default: break;
    }
  }

  const showList = open && !disabled && (items.length > 0 || Boolean(error));

  return (
    <div className="relative">
      <div
        className={[
          'flex h-9 items-center gap-2.5 px-3 transition',
          variant === 'overlay' ? 'map-chrome' : 'bg-fill-field hair',
          showList ? 'rounded-t-lg' : 'rounded-lg',
          disabled ? 'opacity-70' : '',
        ].join(' ')}
      >
        <SearchIcon />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-[12.5px] placeholder:text-ink-muted focus:outline-none"
          placeholder={
            disabled
              ? (disabledReason ?? 'Search unavailable')
              : (placeholder ?? 'Search a place or address in Rwanda')
          }
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            setMode({ kind: 'suggestions', items: [] });
            void runSuggest(e.target.value);
          }}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
        {busy ? (
          <span className="text-ink-muted"><Spinner /></span>
        ) : (
          <span className="mono rounded-md bg-surface-3 px-1.5 py-0.5 text-[10px] text-ink-muted">
            {mode.kind === 'candidates' ? 'pick' : 'suggest'}
          </span>
        )}
      </div>

      {showList && (
        <div
          id={listId}
          role="listbox"
          className={[
            'scroll-slim absolute z-30 max-h-80 w-full overflow-y-auto rounded-b-lg border-t-0 pb-1',
            variant === 'overlay' ? 'map-chrome' : 'bg-surface-1 hair',
          ].join(' ')}
        >
          {error && (
            <div className="px-3 py-2 text-[11.5px] text-ink-danger hair-t">
              {error}
            </div>
          )}

          {mode.kind === 'candidates' && (
            <div className="px-3 py-1.5 text-[11px] text-ink-muted hair-t">
              {mode.items.length} matches for “{mode.from}”
            </div>
          )}

          {mode.kind === 'suggestions'
            ? mode.items.map((s, i) => (
                <Option
                  key={s.magicKey}
                  id={`${listId}-opt-${i}`}
                  activeItem={i === active}
                  onPointerDown={(e) => { e.preventDefault(); void chooseSuggestion(s); }}
                  onMouseEnter={() => setActive(i)}
                  primary={s.text}
                  secondary={s.isCollection ? 'group of places' : undefined}
                />
              ))
            : mode.items.map((c, i) => (
                <Option
                  key={`${c.point.x},${c.point.y},${i}`}
                  id={`${listId}-opt-${i}`}
                  activeItem={i === active}
                  onPointerDown={(e) => { e.preventDefault(); commit(c, 'search'); }}
                  onMouseEnter={() => { setActive(i); onPreview(c.point); }}
                  primary={c.label}
                  secondary={[c.admin.sector, c.admin.district, c.admin.province]
                    .filter(Boolean)
                    .join(', ')}
                  trailing={`${c.point.y.toFixed(4)}, ${c.point.x.toFixed(4)}`}
                />
              ))}
        </div>
      )}
    </div>
  );
}

function Option({
  id, activeItem, primary, secondary, trailing, onPointerDown, onMouseEnter,
}: {
  id: string;
  activeItem: boolean;
  primary: string;
  secondary?: string;
  trailing?: string;
  onPointerDown: (e: React.PointerEvent) => void;
  onMouseEnter: () => void;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={activeItem}
      onPointerDown={onPointerDown}
      onMouseEnter={onMouseEnter}
      className={[
        'mx-1 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition',
        activeItem ? 'bg-fill-selected' : 'hover:bg-fill-hover',
      ].join(' ')}
    >
      <span className={activeItem ? 'text-ink-accent' : 'text-ink-muted'}><PinIcon /></span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-ink">{primary}</div>
        {secondary && <div className="truncate text-[11px] text-ink-muted">{secondary}</div>}
      </div>
      {trailing && <span className="mono shrink-0 text-[10px] text-ink-muted">{trailing}</span>}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-muted" aria-hidden>
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0" aria-hidden>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
