import { useMemo, type ReactElement } from 'react';
import { AlertTriangle, Cpu, Folder, GitBranch, MessageSquareWarning } from 'lucide-react';
import { useHookoramaStore } from '@/lib/store.js';
import { Panel, KpiTile, ShortcutTile, StatusDot, ProjectTag, Volatile } from '@/components/hk/primitives.js';

export function Overview(): ReactElement {
  const agents = useHookoramaStore((state) => state.agents);
  const projects = useHookoramaStore((state) => state.projects);
  const notifications = useHookoramaStore((state) => state.notifications);

  const waitingAgents = agents.filter((a) => a.status === 'waiting-input');
  const errorAgents = agents.filter((a) => a.status === 'error');
  const runningAgents = agents.filter((a) => a.status === 'running-tool' || a.status === 'thinking');
  const pending = notifications.filter((n) => !n.ack);

  const projByAgent = useMemo(
    () => new Map(agents.map((a) => [a.id, projects.find((p) => p.id === a.projectId)])),
    [agents, projects],
  );
  const activeProjects = useMemo(
    () => projects.filter((p) => agents.some((a) => a.projectId === p.id && (a.status === 'running-tool' || a.status === 'thinking'))).length,
    [agents, projects],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-4 gap-3">
        <KpiTile
          to="/"
          label="attention"
          tone="destructive"
          value={<Volatile fallback="—">{waitingAgents.length + errorAgents.length}</Volatile>}
          sub={`${waitingAgents.length} waiting · ${errorAgents.length} error`}
          hint="see queue below"
        />
        <KpiTile
          to="/agents"
          label="running"
          value={<Volatile fallback="—">{runningAgents.length}</Volatile>}
          sub={`of ${agents.length} agents`}
          hint="open agent tree"
        />
        <KpiTile
          to="/projects"
          label="projects"
          icon={Folder}
          value={projects.length}
          sub={
            <>
              <Volatile fallback="—">{activeProjects}</Volatile> active
            </>
          }
          hint="open projects"
        />
        <KpiTile
          to="/analytics"
          label="notifications"
          tone="accent"
          icon={AlertTriangle}
          value={<Volatile fallback="—">{pending.length}</Volatile>}
          sub="cost · tools · errors"
          hint="open analytics"
        />
      </div>

      <Panel
        title={`attention required · ${waitingAgents.length + errorAgents.length}`}
        right={<span className="text-[10px] text-muted-foreground">attention queue</span>}
      >
        <div className="max-h-[520px] divide-y divide-border overflow-auto">
          {waitingAgents.length === 0 && errorAgents.length === 0 && (
            <div className="p-6 text-center text-xs text-dim">&gt; all clear. no agent is blocked.</div>
          )}
          {[...waitingAgents, ...errorAgents].map((a) => {
            const project = projByAgent.get(a.id);
            const isErr = a.status === 'error';
            return (
              <div
                key={a.id}
                className="group flex w-full items-start gap-3 p-3 hover:bg-muted/30"
              >
                <StatusDot status={a.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isErr ? 'text-destructive' : 'text-accent'}>
                      {isErr ? 'ERROR' : 'AWAITING INPUT'}
                    </span>
                    <span className="text-primary">{a.name}</span>
                    <span className="text-dim">·</span>
                    <ProjectTag project={project} />
                    <span className="text-dim">·</span>
                    <span className="text-muted-foreground">{a.origin}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1 truncate text-xs text-foreground">
                    {isErr ? (
                      <>
                        <AlertTriangle className="h-3 w-3 shrink-0 text-destructive" />
                        {a.currentTask ?? 'task failed'}
                      </>
                    ) : (
                      <>
                        <MessageSquareWarning className="h-3 w-3 shrink-0 text-accent" />
                        {a.waitingReason ?? 'input required'}
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-[10px] text-dim">
                    pid {a.pid} · session {a.sessionId} · {a.model ?? '-'} · ${a.metrics.cost.toFixed(3)} · {a.metrics.tasks} tasks
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-3 gap-3">
        <ShortcutTile to="/agents" icon={GitBranch} title="agent tree" desc="group, filter, expand by project · session · origin" />
        <ShortcutTile to="/projects" icon={Folder} title="projects" desc="per-folder rollup: agents · tasks · cost" />
        <ShortcutTile to="/processes" icon={Cpu} title="processes" desc="pid tree · agent-linked processes annotated" />
      </div>
    </div>
  );
}
