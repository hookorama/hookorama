import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ChevronRight,
  ChevronDown,
  ArrowDownAZ,
  ArrowDown10,
  Folder,
  GitBranch,
  Layers,
  Eye,
  EyeOff,
  Search,
} from 'lucide-react';
import { useHookoramaStore, selectAgentTree } from '@/lib/store.js';
import { Panel, StatusDot, Ascii, ProjectTag, Volatile } from '@/components/hk/primitives.js';
import type { Agent, NodeType, Origin, Project, Status } from '@/lib/types.js';

export function Agents(): ReactElement {
  return (
    <div className="h-full p-4">
      <AgentsPage />
    </div>
  );
}

type GroupBy = 'project' | 'session' | 'origin' | 'none';
type SortBy = 'name' | 'cost' | 'updated' | 'tasks';
const ALL_STATUS: Status[] = ['thinking', 'running-tool', 'waiting-input', 'done', 'error', 'idle'];
const ALL_TYPES: NodeType[] = ['agent', 'subagent', 'tool'];
const ALL_ORIGINS: Origin[] = ['terminal', 'vscode', 'jetbrains', 'ci'];

function agentTypeColor(t: NodeType): string {
  if (t === 'agent') return 'text-primary';
  if (t === 'subagent') return 'text-accent';
  return 'text-info';
}

type Group = { key: string; label: string; color?: string; roots: Agent[] };

function filterAgent(
  a: Agent,
  filters: {
    statusFilter: Set<Status>;
    typeFilter: Set<NodeType>;
    originFilter: Set<Origin>;
    projectFilter: Set<string>;
    showTools: boolean;
    query: string;
  },
): boolean {
  if (!filters.statusFilter.has(a.status)) return false;
  if (!filters.typeFilter.has(a.type)) return false;
  if (!filters.originFilter.has(a.origin)) return false;
  if (!filters.projectFilter.has(a.projectId)) return false;
  if (!filters.showTools && a.type === 'tool') return false;
  if (filters.query) {
    const q = filters.query.toLowerCase();
    if (
      a.name.toLowerCase().includes(q) ||
      a.id.includes(filters.query) ||
      (a.currentTask ?? '').toLowerCase().includes(q)
    )
      return true;
    return false;
  }
  return true;
}

function groupAgents(roots: Agent[], groupBy: GroupBy, sortBy: SortBy, projMap: Map<string, Project>): Group[] {
  const map = new Map<string, Group>();
  const put = (key: string, label: string, color: string | undefined, a: Agent) => {
    let group = map.get(key);
    if (!group) {
      group = color === undefined ? { key, label, roots: [] } : { key, label, color, roots: [] };
      map.set(key, group);
    }
    group.roots.push(a);
  };
  for (const r of roots) {
    if (groupBy === 'project') {
      const p = projMap.get(r.projectId);
      put(r.projectId, p?.name ?? 'unknown', p?.color, r);
    } else if (groupBy === 'session') {
      put(r.sessionId, r.sessionId, undefined, r);
    } else if (groupBy === 'origin') {
      put(r.origin, r.origin, undefined, r);
    } else {
      put('all', 'all agents', undefined, r);
    }
  }
  const arr = Array.from(map.values());
  for (const g of arr) g.roots.sort(sorter(sortBy));
  return arr.sort((a, b) => a.label.localeCompare(b.label));
}

function toggleSet<T>(value: T, set: Set<T>): Set<T> {
  const n = new Set(set);
  if (n.has(value)) n.delete(value);
  else n.add(value);
  return n;
}

function collapseAllAgents(agents: Agent[]): Set<string> {
  const all = new Set<string>();
  for (const a of agents) {
    if (a.type !== 'tool') all.add(a.id);
  }
  return all;
}

function AgentsPage() {
  const agents = useHookoramaStore((state) => state.agents);
  const projects = useHookoramaStore((state) => state.projects);
  const events = useHookoramaStore((state) => state.events);
  const tree = useMemo(() => selectAgentTree({ agents }), [agents]);
  const projMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const [selectedId, setSelectedId] = useState<string | null>(agents[0]?.id ?? null);
  const [query, setQuery] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('project');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set(ALL_STATUS));
  const [typeFilter, setTypeFilter] = useState<Set<NodeType>>(new Set(ALL_TYPES));
  const [originFilter, setOriginFilter] = useState<Set<Origin>>(new Set(ALL_ORIGINS));
  const [projectFilter, setProjectFilter] = useState<Set<string>>(new Set(projects.map((p) => p.id)));

  useEffect(() => {
    setProjectFilter((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const p of projects) {
        if (!next.has(p.id)) {
          next.add(p.id);
          changed = true;
        }
      }
      for (const id of prev) {
        if (!projects.some((p) => p.id === id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [projects]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [showTools, setShowTools] = useState(true);

  const matches = useMemo(
    () =>
      (a: Agent) =>
        filterAgent(a, { statusFilter, typeFilter, originFilter, projectFilter, showTools, query }),
    [statusFilter, typeFilter, originFilter, projectFilter, showTools, query],
  );

  const roots = useMemo(
    () => (tree.get(undefined) ?? []).filter((a) => nodeVisible(a, tree, matches)),
    [tree, matches],
  );

  const groups = useMemo(() => groupAgents(roots, groupBy, sortBy, projMap), [roots, groupBy, sortBy, projMap]);

  const selected = agents.find((a) => a.id === selectedId);

  const toggle = (id: string) => {
    setCollapsed((s) => toggleSet(id, s));
  };
  const toggleGroup = (k: string) => {
    setCollapsedGroups((s) => toggleSet(k, s));
  };
  const expandAll = () => {
    setCollapsed(new Set());
  };
  const collapseAll = () => {
    setCollapsed(collapseAllAgents(agents));
  };

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-3">
      <Panel
        title="logical agent tree"
        right={
          <span className="text-[10px] text-muted-foreground">
            {roots.length} root · {agents.filter(matches).length}/{agents.length} visible
          </span>
        }
      >
        <div className="space-y-2 border-b border-border p-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 border border-border bg-background px-1.5 py-0.5">
              <Search className="h-3 w-3 text-dim" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                }}
                placeholder="search name / task / id"
                className="w-48 bg-transparent outline-none"
              />
            </div>
            <Divider />
            <Chip icon={Layers} label="group">
              <select
                value={groupBy}
                onChange={(e) => {
                  setGroupBy(e.target.value as GroupBy);
                }}
                className="border border-border bg-background px-1"
              >
                <option value="project">project</option>
                <option value="session">session</option>
                <option value="origin">origin</option>
                <option value="none">flat</option>
              </select>
            </Chip>
            <Chip icon={sortBy === 'name' ? ArrowDownAZ : ArrowDown10} label="sort">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortBy);
                }}
                className="border border-border bg-background px-1"
              >
                <option value="name">name</option>
                <option value="cost">cost ↓</option>
                <option value="tasks">tasks ↓</option>
                <option value="updated">recent</option>
              </select>
            </Chip>
            <Divider />
            <button type="button" onClick={expandAll} className="border border-border px-1.5 py-0.5 hover:bg-muted">
              expand all
            </button>
            <button type="button" onClick={collapseAll} className="border border-border px-1.5 py-0.5 hover:bg-muted">
              collapse all
            </button>
            <button type="button"
              onClick={() => {
                setShowTools((v) => !v);
              }}
              className="flex items-center gap-1 border border-border px-1.5 py-0.5 hover:bg-muted"
            >
              {showTools ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} tools
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <FilterRow
              label="status"
              all={ALL_STATUS}
              sel={statusFilter}
              setSel={setStatusFilter}
              render={(s) => (
                <span className="flex items-center gap-1">
                  <StatusDot status={s} />
                  {s}
                </span>
              )}
            />
            <FilterRow
              label="type"
              all={ALL_TYPES}
              sel={typeFilter}
              setSel={setTypeFilter}
              render={(t) => <span>{t}</span>}
            />
            <FilterRow
              label="origin"
              all={ALL_ORIGINS}
              sel={originFilter}
              setSel={setOriginFilter}
              render={(o) => <span>{o}</span>}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 text-[10px] uppercase text-dim">projects</span>
            {projects.map((p) => {
              const on = projectFilter.has(p.id);
              return (
                <button type="button"
                  key={p.id}
                  onClick={() => {
                    setProjectFilter((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id);
                      else n.add(p.id);
                      return n;
                    });
                  }}
                  className={
                    'flex items-center gap-1 border px-1.5 py-0.5 text-[10px] uppercase ' +
                    (on ? '' : 'opacity-30')
                  }
                  style={{ borderColor: p.color, color: p.color }}
                >
                  <span className="inline-block h-1.5 w-1.5" style={{ background: p.color }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-auto p-2 font-mono text-xs">
          {groups.length === 0 && <div className="p-4 text-dim">&gt; no agents match filters.</div>}
          {groups.map((g) => {
            const collapsedG = collapsedGroups.has(g.key);
            return (
              <div key={g.key} className="mb-2">
                {groupBy !== 'none' && (
                  <button type="button"
                    onClick={() => {
                      toggleGroup(g.key);
                    }}
                    className="sticky top-0 z-10 flex w-full items-center gap-2 border-b border-border bg-panel px-1 py-1 hover:bg-muted/30"
                  >
                    {collapsedG ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {groupBy === 'project' && <Folder className="h-3 w-3" style={{ color: g.color }} />}
                    {groupBy === 'session' && <GitBranch className="h-3 w-3 text-dim" />}
                    <span className="uppercase" style={{ color: g.color }}>
                      {g.label}
                    </span>
                    <span className="text-dim">· {g.roots.length}</span>
                    <span className="ml-auto text-[10px] text-dim">
                      <Volatile fallback="—">
                        ${g.roots.reduce((n, r) => n + subtreeCost(r, tree), 0).toFixed(3)}
                      </Volatile>
                    </span>
                  </button>
                )}
                {!collapsedG &&
                  g.roots.map((r, i) => (
                    <TreeNode
                      key={r.id}
                      node={r}
                      tree={tree}
                      prefix=""
                      isLast={i === g.roots.length - 1}
                      onSelect={setSelectedId}
                      selectedId={selectedId}
                      matches={matches}
                      collapsed={collapsed}
                      toggle={toggle}
                      sortBy={sortBy}
                      projMap={projMap}
                      showProject={groupBy !== 'project'}
                    />
                  ))}
              </div>
            );
          })}
        </div>
      </Panel>

      <AgentInspector selected={selected} events={events} projMap={projMap} />
    </div>
  );
}

function AgentInspector({
  selected,
  events,
  projMap,
}: {
  readonly selected: Agent | undefined;
  readonly events: import('@/lib/types.js').HookEvent[];
  readonly projMap: Map<string, Project>;
}) {
  const selectedProject = selected ? projMap.get(selected.projectId) : undefined;
  const selectedEvents = useMemo(
    () => (selected ? events.filter((e) => e.agentId === selected.id).slice(-20).toReversed() : []),
    [events, selected],
  );

  return (
    <Panel title={selected ? `inspector: ${selected.name}` : 'select an agent'}>
      {selected ? (
        <div className="space-y-3 p-3 text-xs">
          <div className="flex items-center gap-2">
            <StatusDot status={selected.status} />
            <span className="uppercase text-primary">{selected.status}</span>
            <span className="text-dim">·</span>
            <span className="uppercase text-muted-foreground">{selected.type}</span>
            <span className="ml-auto">
              <ProjectTag project={selectedProject} />
            </span>
          </div>
          {selected.currentTask && (
            <div className="border border-border p-2 text-foreground">▸ {selected.currentTask}</div>
          )}
          {selected.waitingReason && (
            <div className="border border-accent p-2 text-accent">? {selected.waitingReason}</div>
          )}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1">
            <span className="text-dim">id</span>
            <span className="truncate">{selected.id}</span>
            <span className="text-dim">project</span>
            <span className="truncate">{selectedProject?.path ?? '-'}</span>
            <span className="text-dim">branch</span>
            <span>{selectedProject?.branch ?? '-'}</span>
            <span className="text-dim">session</span>
            <span className="truncate">{selected.sessionId}</span>
            <span className="text-dim">origin</span>
            <span>{selected.origin}</span>
            <span className="text-dim">pid</span>
            <span>{selected.pid ?? '-'}</span>
            <span className="text-dim">model</span>
            <span>{selected.model ?? '-'}</span>
            <span className="text-dim">skill</span>
            <span>{selected.skill ?? '-'}</span>
          </div>
          <div className="grid grid-cols-4 border-t border-border pt-2 text-center">
            <M l="tasks" v={<Volatile fallback="—">{selected.metrics.tasks}</Volatile>} />
            <M l="calls" v={<Volatile fallback="—">{selected.metrics.toolCalls}</Volatile>} />
            <M l="cost" v={<Volatile fallback="—">${selected.metrics.cost.toFixed(3)}</Volatile>} />
            <M l="err" v={<Volatile fallback="—">{selected.metrics.errors}</Volatile>} />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {selected.status === 'waiting-input' && (
              <button type="button"
                onClick={() => { toast.success(`approved · ${selected.name}`); }}
                className="border border-accent px-2 py-1 text-accent hover:bg-accent hover:text-background"
              >
                &gt; approve
              </button>
            )}
            {selected.origin === 'vscode' && (
              <button type="button"
                onClick={() => { toast('→ VS Code', { description: `focus terminal for ${selected.name}` }); }}
                className="border border-border px-2 py-1 hover:bg-muted"
              >
                &gt; in vscode
              </button>
            )}
          </div>
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">recent events</div>
            <div className="max-h-64 overflow-auto border border-border">
              {selectedEvents.map((e) => (
                <div key={e.id} className="border-b border-border px-2 py-0.5 last:border-0">
                  <span className="text-dim">
                    <Volatile fallback="--:--:--">{new Date(e.ts).toISOString().slice(11, 19)}</Volatile>{' '}
                  </span>
                  <span className="text-accent">{e.type} </span>
                  <span>{e.summary}</span>
                </div>
              ))}
              {selectedEvents.length === 0 && <div className="p-2 text-dim">no events yet</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-xs text-dim">&gt; click a node in the tree</div>
      )}
    </Panel>
  );
}

function M({ l, v }: { readonly l: string; readonly v: ReactNode }): ReactElement {
  return (
    <div>
      <div className="text-[10px] uppercase text-muted-foreground">{l}</div>
      <div className="text-primary">{v}</div>
    </div>
  );
}

function Divider() {
  return <span className="text-dim">│</span>;
}

function Chip({
  icon: Icon,
  label,
  children,
}: {
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <span className="flex items-center gap-1 border border-border px-1.5 py-0.5">
      <Icon className="h-3 w-3 text-dim" />
      <span className="text-dim">{label}</span>
      {children}
    </span>
  );
}

function FilterRow<T extends string>({
  label,
  all,
  sel,
  setSel,
  render,
}: {
  readonly label: string;
  readonly all: T[];
  readonly sel: Set<T>;
  readonly setSel: (fn: (s: Set<T>) => Set<T>) => void;
  readonly render: (v: T) => ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[10px] uppercase text-dim">{label}</span>
      {all.map((v) => {
        const on = sel.has(v);
        return (
          <button type="button"
            key={v}
            onClick={() => {
              setSel((s) => {
                const n = new Set(s);
                if (n.has(v)) n.delete(v);
                else n.add(v);
                return n;
              });
            }}
            className={
              'border border-border px-1.5 py-0.5 text-[10px] uppercase ' +
              (on ? 'text-foreground' : 'text-dim opacity-40')
            }
          >
            {render(v)}
          </button>
        );
      })}
    </div>
  );
}

function sorter(sortBy: SortBy) {
  return (a: Agent, b: Agent) => {
    if (sortBy === 'cost') return b.metrics.cost - a.metrics.cost;
    if (sortBy === 'tasks') return b.metrics.tasks - a.metrics.tasks;
    if (sortBy === 'updated') return b.updatedAt - a.updatedAt;
    return a.name.localeCompare(b.name);
  };
}

function subtreeCost(node: Agent, tree: Map<string | undefined, Agent[]>): number {
  const kids = tree.get(node.id) ?? [];
  return node.metrics.cost + kids.reduce((n, k) => n + subtreeCost(k, tree), 0);
}

function TreeNode({
  node,
  tree,
  prefix,
  isLast,
  onSelect,
  selectedId,
  matches,
  collapsed,
  toggle,
  sortBy,
  projMap,
  showProject,
}: {
  readonly node: Agent;
  readonly tree: Map<string | undefined, Agent[]>;
  readonly prefix: string;
  readonly isLast: boolean;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | null;
  readonly matches: (a: Agent) => boolean;
  readonly collapsed: Set<string>;
  readonly toggle: (id: string) => void;
  readonly sortBy: SortBy;
  readonly projMap: Map<string, Project>;
  readonly showProject: boolean;
}) {
  const children = (tree.get(node.id) ?? []).slice().sort(sorter(sortBy));
  const isCollapsed = collapsed.has(node.id);
  const branch = isLast ? '└─ ' : '├─ ';
  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  const typeColorClass = agentTypeColor(node.type);
  const project = projMap.get(node.projectId);
  const hasChildren = children.length > 0;
  const nodeMatches = matches(node);
  const visibleChildren = children.filter((c) => nodeVisible(c, tree, matches));
  if (!nodeMatches && visibleChildren.length === 0) return null;
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          onSelect(node.id);
        }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
            keyEvent.preventDefault();
            onSelect(node.id);
          }
        }}
        className={
          'flex cursor-pointer items-center gap-2 px-1 py-0.5 hover:bg-muted/40 ' +
          (selectedId === node.id ? 'border-l-2 border-primary bg-primary/10' : '')
        }
      >
        <Ascii>
          {prefix}
          {branch}
        </Ascii>
        {hasChildren ? (
          <button type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            className="text-dim hover:text-foreground"
          >
            {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3" />
        )}
        <StatusDot status={node.status} />
        <span className={typeColorClass}>{node.name}</span>
        <span className="text-dim">[{node.type}]</span>
        {node.pid && <span className="text-dim">pid:{node.pid}</span>}
        {showProject && project && <ProjectTag project={project} size="xs" />}
        {node.currentTask && (
          <span className="max-w-[220px] truncate text-muted-foreground">▸ {node.currentTask}</span>
        )}
        <span className="ml-auto whitespace-nowrap text-muted-foreground">
          <Volatile fallback="—">
            t:{node.metrics.tasks} · c:{node.metrics.toolCalls} · ${node.metrics.cost.toFixed(3)}
          </Volatile>
        </span>
      </div>
      {!isCollapsed &&
        visibleChildren.map((c, i) => (
          <TreeNode
            key={c.id}
            node={c}
            tree={tree}
            prefix={childPrefix}
            isLast={i === visibleChildren.length - 1}
            onSelect={onSelect}
            selectedId={selectedId}
            matches={matches}
            collapsed={collapsed}
            toggle={toggle}
            sortBy={sortBy}
            projMap={projMap}
            showProject={showProject}
          />
        ))}
    </>
  );
}

function nodeVisible(a: Agent, tree: Map<string | undefined, Agent[]>, matches: (a: Agent) => boolean): boolean {
  if (matches(a)) return true;
  const kids = tree.get(a.id) ?? [];
  return kids.some((k) => nodeVisible(k, tree, matches));
}
