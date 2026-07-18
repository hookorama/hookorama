import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { Shell } from './routes/shell.js';
import { Overview } from './routes/overview.js';
import { Agents } from './routes/agents.js';
import { Processes } from './routes/processes.js';
import { Projects } from './routes/projects.js';
import { Events } from './routes/events.js';
import { Analytics } from './routes/analytics.js';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="max-w-md text-center">
        <div className="text-xs uppercase tracking-widest text-primary">hookorama :: 404</div>
        <h1 className="mt-2 text-4xl">SIGNAL_NOT_FOUND</h1>
        <p className="mt-2 text-sm text-muted-foreground">&gt; the requested route does not exist in this panorama.</p>
      </div>
    </div>
  ),
});

const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_shell',
  component: Shell,
});

const indexRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/',
  component: Overview,
});

const projectsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/projects',
  component: Projects,
});

const agentsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/agents',
  validateSearch: (search: Record<string, unknown>): { project: string | undefined } => ({
    project: typeof search['project'] === 'string' ? (search['project'] as string) : undefined,
  }),
  component: Agents,
});

const processesRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/processes',
  component: Processes,
});

const eventsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/events',
  component: Events,
});

const analyticsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: '/analytics',
  component: Analytics,
});

const routeTree = rootRoute.addChildren([
  shellRoute.addChildren([
    indexRoute,
    projectsRoute,
    agentsRoute,
    processesRoute,
    eventsRoute,
    analyticsRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: 'intent' });

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
