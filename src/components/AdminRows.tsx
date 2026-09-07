import { ADMIN_LABELS, ADMIN_LEVELS } from '../config/layers';
import type { AdminLevel, Field, LocationResult } from '../types';

type Props = {
  fields: Record<AdminLevel, Field>;
  result: LocationResult | null;
  onEdit: (level: AdminLevel, value: string) => void;
  onRevert: (level: AdminLevel) => void;
};

/**
 * The five administrative levels as a compact bordered group: label left,
 * value right, one hairline between rows.
 *
 * A level with no match is tinted and keeps an obvious editable control rather
 * than going silently blank — that unmatched state is the whole reason the
 * hierarchy is shown in the form at all.
 */
export default function AdminRows({ fields, result, onEdit, onRevert }: Props) {
  const conflicts = result?.admin.conflicts ?? [];
  const failed = result?.admin.boundary.failed ?? [];
  const resolved = result !== null;

  return (
    <div className="overflow-hidden rounded-lg hair">
      {ADMIN_LEVELS.map((level, i) => {
        const field = fields[level];
        const overridden = field.origin === 'user' && field.autoValue !== null;
        const unmatched = resolved && field.value === '';
        const conflict = conflicts.includes(level) ? result?.admin.locator[level] : null;

        return (
          <div
            key={level}
            className={[
              'flex h-7 items-center gap-2 pl-2.5 pr-1',
              i > 0 ? 'hair-t' : '',
              unmatched ? 'bg-tint-warning' : overridden ? 'bg-tint-accent' : '',
            ].join(' ')}
          >
            <label
              htmlFor={`admin-${level}`}
              className={[
                'w-[62px] shrink-0 text-[11px]',
                unmatched ? 'text-ink-warning' : 'text-ink-muted',
              ].join(' ')}
            >
              {ADMIN_LABELS[level]}
            </label>

            <input
              id={`admin-${level}`}
              value={field.value}
              placeholder={
                unmatched
                  ? failed.includes(level) ? 'lookup failed' : 'no match — enter'
                  : '—'
              }
              onChange={(e) => onEdit(level, e.target.value)}
              className={[
                'cell-input',
                unmatched ? 'placeholder:!text-ink-warning' : '',
                overridden ? '!text-ink-accent' : '',
              ].join(' ')}
            />

            {conflict && (
              <button
                type="button"
                title={`The locator says "${conflict}". Click to use it.`}
                onClick={() => onEdit(level, conflict)}
                className="shrink-0 cursor-pointer rounded px-1 text-[10px] text-ink-warning transition hover:bg-tint-warning"
              >
                disputed
              </button>
            )}

            {overridden && (
              <button
                type="button"
                title={`Revert to "${field.autoValue}"`}
                onClick={() => onRevert(level)}
                className="shrink-0 cursor-pointer rounded px-1 text-[10px] text-ink-accent transition hover:bg-tint-accent"
              >
                revert
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
