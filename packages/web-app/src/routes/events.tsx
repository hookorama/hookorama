import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useHookoramaStore } from '@/lib/store.js';
import type { HookEvent } from '@/lib/types.js';
import { Panel, Volatile } from '@/components/hk/primitives.js';

const TYPES = [
  'all',
  'lifecycle.start',
  'lifecycle.stop',
  'child.spawn',
  'tool.call',
  'task.begin',
  'task.end',
  'status.update',
  'cost.update',
  'skill.used',
  'model.call',
  'error',
];

function eventColor(type: string): string {
  if (type === 'error') return 'text-destructive';
  if (type.startsWith('cost')) return 'text-accent';
  if (type === 'tool.call') return 'text-info';
  return 'text-foreground';
}

export function Events(): ReactElement {
  return <EventsPage />;
}

function EventsPage() {
  const events = useHookoramaStore((state) => state.events);
  const agents = useHookoramaStore((state) => state.agents);
  const [eventType, setEventType] = useState('all');
  const [q, setQ] = useState('');
  const [follow, setFollow] = useState(true);
  const [selected, setSelected] = useState<HookEvent | null>(null);

  const filtered = useMemo(() => {
    let arr = events;
    if (eventType !== 'all') arr = arr.filter((e) => e.type === eventType);
    if (q) arr = arr.filter((e) => e.summary.includes(q) || e.agentId.includes(q) || String(e.pid ?? '').includes(q));
    return arr;
  }, [events, eventType, q]);

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (follow && parentRef.current) {
      parentRef.current.scrollTop = parentRef.current.scrollHeight;
    }
  }, [filtered.length, follow]);

  return (
    <div className="grid h-full grid-cols-[1fr_400px] gap-3 p-4">
      <Panel
        title={`hook events (${filtered.length})`}
        right={
          <div className="flex items-center gap-2 text-xs">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
              }}
              placeholder="&gt; filter"
              className="w-40 border border-border bg-background px-2 py-0.5"
            />
            <select
              value={eventType}
              onChange={(e) => {
                setEventType(e.target.value);
              }}
              className="border border-border bg-background px-1"
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => {
                  setFollow(e.target.checked);
                }}
              />{' '}
              follow
            </label>
          </div>
        }
      >
        <div ref={parentRef} className="h-[calc(100vh-160px)] overflow-auto p-2 font-mono text-xs">
          <div className="space-y-0.5">
            {filtered.map((e) => {
              const a = agents.find((x) => x.id === e.agentId);
              const cls = eventColor(e.type);
              return (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setSelected(e);
                  }}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                      keyEvent.preventDefault();
                      setSelected(e);
                    }
                  }}
                  className="grid cursor-pointer grid-cols-[100px_140px_120px_60px_1fr] gap-2 px-2 hover:bg-muted/40"
                >
                  <span className="text-dim">
                    <Volatile fallback="--:--:--.---">{new Date(e.ts).toISOString().slice(11, 23)}</Volatile>
                  </span>
                  <span className="truncate text-primary">{a?.name ?? e.agentId}</span>
                  <span className={cls}>{e.type}</span>
                  <span className="text-dim">{e.pid ?? '-'}</span>
                  <span className="truncate">{e.summary}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      <Panel title={selected ? 'event payload' : 'no event'}>
        {selected ? (
          <div className="space-y-2 p-3 text-xs">
            <div className="grid grid-cols-2 gap-y-1">
              <span className="text-dim">id</span>
              <span className="truncate">{selected.id}</span>
              <span className="text-dim">ts</span>
              <span>{new Date(selected.ts).toISOString()}</span>
              <span className="text-dim">agent</span>
              <span>{selected.agentId}</span>
              <span className="text-dim">session</span>
              <span>{selected.sessionId ?? '-'}</span>
              <span className="text-dim">pid</span>
              <span>{selected.pid ?? '-'}</span>
              <span className="text-dim">type</span>
              <span className="text-accent">{selected.type}</span>
            </div>
            <div>
              <div className="mb-1 text-[10px] uppercase text-muted-foreground">payload</div>
              <pre className="max-h-80 overflow-auto border border-border bg-background p-2 text-[11px]">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-dim">&gt; click an event to inspect payload</div>
        )}
      </Panel>
    </div>
  );
}
