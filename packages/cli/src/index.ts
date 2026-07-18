/**
 * `@hookorama/cli` — public barrel and `hookorama` CLI program.
 */

import type { Status } from '@hookorama/client';
import { Command, Argument } from 'commander';
import { dashboard } from './commands/dashboard.js';
import { hook } from './commands/hook.js';
import { setup } from './commands/setup.js';
import { status as statusCommand } from './commands/status.js';
import { supervisorStart, supervisorStop } from './commands/supervisor.js';
import { listPlugins } from './plugin-registry.js';
import { VALID_STATUSES } from './plugins/shared/hook-args.js';

export type { AgentPlugin, AgentPluginOptions, AgentPluginStatus } from './plugin.js';

const program = new Command();

program.name('hookorama').description('Hookorama CLI').version('0.1.0');

program
  .command('supervisor')
  .description('manage the local supervisor daemon')
  .addCommand(
    new Command('start')
      .description('start the supervisor daemon')
      .action(supervisorStart),
  )
  .addCommand(
    new Command('stop')
      .description('stop the supervisor daemon')
      .action(supervisorStop),
  );

program
  .command('status')
  .description('show the supervisor and process status')
  .action(statusCommand);

program
  .command('hook')
  .addArgument(new Argument('agent').argRequired())
  .addArgument(new Argument('status').argRequired())
  .description('dispatch a hook event to the supervisor')
  .allowUnknownOption()
  .action(async (agent: string, statusValue: string, _options: unknown, command: Command) => {
    if (!VALID_STATUSES.has(statusValue as Status)) {
      console.error('invalid status: %s (expected one of: %s)', statusValue, [...VALID_STATUSES].join(', '));
      process.exitCode = 1;
      return;
    }
    const argv = command.args.slice(2);
    await hook(agent, statusValue as Status, argv);
  });

program
  .command('setup')
  .addArgument(new Argument('agent').argRequired())
  .description('install, update, or remove an agent hook config')
  .option('--update', 'update the existing hook config')
  .option('--remove', 'remove the hook config')
  .option('--dry-run', 'show what would be written without writing')
  .action(async (agent: string, options: { update?: boolean; remove?: boolean; dryRun?: boolean }) => {
    await setup(agent, options.update ?? false, options.remove ?? false, options.dryRun ?? false);
  });

const pluginCommand = new Command('plugin')
  .description('list built-in agent plugins')
  .addCommand(
    new Command('list')
      .description('list built-in agent plugins')
      .action(async () => {
        for (const plugin of listPlugins()) {
          console.warn(`${plugin.name}: ${plugin.description}`);
        }
      }),
  );

program.addCommand(pluginCommand);

program
  .command('dashboard')
  .description('start the Hookorama web dashboard')
  .action(dashboard);

export async function main(argv?: string[]): Promise<void> {
  await program.parseAsync(argv ?? process.argv);
}
