import { useRouterState, Link, Outlet } from '@tanstack/react-router';
import { useEffect, type ComponentType, type ReactElement } from 'react';
import { SupervisorClient } from '@hookorama/client';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CircleDollarSign,
  Cpu,
  Folder,
  Gauge,
  GitBranch,
  List,
  MessageSquareWarning,
  Pause,
  Play,
  TerminalSquare,
  X,
  Zap,
} from 'lucide-react';
import { useHookoramaStore } from '@/lib/store.js';
import { useTicker } from '@/lib/ticker.js';
import { ProjectTag, Volatile } from '@/components/hk/primitives.js';
import { TerminalDock } from '@/components/hk/terminal-dock.js';
import { Toaster } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover.js';
import type { NotificationKind } from '@/lib/types.js';

const NAV: Array<{ to: string; label: string; icon: ComponentType<{ className?: string }>; exact?: boolean }> = [
  { to: '/', label: 'overview', icon: Activity, exact: true },
  { to: '/projects', label: 'projects', icon: Folder },
  { to: '/agents', label: 'agents', icon: GitBranch },
  { to: '/processes', label: 'processes', icon: Cpu },
  { to: '/events', label: 'events', icon: List },
  { to: '/analytics', label: 'analytics', icon: BarChart3 },
];

const kindIcon: Record<NotificationKind, ComponentType<{ className?: string }>> = {
  'waiting-input': MessageSquareWarning,
  error: AlertTriangle,
  'cost-spike': CircleDollarSign,
  stalled: Zap,
  approval: MessageSquareWarning,
};

function NotificationPopover() {
  const notifications = useHookoramaStore((state) => state.notifications);
  const agents = useHookoramaStore((state) => state.agents);
  const projects = useHookoramaStore((state) => state.projects);
  const ackNotification = useHookoramaStore((state) => state.ackNotification);
  const clearAcked = useHookoramaStore((state) => state.clearAcked);
  const focusAgent = useHookoramaStore((state) => state.focusAgent);

  const pending = notifications.filter((n) => !n.ack).toReversed();
  const criticalCount = pending.filter((n) => n.severity === 'critical').length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={
            'relative flex items-center gap-1.5 border px-2 py-0.5 ' +
            (criticalCount > 0
              ? 'animate-pulse border-destructive text-destructive'
              : pending.length > 0
                ? 'border-accent text-accent'
                : 'border-border text-muted-foreground hover:text-foreground')
          }
        >
          <Bell className="h-3.5 w-3.5" />
          <Volatile fallback="0">{pending.length}</Volatile>
          {criticalCount > 0 && (
            <span className="absolute -right-1 -top-1 h-2 w-2 bg-destructive shadow-[0_0_6px] shadow-destructive" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 border-border bg-panel p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs uppercase tracking-widest">
          <span className="text-primary">▚ notifications</span>
          <button onClick={clearAcked} className="text-[10px] text-dim hover:text-foreground">
            clear acked
          </button>
        </div>
        <div className="max-h-[420px] divide-y divide-border overflow-auto">
          {pending.length === 0 && <div className="p-6 text-center text-xs text-dim">&gt; inbox zero</div>}
          {pending.map((n) => {
            const Icon = kindIcon[n.kind] ?? Bell;
            const agent = agents.find((a) => a.id === n.agentId);
            const project = projects.find((p) => p.id === n.projectId);
            const tone =
              n.severity === 'critical'
                ? 'text-destructive'
                : n.severity === 'warn'
                  ? 'text-accent'
                  : 'text-muted-foreground';
            return (
              <div key={n.id} className="flex items-start gap-2 p-2 text-xs hover:bg-muted/30">
                <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${tone}`} />
                <button
                  onClick={() => {
                    if (agent) focusAgent(agent.id);
                    ackNotification(n.id);
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <ProjectTag project={project} size="xs" />
                    <span className="truncate text-primary">{agent?.name ?? n.agentId}</span>
                  </div>
                  <div className="truncate text-foreground normal-case tracking-normal">{n.message}</div>
                  <div className="text-[10px] text-dim">
                    <Volatile fallback="--:--:--">
                      {new Date(n.ts).toISOString().slice(11, 19)}
                    </Volatile>{' '}
                    · {n.kind}
                  </div>
                </button>
                <button onClick={() => ackNotification(n.id)} className="p-0.5 text-dim hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function StatusControls() {
  const agents = useHookoramaStore((state) => state.agents);
  const tickCount = useHookoramaStore((state) => state.tickCount);
  const paused = useHookoramaStore((state) => state.paused);
  const tickSpeed = useHookoramaStore((state) => state.tickSpeed);
  const dockOpen = useHookoramaStore((state) => state.dockOpen);
  const togglePause = useHookoramaStore((state) => state.togglePause);
  const setSpeed = useHookoramaStore((state) => state.setSpeed);
  const toggleScanlines = useHookoramaStore((state) => state.toggleScanlines);
  const toggleDock = useHookoramaStore((state) => state.toggleDock);

  const activeAgents = agents.filter((a) => a.status === 'running-tool' || a.status === 'thinking').length;
  const totalCost = agents.reduce((n, a) => n + a.metrics.cost, 0);

  return (
    <>
      <span className="text-muted-foreground">
        tick <span className="text-foreground"><Volatile fallback="0">{tickCount}</Volatile></span>
      </span>
      <span className="text-muted-foreground">
        agents <span className="text-primary">{activeAgents}</span>/{agents.length}
      </span>
      <span className="text-muted-foreground">
        cost <span className="text-accent"><Volatile fallback="$0.0000">{`$${totalCost.toFixed(4)}`}</Volatile></span>
      </span>
      <button onClick={togglePause} className="flex items-center gap-1 hover:text-primary">
        {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
        {paused ? 'resume' : 'pause'}
      </button>
      <div className="flex items-center gap-1">
        <Gauge className="h-3 w-3" />
        <select
          value={tickSpeed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="border border-border bg-panel px-1 py-0.5 text-xs"
        >
          <option value={2500}>0.4x</option>
          <option value={1200}>1x</option>
          <option value={600}>2x</option>
          <option value={300}>4x</option>
        </select>
      </div>
      <button
        onClick={toggleDock}
        className={
          'flex items-center gap-1 border px-1.5 py-0.5 ' +
          (dockOpen ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')
        }
        title="toggle terminal (Ctrl+`)"
      >
        <TerminalSquare className="h-3.5 w-3.5" />
      </button>
      <button onClick={toggleScanlines} className="hover:text-primary">
        crt
      </button>
    </>
  );
}

const CONNECTION_LABELS: Record<string, string> = {
  connected: 'live',
  disconnected: 'offline',
  error: 'error',
  mock: 'mock stream',
};

const CONNECTION_COLORS: Record<string, string> = {
  connected: 'text-accent',
  disconnected: 'text-destructive',
  error: 'text-destructive',
  mock: 'text-muted-foreground',
};

function ConnectionBadge() {
  const connection = useHookoramaStore((state) => state.connection);
  const label = CONNECTION_LABELS[connection] ?? 'unknown';
  const color = CONNECTION_COLORS[connection] ?? 'text-muted-foreground';

  return <span className={color}>● {label}</span>;
}

function Header() {
  return (
    <header className="flex h-9 shrink-0 items-center gap-4 border-b border-border px-3 text-xs uppercase tracking-widest">
      <span className="font-bold text-primary">▚ HOOKORAMA</span>
      <span className="text-muted-foreground">v0.1.0</span>
      <ConnectionBadge />
      <div className="flex-1" />
      <NotificationPopover />
      <StatusControls />
    </header>
  );
}

function Sidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const dockOpen = useHookoramaStore((state) => state.dockOpen);
  const toggleDock = useHookoramaStore((state) => state.toggleDock);

  return (
    <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-border p-2">
      {NAV.map(({ to, label, icon: Icon, exact }) => {
        const active = exact ? path === to : path.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={
              'flex items-center gap-2 border px-2 py-1.5 text-xs uppercase tracking-wider ' +
              (active
                ? 'border-primary bg-primary/5 text-primary'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
      <div className="flex-1" />
      <button
        onClick={toggleDock}
        className={
          'flex items-center gap-2 border px-2 py-1.5 text-xs uppercase tracking-wider ' +
          (dockOpen
            ? 'border-primary bg-primary/5 text-primary'
            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground')
        }
      >
        <TerminalSquare className="h-3.5 w-3.5" /> terminal
      </button>
      <div className="border-t border-border pt-2 mt-2 text-[10px] leading-relaxed text-dim">
        &gt; run <span className="text-primary">hookorama attach</span> in any agent to stream real hooks.
      </div>
    </aside>
  );
}

export function Shell(): ReactElement {
  useTicker();
  const scanlines = useHookoramaStore((state) => state.scanlines);
  const setConnection = useHookoramaStore((state) => state.setConnection);
  const syncSnapshot = useHookoramaStore((state) => state.syncSnapshot);
  const applyEvent = useHookoramaStore((state) => state.applyEvent);
  const setProcesses = useHookoramaStore((state) => state.setProcesses);

  useEffect(() => {
    const client = new SupervisorClient({
      httpUrl: 'http://127.0.0.1:7354',
      wsUrl: 'ws://127.0.0.1:7354/ws',
    });

    client.setOnOpen(() => setConnection('connected'));
    client.setOnClose(() => setConnection('disconnected'));
    client.setOnError(() => setConnection('error'));
    client.setOnSnapshot((snapshot) => syncSnapshot(snapshot));
    client.setOnEvent((event) => applyEvent(event));

    void (async () => {
      try {
        await client.start();
        const processes = await client.fetchProcesses();
        setProcesses(processes);
      } catch {
        setConnection('error');
      }
    })();

    return () => {
      client.stop();
    };
  }, [setConnection, syncSnapshot, applyEvent, setProcesses]);

  return (
    <div className={`flex h-screen min-h-screen flex-col ${scanlines ? 'scanlines' : ''}`}>
      <Header />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-auto">
            <Outlet />
          </main>
          <TerminalDock />
          <Toaster position="bottom-right" richColors />
        </div>
      </div>
    </div>
  );
}
