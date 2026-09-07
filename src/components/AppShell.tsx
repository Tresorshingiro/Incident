import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '../theme/useTheme';
import type { TokenState } from '../services/token';

type Props = {
  tokenState: TokenState;
  lastElapsedMs: number | null;
  incidentCount: number;
  children: React.ReactNode;
};

const STATUS: Record<TokenState, { label: string; dot: string; text: string }> = {
  idle: { label: 'idle', dot: 'bg-ink-muted', text: 'text-ink-muted' },
  loading: { label: 'connecting', dot: 'bg-ink-warning animate-pulse', text: 'text-ink-warning' },
  ready: { label: 'online', dot: 'bg-ink-success', text: 'text-ink-secondary' },
  failed: { label: 'offline', dot: 'bg-ink-danger', text: 'text-ink-danger' },
};

/** 44px header carrying the service status, latency and session count. */
export default function AppShell({
  tokenState, lastElapsedMs, incidentCount, children,
}: Props) {
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const status = STATUS[tokenState];
  const onDev = pathname === '/dev';

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-surface-2">
      <header className="z-30 flex h-11 shrink-0 items-center justify-between gap-4 bg-surface-1 px-3.5 hair-b">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-fill-accent">
            <PinIcon />
          </span>
          <span className="truncate text-[12.5px] font-medium text-ink">Incident registry</span>
          <span className="mono hidden text-[10.5px] text-ink-muted sm:inline">RWA · EPSG:4326</span>
        </div>

        <div className="flex shrink-0 items-center gap-3.5">
          <Stat label="locator">
            <span className={`flex items-center gap-1.5 ${status.text}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
          </Stat>

          <Stat label="latency">
            <span className="mono text-ink-secondary">
              {lastElapsedMs === null ? '—' : `${lastElapsedMs} ms`}
            </span>
          </Stat>

          <Stat label="incidents">
            <span className="mono text-ink-secondary">{incidentCount}</span>
          </Stat>

          <div className="flex items-center gap-1.5">
            <Link
              to={onDev ? '/' : '/dev'}
              className="mono cursor-pointer rounded-lg px-2 py-1 text-[11px] text-ink-secondary transition hair hover:bg-fill-hover"
            >
              {onDev ? 'console' : 'dev'}
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              className="grid h-[26px] w-[26px] cursor-pointer place-items-center rounded-lg text-ink-secondary transition hair hover:bg-fill-hover"
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="hidden flex-col leading-none md:flex">
      <span className="mb-[3px] text-[9.5px] text-ink-muted">{label}</span>
      <span className="text-[11.5px]">{children}</span>
    </div>
  );
}

function PinIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-on-accent)"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}
