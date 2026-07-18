import { useMemo, useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { useHookoramaStore, selectProcessTree } from '@/lib/store.js';
import type { Process } from '@/lib/types.js';
import { Panel, Ascii } from '@/components/hk/primitives.js';

const TYPE_COLOR: Record<Process['type'], string> = {
  agent: 'text-primary',
  tool: 'text-info',
  ide: 'text-accent',
  system: 'text-muted-foreground',
};

function PNode({
  node,
  tree,
  prefix,
  isLast,
  onSelect,
  selectedPid,
  q,
  tf,
}: {
  readonly node: Process;
  readonly tree: Map<number, Process[]>;
  readonly prefix: string;
  readonly isLast: boolean;
  readonly onSelect: (pid: number) => void;
  readonly selectedPid: number | null;
  readonly q: string;
  readonly tf: string;
}) {
  const kids = tree.get(node.pid) ?? [];
  const branch = isLast ? '└─ ' : '├─ ';
  const childPrefix = prefix + (isLast ? '   ' : '│  ');
  const matches = (!q || String(node.pid).includes(q) || node.cmd.includes(q)) && (tf === 'all' || node.type === tf);
  if (!matches && kids.length === 0) return null;
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          onSelect(node.pid);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(node.pid);
          }
        }}
        className={
          'grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 cursor-pointer hover:bg-muted/40 ' +
          (selectedPid === node.pid ? 'bg-primary/10' : '')
        }
      >
        <span className="truncate">
          <Ascii>
            {prefix}
            {branch}
          </Ascii>
          <span className={TYPE_COLOR[node.type]}>{node.cmd}</span>
        </span>
        <span className="text-dim">{node.pid}</span>
        <span className="text-dim">{node.user}</span>
        <span className="text-dim">{node.tty ?? '-'}</span>
        <span className={TYPE_COLOR[node.type]}>{node.type}</span>
      </div>
      {kids.map((c, i) => (
        <PNode
          key={c.pid}
          node={c}
          tree={tree}
          prefix={childPrefix}
          isLast={i === kids.length - 1}
          onSelect={onSelect}
          selectedPid={selectedPid}
          q={q}
          tf={tf}
        />
      ))}
    </>
  );
}

export function Processes(): ReactElement {
  return <ProcessesPage />;
}

function ProcessesPage() {
  const processes = useHookoramaStore((state) => state.processes);
  const agents = useHookoramaStore((state) => state.agents);
  const tree = useMemo(() => selectProcessTree({ processes }), [processes]);
  const [selPid, setSelPid] = useState<number | null>(processes[0]?.pid ?? null);
  const [q, setQ] = useState('');
  const [tf, setTf] = useState('all');

  const pidSet = new Set(processes.map((p) => p.pid));
  const roots = processes
    .filter((p) => p.ppid === 0 || p.ppid === 1 || !pidSet.has(p.ppid))
    .filter((p, i, arr) => arr.findIndex((x) => x.pid === p.pid) === i);
  const selected = processes.find((p) => p.pid === selPid);
  const selectedAgent = selected?.agentId ? agents.find((a) => a.id === selected.agentId) : null;

  return (
    <div className="grid h-full grid-cols-[1fr_360px] gap-3 p-4">
      <Panel
        title="os process tree"
        right={
          <div className="flex gap-2 text-xs">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="&gt; search pid/cmd"
              className="w-40 border border-border bg-background px-2 py-0.5 text-xs"
            />
            <select
              value={tf}
              onChange={(e) => setTf(e.target.value)}
              className="border border-border bg-background px-1 text-xs"
            >
              <option value="all">all</option>
              <option value="agent">agent</option>
              <option value="tool">tool</option>
              <option value="ide">ide</option>
              <option value="system">system</option>
            </select>
          </div>
        }
      >
        <div className="max-h-[calc(100vh-160px)] overflow-auto p-3 font-mono text-xs">
          <div className="mb-1 grid grid-cols-[1fr_60px_60px_60px_60px] gap-2 border-b border-border pb-1 text-dim">
            <span>tree / cmd</span>
            <span>pid</span>
            <span>user</span>
            <span>tty</span>
            <span>type</span>
          </div>
          {roots.map((r, i) => (
            <PNode
              key={r.pid}
              node={r}
              tree={tree}
              prefix=""
              isLast={i === roots.length - 1}
              onSelect={setSelPid}
              selectedPid={selPid}
              q={q}
              tf={tf}
            />
          ))}
        </div>
      </Panel>

      <Panel title={selected ? `pid: ${selected.pid}` : 'select a process'}>
        {selected ? (
          <div className="space-y-3 p-3 text-xs">
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-dim">pid</span>
              <span>{selected.pid}</span>
              <span className="text-dim">ppid</span>
              <span>{selected.ppid}</span>
              <span className="text-dim">cmd</span>
              <span className="truncate">{selected.cmd}</span>
              <span className="text-dim">user</span>
              <span>{selected.user}</span>
              <span className="text-dim">tty</span>
              <span>{selected.tty ?? '-'}</span>
              <span className="text-dim">type</span>
              <span className={TYPE_COLOR[selected.type]}>{selected.type}</span>
              {selectedAgent && (
                <>
                  <span className="text-dim">agent</span>
                  <span className="text-primary">{selectedAgent.name}</span>
                </>
              )}
            </div>
            <div className="flex gap-2 pt-1">
              {selected.type === 'ide' && (
                <button type="button"
                  onClick={() => toast('→ focus VS Code')}
                  className="border border-border px-2 py-1 hover:bg-muted"
                >
                  &gt; focus vscode
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-dim">&gt; click a process</div>
        )}
      </Panel>
    </div>
  );
}
