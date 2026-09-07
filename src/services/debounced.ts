/**
 * Result of a debounced call. `superseded` means a newer call replaced this
 * one — expected during typeahead, and never an error the UI should show.
 */
export type Outcome<T> = { superseded: true } | { superseded: false; value: T };

const SUPERSEDED = { superseded: true } as const;

export type Debounced<A extends unknown[], T> = {
  call(...args: A): Promise<Outcome<T>>;
  cancel(): void;
};

/**
 * Coalesce rapid calls into one, and abort the previous in-flight call when a
 * newer one starts. `fn` receives an AbortSignal it should forward onward.
 */
export function createDebounced<A extends unknown[], T>(
  fn: (signal: AbortSignal, ...args: A) => Promise<T>,
  waitMs: number,
): Debounced<A, T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingResolve: ((o: Outcome<T>) => void) | null = null;
  let controller: AbortController | null = null;
  let generation = 0;

  function supersede() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingResolve) {
      pendingResolve(SUPERSEDED);
      pendingResolve = null;
    }
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  return {
    call(...args: A) {
      supersede();
      const mine = ++generation;

      return new Promise<Outcome<T>>((resolve, reject) => {
        pendingResolve = resolve;

        timer = setTimeout(() => {
          timer = null;
          pendingResolve = null;

          const ac = new AbortController();
          controller = ac;

          fn(ac.signal, ...args).then(
            (value) => {
              if (mine !== generation || ac.signal.aborted) return resolve(SUPERSEDED);
              controller = null;
              resolve({ superseded: false, value });
            },
            (err) => {
              if (mine !== generation || ac.signal.aborted) return resolve(SUPERSEDED);
              controller = null;
              reject(err);
            },
          );
        }, waitMs);
      });
    },

    cancel() {
      generation++;
      supersede();
    },
  };
}
