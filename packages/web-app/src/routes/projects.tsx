import { useMemo, type ReactElement, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Folder, GitBranch } from 'lucide-react';
import { useHookoramaStore } from '@/lib/store.js';
import { Panel, Volatile } from '@/components/hk/primitives.js';

function Stat({ l, v, tone }: { readonly l: string; readonly v: ReactNode; readonly tone?: string | undefined }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase text-muted-foreground">{l}</div>
      <div className={'font-mono text-sm ' + (tone ?? 'text-foreground')}>{v}</div>
    </div>
  );
}

export function Projects(): ReactElement {
  return <ProjectsPage />;
}

function ProjectsPage() {
  const projects = useHookoramaStore((state) => state.projects);
  const agents = useHookoramaStore((state) => state.agents);

  const rows = useMemo(
    () =>
      projects.map((p) => {
        const own = agents.filter((a) => a.projectId === p.id);
        return {
          project: p,
          total: own.length,
          running: own.filter((a) => a.status === 'running-tool' || a.status === 'thinking').length,
          waiting: own.filter((a) => a.status === 'waiting-input').length,
          errors: own.filter((a) => a.status === 'error').length,
          cost: own.reduce((n, a) => n + a.metrics.cost, 0),
          tasks: own.reduce((n, a) => n + a.metrics.tasks, 0),
          tools: own.reduce((n, a) => n + a.metrics.toolCalls, 0),
        };
      }),
    [projects, agents],
  );

  return (
    <div className="space-y-4 p-4">
      <Panel title={`projects · ${projects.length}`}>
        <div className="divide-y divide-border">
          {rows.map(({ project, total, running, waiting, errors, cost, tasks, tools: _tools }) => (
            <Link
              key={project.id}
              to="/agents"
              search={{ project: project.id }}
              className="grid grid-cols-[1fr_repeat(6,minmax(0,90px))] items-center gap-2 px-4 py-3 hover:bg-muted/30"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4" style={{ color: project.color }} />
                  <span className="font-mono uppercase text-primary">{project.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-dim">
                    <GitBranch className="h-3 w-3" />
                    {project.branch}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-dim">
                  {project.path}
                  {project.repo ? ` · ${project.repo}` : ''}
                </div>
              </div>
              <Stat l="agents" v={total} />
              <Stat
                l="run"
                v={<Volatile fallback="—">{running}</Volatile>}
                tone={running > 0 ? 'text-primary' : undefined}
              />
              <Stat
                l="wait"
                v={<Volatile fallback="—">{waiting}</Volatile>}
                tone={waiting > 0 ? 'text-accent' : undefined}
              />
              <Stat
                l="err"
                v={<Volatile fallback="—">{errors}</Volatile>}
                tone={errors > 0 ? 'text-destructive' : undefined}
              />
              <Stat l="tasks" v={<Volatile fallback="—">{tasks}</Volatile>} />
              <Stat l="cost" v={<Volatile fallback="—">${cost.toFixed(3)}</Volatile>} tone="text-accent" />
            </Link>
          ))}
        </div>
      </Panel>
      <div className="text-[10px] text-dim">
        &gt; click a project to open filtered agent tree · tool-calls totals: {rows.reduce((n, r) => n + r.tools, 0)}
      </div>
    </div>
  );
}
