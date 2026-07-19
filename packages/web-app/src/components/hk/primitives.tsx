import { useEffect, useState, type ReactNode, type ComponentType, type ReactElement } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils.js';
import type { Project } from '@/lib/types.js';
import type { Status } from '@hookorama/client';

function kpiTone(tone?: 'primary' | 'accent' | 'destructive'): string {
  if (tone === 'accent') return 'text-accent';
  if (tone === 'destructive') return 'text-destructive';
  return 'text-primary';
}

export function Panel({
  title,
  right,
  children,
  className,
  dataTestId,
}: {
  readonly title?: string;
  readonly right?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly dataTestId?: string;
}): ReactElement {
  return (
    <div className={cn('border border-border bg-panel', className)} data-testid={dataTestId}>
      {title && (
        <div className="flex items-center border-b border-border px-3 py-1.5">
          <div className="text-xs uppercase tracking-widest text-primary">▚ {title}</div>
          <div className="flex-1" />
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatusDot({ status }: { readonly status: Status }): ReactElement {
  let color: string;
  switch (status) {
    case 'idle':
      color = 'bg-muted-foreground';
      break;
    case 'thinking':
    case 'waiting-input':
      color = 'bg-accent';
      break;
    case 'running-tool':
      color = 'bg-primary shadow-[0_0_6px] shadow-primary';
      break;
    case 'done':
      color = 'bg-dim';
      break;
    case 'error':
      color = 'bg-destructive';
      break;
    default:
      color = 'bg-muted-foreground';
  }
  return <span className={cn('inline-block h-2 w-2', color)} data-testid={`status-dot-${status}`} />;
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'primary',
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?: ReactNode;
  readonly tone?: 'primary' | 'accent' | 'destructive';
}): ReactElement {
  const color = kpiTone(tone);
  return (
    <div className="border border-border bg-panel p-3" data-testid="kpi">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground" data-testid="kpi-label">{label}</div>
      <div className={cn('mt-1 font-mono text-2xl', color)} data-testid="kpi-value">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Ascii({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="select-none text-dim">{children}</span>;
}

export function ProjectTag({ project, size = 'sm' }: { readonly project?: Project | undefined; readonly size?: 'sm' | 'xs' }): ReactElement {
  if (!project) return <span className="text-xs text-dim">—</span>;
  const pad = size === 'xs' ? 'px-1 text-[10px]' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span
      className={cn('inline-flex items-center gap-1 border border-current font-mono uppercase tracking-wider', pad)}
      style={{ color: project.color, borderColor: project.color }}
      data-testid="project-tag"
    >
      <span className="inline-block h-1.5 w-1.5" style={{ background: project.color }} />
      {project.name}
    </span>
  );
}

// Client-only guard for volatile values (tick counters, cost totals, times) that
// would hydration-mismatch otherwise.
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}

export function Volatile({ children, fallback = '—' }: { readonly children: ReactNode; readonly fallback?: ReactNode }): ReactNode {
  const hydrated = useHydrated();
  return <>{hydrated ? children : fallback}</>;
}

export function ShortcutTile({
  to,
  icon: Icon,
  title,
  desc,
}: {
  readonly to: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly title: string;
  readonly desc: string;
}): ReactElement {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 border border-border bg-panel p-3 hover:border-primary"
      data-testid={`shortcut-${title}`}
    >
      <Icon className="mt-0.5 h-4 w-4 text-primary" />
      <div className="flex-1">
        <div className="text-xs uppercase tracking-widest text-primary">{title}</div>
        <div className="mt-1 text-[10px] text-dim">{desc}</div>
      </div>
    </Link>
  );
}

export function KpiTile({
  to,
  label,
  value,
  sub,
  tone,
  hint,
  icon: Icon,
}: {
  readonly to: string;
  readonly label: string;
  readonly value: ReactNode;
  readonly sub?: ReactNode;
  readonly tone?: 'accent' | 'destructive';
  readonly hint?: string;
  readonly icon?: ComponentType<{ className?: string }>;
}): ReactElement {
  const color = kpiTone(tone);
  return (
    <Link to={to} className="group block border border-border bg-panel p-3 hover:border-primary" data-testid="kpi-tile">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground" data-testid="kpi-tile-label">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-2xl', color)} data-testid="kpi-tile-value">{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
      {hint && <div className="mt-0.5 text-[10px] text-dim">&gt; {hint}</div>}
    </Link>
  );
}
