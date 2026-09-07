import type { Field } from '../types';

type Props = {
  label: string;
  field: Field;
  onChange: (value: string) => void;
  onRevert: () => void;
  placeholder?: string;
  /** Machine-derived value — coordinates, scores, timings. */
  mono?: boolean;
  /** The lookup for this field failed, as opposed to finding nothing. */
  failed?: boolean;
  options?: string[];
};

/**
 * An editable field that remembers what the last resolve suggested.
 *
 * Overridden values are tinted and offer a revert; the "auto" state is not
 * badged here because the Location block header already says the block was
 * auto-filled.
 */
export default function ProvenanceField({
  label, field, onChange, onRevert, placeholder, mono, failed, options,
}: Props) {
  const overridden = field.origin === 'user' && field.autoValue !== null;
  const emptyBecauseFailed = failed && field.value === '';
  const listId = options?.length ? `opt-${label.replace(/\s+/g, '-').toLowerCase()}` : undefined;

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label className="label">{label}</label>
        {overridden && (
          <button
            type="button"
            onClick={onRevert}
            title={`Revert to "${field.autoValue}"`}
            className="mb-[5px] cursor-pointer text-[11px] text-ink-accent transition hover:opacity-70"
          >
            edited · revert
          </button>
        )}
      </div>

      <input
        list={listId}
        value={field.value}
        title={field.value || undefined}
        placeholder={emptyBecauseFailed ? 'lookup failed — enter manually' : placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'field',
          mono ? 'mono' : '',
          overridden ? '!border-line-accent !bg-tint-accent' : '',
          emptyBecauseFailed ? '!border-line-danger' : '',
        ].join(' ')}
      />

      {listId && (
        <datalist id={listId}>
          {options?.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </div>
  );
}
