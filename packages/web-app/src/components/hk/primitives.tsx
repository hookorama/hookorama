import { useEffect, useState, type ReactNode, type ComponentType, type ReactElement } from 'react';
import { Link } from '@tanstack/react-router';
import { cn } from '@/lib/utils.js';
import type { Project } from '@/lib/types.js';
import type { Status } from '@hookorama/client';

export function Panel({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <div className={cn('border border-border bg-panel', className)}>
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

export function StatusDot({ status }: { status: Status }): ReactElement {
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
  return <span className={cn('inline-block h-2 w-2', color)} />;
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'primary',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'primary' | 'accent' | 'destructive';
}): ReactElement {
  const color =
    tone === 'accent' ? 'text-accent' : tone === 'destructive' ? 'text-destructive' : 'text-primary';
  return (
    <div className="border border-border bg-panel p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn('mt-1 font-mono text-2xl', color)}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function Ascii({ children }: { children: ReactNode }): ReactElement {
  return <span className="select-none text-dim">{children}</span>;
}

export function ProjectTag({ project, size = 'sm' }: { project?: Project | undefined; size?: 'sm' | 'xs' }): ReactElement {
  if (!project) return <span className="text-xs text-dim">—</span>;
  const pad = size === 'xs' ? 'px-1 text-[10px]' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span
      className={cn('inline-flex items-center gap-1 border border-current font-mono uppercase tracking-wider', pad)}
      style={{ color: project.color, borderColor: project.color }}
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

export function Volatile({ children, fallback = '—' }: { children: ReactNode; fallback?: ReactNode }): ReactNode {
  const hydrated = useHydrated();
  return <>{hydrated ? children : fallback}</>;
}

export function ShortcutTile({
  to,
  icon: Icon,
  title,
  desc,
}: {
  to: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}): ReactElement {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 border border-border bg-panel p-3 hover:border-primary"
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
  to: string;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'accent' | 'destructive';
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
}): ReactElement {
  const color =
    tone === 'accent' ? 'text-accent' : tone === 'destructive' ? 'text-destructive' : 'text-primary';
  return (
    <Link to={to} className="group block border border-border bg-panel p-3 hover:border-primary">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-2xl', color)}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-muted-foreground">{sub}</div>}
      {hint && <div className="mt-0.5 text-[10px] text-dim">&gt; {hint}</div>}
    </Link>
  );
}
