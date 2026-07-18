import { useMemo, useState, type ReactElement } from 'react';
import { useHookoramaStore } from '@/lib/store.js';
import type { Agent, Project } from '@/lib/types.js';
import { Panel, Kpi, ProjectTag } from '@/components/hk/primitives.js';

type Range = '24h' | '7d' | '30d';

function bucketCount(r: Range): number {
  if (r === '24h') return 60;
  if (r === '7d') return 60 * 7;
  return 60 * 30;
}

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
  readonly rows: Rollup[];
  readonly filter: Set<string>;
  readonly setFilter: (fn: (prev: Set<string>) => Set<string>) => void;
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
            <button type="button"
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

function TopAgents({ agents }: { readonly agents: Agent[] }) {
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

function SkillTable({ skills }: { readonly skills: Record<string, number> }) {
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

function ModelTable({ models }: { readonly models: Record<string, { calls: number; cost: number }> }) {
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

interface UsageRow {
  id: number;
  ts: number;
  t: string;
  tasks: number;
  tools: number;
  cost: number;
  errors: number;
  active: number;
}

function UsageTable({ series }: { readonly series: UsageRow[] }) {
  return (
    <Panel title={`usage over time · ${series.length}`}>
      <div className="max-h-64 overflow-auto p-2 text-xs">
        <div className="mb-1 grid grid-cols-[100px_50px_50px_60px_40px_40px] gap-2 border-b border-border pb-1 text-dim">
          <span>t</span>
          <span className="text-right">tasks</span>
          <span className="text-right">tools</span>
          <span className="text-right">cost</span>
          <span className="text-right">err</span>
          <span className="text-right">act</span>
        </div>
        {series.map((b) => (
          <div key={b.id} className="grid grid-cols-[100px_50px_50px_60px_40px_40px] gap-2 py-0.5">
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

function formatBucketTime(ts: number): string {
  return new Date(ts).toISOString().slice(5, 16).replace('T', ' ');
}

function emptyProjectMetrics() {
  return { tasks: 0, toolCalls: 0, cost: 0, active: 0, errors: 0 };
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

  const nBuckets = useMemo(() => bucketCount(range), [range]);
  const slicedBuckets = useMemo(() => buckets.slice(-nBuckets), [buckets, nBuckets]);

  const series: UsageRow[] = useMemo(
    () =>
      slicedBuckets.map((b) => ({
        id: b.id,
        ts: b.ts,
        t: formatBucketTime(b.ts),
        tasks: b.tasks,
        tools: b.toolCalls,
        cost: Number(b.cost.toFixed(4)),
        errors: b.errors,
        active: b.active,
      })),
    [slicedBuckets],
  );

  const projectSeries: UsageRow[] = useMemo(
    () =>
      projectFilter.size === 0
        ? []
        : slicedBuckets.map((b) => {
            const p = emptyProjectMetrics();
            for (const pid of projectFilter) {
              const pm = b.byProject[pid];
              if (!pm) continue;
              p.tasks += pm.tasks;
              p.toolCalls += pm.toolCalls;
              p.cost += pm.cost;
              p.active += pm.active;
              p.errors += pm.errors;
            }
            return {
              id: b.id,
              ts: b.ts,
              t: formatBucketTime(b.ts),
              tasks: p.tasks,
              tools: p.toolCalls,
              cost: Number(p.cost.toFixed(4)),
              errors: p.errors,
              active: p.active,
            };
          }),
    [slicedBuckets, projectFilter],
  );

  const kpiSeries = projectFilter.size > 0 ? projectSeries : series;
  const firstBucket = kpiSeries[0];
  const lastBucket = kpiSeries.at(-1);
  const totalTasks = firstBucket && lastBucket ? lastBucket.tasks - firstBucket.tasks : 0;
  const totalCost = firstBucket && lastBucket ? lastBucket.cost - firstBucket.cost : 0;
  const totalCalls = firstBucket && lastBucket ? lastBucket.tools - firstBucket.tools : 0;
  const activeAgents = lastBucket?.active ?? 0;

  const rollupProjects = projectFilter.size === 0 ? projects : projects.filter((p) => projectFilter.has(p.id));
  const projRollup = useMemo(
    () =>
      rollupProjects
        .map((p) => {
          const own = agents.filter((a) => a.projectId === p.id);
          const firstPm = slicedBuckets[0]?.byProject[p.id] ?? emptyProjectMetrics();
          const lastPm = slicedBuckets.at(-1)?.byProject[p.id] ?? emptyProjectMetrics();
          return {
            project: p,
            agents: own.length,
            running: lastPm.active,
            errors: lastPm.errors,
            tasks: lastPm.tasks - firstPm.tasks,
            tools: lastPm.toolCalls - firstPm.toolCalls,
            cost: lastPm.cost - firstPm.cost,
          };
        })
        .sort((a, b) => b.cost - a.cost),
    [rollupProjects, agents, slicedBuckets],
  );

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
          <button type="button"
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
        <button type="button"
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
            <button type="button"
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
        <Kpi label={projectFilter.size ? `cost · ${projectFilter.size} proj` : 'total cost'} value={`$${totalCost.toFixed(3)}`} />
        <Kpi label={projectFilter.size ? `calls · ${projectFilter.size} proj` : 'tool calls'} value={totalCalls} />
        <Kpi label={projectFilter.size ? `active · ${projectFilter.size} proj` : 'active agents'} value={activeAgents} />
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
