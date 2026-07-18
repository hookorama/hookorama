import { useMemo, useState, type ReactElement } from 'react';
import { useHookoramaStore } from '@/lib/store.js';
import type { Agent, Project } from '@/lib/types.js';
import { Panel, Kpi, ProjectTag } from '@/components/hk/primitives.js';

type Range = '24h' | '7d' | '30d';

interface Rollup {
  project: Project;
  agents: number;
  running: number;
  errors: number;
  tasks: number;
  tools: number;
  cost: number;
}

function ProjectRollup({
  rows,
  filter,
  setFilter,
}: {
  rows: Rollup[];
  filter: Set<string>;
  setFilter: (fn: (prev: Set<string>) => Set<string>) => void;
}) {
  const maxCost = Math.max(...rows.map((r) => r.cost), 0.0001);
  return (
    <Panel title={`per-project rollup · ${rows.length}`}>
      <div className="p-2 text-xs">
        <div className="mb-1 grid grid-cols-[1fr_repeat(6,minmax(0,70px))] gap-2 border-b border-border pb-1 px-1 text-dim">
          <span>project</span>
          <span className="text-right">agents</span>
          <span className="text-right">run</span>
          <span className="text-right">tasks</span>
          <span className="text-right">tools</span>
          <span className="text-right">err</span>
          <span className="text-right">cost</span>
        </div>
        {rows.map((r) => {
          const on = filter.size === 0 || filter.has(r.project.id);
          return (
            <button
              key={r.project.id}
              onClick={() => {
                setFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(r.project.id)) next.delete(r.project.id);
                  else next.add(r.project.id);
                  return next;
                });
              }}
              className={
                'grid w-full grid-cols-[1fr_repeat(6,minmax(0,70px))] items-center gap-2 px-1 py-1 text-left hover:bg-muted/30 ' +
                (on ? '' : 'opacity-40')
              }
            >
              <div className="flex min-w-0 items-center gap-2">
                <ProjectTag project={r.project} />
                <div className="h-1 flex-1 bg-muted">
                  <div
                    className="h-full"
                    style={{ width: `${(r.cost / maxCost) * 100}%`, background: r.project.color }}
                  />
                </div>
              </div>
              <span className="text-right">{r.agents}</span>
              <span className="text-right text-primary">{r.running}</span>
              <span className="text-right">{r.tasks}</span>
              <span className="text-right text-info">{r.tools}</span>
              <span className={r.errors > 0 ? 'text-right text-destructive' : 'text-right text-dim'}>{r.errors}</span>
              <span className="text-right text-accent">${r.cost.toFixed(3)}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function TopAgents({ agents }: { agents: Agent[] }) {
  const top = [...agents]
    .sort((a, b) => b.metrics.toolCalls - a.metrics.toolCalls)
    .slice(0, 8)
    .map((a) => ({
      name: a.name,
      tasks: a.metrics.tasks,
      calls: a.metrics.toolCalls,
      cost: a.metrics.cost,
      errors: a.metrics.errors,
    }));
  return (
    <Panel title="top agents">
      <div className="p-2 text-xs">
        <div className="mb-1 grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 border-b border-border pb-1 text-dim">
          <span>agent</span>
          <span className="text-right">tasks</span>
          <span className="text-right">calls</span>
          <span className="text-right">cost</span>
          <span className="text-right">err</span>
        </div>
        {top.map((a, i) => (
          <div key={`${a.name}-${i}`} className="grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 py-1">
            <span className="truncate text-primary">{a.name}</span>
            <span className="text-right">{a.tasks}</span>
            <span className="text-right text-info">{a.calls}</span>
            <span className="text-right text-accent">${a.cost.toFixed(3)}</span>
            <span className={a.errors > 0 ? 'text-right text-destructive' : 'text-right text-dim'}>{a.errors}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SkillTable({ skills }: { skills: Record<string, number> }) {
  const arr = Object.entries(skills)
    .map(([name, usage]) => ({ name, usage }))
    .sort((a, b) => b.usage - a.usage);
  return (
    <Panel title={`skills · ${arr.length}`}>
      <div className="p-2 text-xs">
        <div className="mb-1 grid grid-cols-[1fr_80px] gap-2 border-b border-border pb-1 text-dim">
          <span>skill</span>
          <span className="text-right">tasks</span>
        </div>
        {arr.map((s) => (
          <div key={s.name} className="grid grid-cols-[1fr_80px] gap-2 py-1">
            <span className="text-primary">{s.name}</span>
            <span className="text-right">{s.usage}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function ModelTable({ models }: { models: Record<string, { calls: number; cost: number }> }) {
  const arr = Object.entries(models)
    .map(([name, { calls, cost }]) => ({ name, calls, cost }))
    .sort((a, b) => b.calls - a.calls);
  return (
    <Panel title={`models · ${arr.length}`}>
      <div className="p-2 text-xs">
        <div className="mb-1 grid grid-cols-[1fr_80px_80px] gap-2 border-b border-border pb-1 text-dim">
          <span>model</span>
          <span className="text-right">calls</span>
          <span className="text-right">cost</span>
        </div>
        {arr.map((m) => (
          <div key={m.name} className="grid grid-cols-[1fr_80px_80px] gap-2 py-1">
            <span className="text-primary">{m.name}</span>
            <span className="text-right text-info">{m.calls}</span>
            <span className="text-right text-accent">${m.cost.toFixed(3)}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UsageTable({ series }: { series: { t: string; tasks: number; tools: number; cost: number; errors: number; active: number }[] }) {
  return (
    <Panel title={`usage over time · ${series.length}`}>
      <div className="max-h-64 overflow-auto p-2 text-xs">
        <div className="mb-1 grid grid-cols-[80px_50px_50px_60px_40px_40px] gap-2 border-b border-border pb-1 text-dim">
          <span>t</span>
          <span className="text-right">tasks</span>
          <span className="text-right">tools</span>
          <span className="text-right">cost</span>
          <span className="text-right">err</span>
          <span className="text-right">act</span>
        </div>
        {series.map((b, i) => (
          <div key={i} className="grid grid-cols-[80px_50px_50px_60px_40px_40px] gap-2 py-0.5">
            <span className="text-dim">{b.t}</span>
            <span className="text-right">{b.tasks}</span>
            <span className="text-right text-info">{b.tools}</span>
            <span className="text-right text-accent">${b.cost.toFixed(3)}</span>
            <span className={b.errors > 0 ? 'text-right text-destructive' : 'text-right text-dim'}>{b.errors}</span>
            <span className="text-right">{b.active}</span>
          </div>
        ))}
        {series.length === 0 && <div className="py-4 text-center text-dim">no buckets yet</div>}
      </div>
    </Panel>
  );
}

export function Analytics(): ReactElement {
  return <AnalyticsPage />;
}

function AnalyticsPage() {
  const allAgents = useHookoramaStore((state) => state.agents);
  const projects = useHookoramaStore((state) => state.projects);
  const buckets = useHookoramaStore((state) => state.buckets);
  const skillHistory = useHookoramaStore((state) => state.skillHistory);
  const modelHistory = useHookoramaStore((state) => state.modelHistory);
  const [range, setRange] = useState<Range>('24h');
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set());

  const agents = useMemo(
    () => (projectFilter.size === 0 ? allAgents : allAgents.filter((a) => projectFilter.has(a.projectId))),
    [allAgents, projectFilter],
  );

  const nBuckets = useMemo(() => (range === '24h' ? 60 : range === '7d' ? 60 * 7 : 60 * 30), [range]);
  const series = useMemo(
    () =>
      buckets.slice(-nBuckets).map((b) => ({
        t: new Date(b.ts).toISOString().slice(11, 16),
        tasks: b.tasks,
        tools: b.toolCalls,
        cost: Number(b.cost.toFixed(4)),
        errors: b.errors,
        active: b.active,
      })),
    [buckets, nBuckets],
  );

  const projRollup = useMemo(
    () =>
      projects
        .map((p) => {
          const own = allAgents.filter((a) => a.projectId === p.id);
          return {
            project: p,
            agents: own.length,
            running: own.filter((a) => a.status === 'running-tool' || a.status === 'thinking').length,
            errors: own.reduce((n, a) => n + a.metrics.errors, 0),
            tasks: own.reduce((n, a) => n + a.metrics.tasks, 0),
            tools: own.reduce((n, a) => n + a.metrics.toolCalls, 0),
            cost: own.reduce((n, a) => n + a.metrics.cost, 0),
          };
        })
        .sort((a, b) => b.cost - a.cost),
    [projects, allAgents],
  );

  const totalTasks = agents.reduce((n, a) => n + a.metrics.tasks, 0);
  const totalCost = agents.reduce((n, a) => n + a.metrics.cost, 0);
  const totalCalls = agents.reduce((n, a) => n + a.metrics.toolCalls, 0);
  const activeAgents = agents.filter((a) => a.status === 'running-tool' || a.status === 'thinking').length;

  const freq = Math.min(100, totalCalls * 2);
  const depth = Math.min(100, agents.reduce((n, a) => n + a.metrics.tasks, 0) * 3);
  const cover = Math.min(
    100,
    (new Set(agents.map((a) => a.name)).size + Object.keys(skillHistory).length + Object.keys(modelHistory).length) * 4,
  );
  const adoption = Math.round((freq + depth + cover) / 3);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-xs uppercase tracking-widest text-muted-foreground">range:</div>
        {(['24h', '7d', '30d'] as const).map((r) => (
          <button
            key={r}
            onClick={() => {
              setRange(r);
            }}
            className={
              'border px-2 py-0.5 text-xs ' +
              (range === r ? 'border-primary text-primary' : 'border-border text-muted-foreground hover:text-foreground')
            }
          >
            {r}
          </button>
        ))}
        <div className="mx-2 h-4 w-px bg-border" />
        <div className="text-xs uppercase tracking-widest text-muted-foreground">project:</div>
        <button
          onClick={() => {
            setProjectFilter(new Set());
          }}
          className={
            'border px-2 py-0.5 text-xs ' +
            (projectFilter.size === 0
              ? 'border-primary text-primary'
              : 'border-border text-muted-foreground hover:text-foreground')
          }
        >
          all
        </button>
        {projects.map((p) => {
          const on = projectFilter.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => {
                setProjectFilter((prev) => {
                  const next = new Set(prev);
                  if (next.has(p.id)) next.delete(p.id);
                  else next.add(p.id);
                  return next;
                });
              }}
              className="border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
              style={{
                borderColor: on ? p.color : 'hsl(var(--border))',
                color: on ? p.color : undefined,
                opacity: on ? 1 : 0.6,
              }}
            >
              <span className="mr-1 inline-block h-1.5 w-1.5 align-middle" style={{ background: p.color }} />
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={projectFilter.size ? `tasks · ${projectFilter.size} proj` : 'total tasks'} value={totalTasks} />
        <Kpi label="total cost" value={`$${totalCost.toFixed(3)}`} />
        <Kpi label="tool calls" value={totalCalls} />
        <Kpi label="active agents" value={activeAgents} />
      </div>

      <ProjectRollup rows={projRollup} filter={projectFilter} setFilter={setProjectFilter} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TopAgents agents={agents} />
        <UsageTable series={series} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <SkillTable skills={skillHistory} />
        <ModelTable models={modelHistory} />
      </div>

      <Panel title="adoption score">
        <div className="flex items-center gap-4 p-3 text-xs">
          <div className="text-2xl font-mono text-primary">{adoption}</div>
          <div className="h-2 flex-1 bg-muted">
            <div className="h-full bg-primary" style={{ width: `${adoption}%` }} />
          </div>
          <div className="text-dim">freq {freq} · depth {depth} · cover {cover}</div>
        </div>
      </Panel>
    </div>
  );
}
