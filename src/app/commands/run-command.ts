import { Plan } from '../model/plan.model';
import { CommandCall, CommandContext, CommandError, CommandResult, CommandSpec, EMPTY_CONTEXT } from './command';
import { PLAN_COMMANDS } from './plan-commands';
import { validate } from './schema';

const byName = new Map(PLAN_COMMANDS.map((c) => [c.name, c]));

/** Every command in the form an AI provider needs to offer it as a tool. */
export function commandSpecs(): CommandSpec[] {
  return PLAN_COMMANDS.map((c) => ({ name: c.name, description: c.description, readOnly: !!c.readOnly, inputSchema: c.input }));
}

export function isReadOnlyCommand(name: string): boolean {
  return !!byName.get(name)?.readOnly;
}

/**
 * Runs one command on `draft`. A failed command leaves the draft as it was, because commands check
 * before they change, so the caller can keep the draft and carry on with the next one.
 */
export function runCommand(draft: Plan, call: CommandCall, ctx: CommandContext = EMPTY_CONTEXT): CommandResult {
  const command = byName.get(call.name);
  if (!command) return { ok: false, error: `Unknown command "${call.name}". Commands: ${[...byName.keys()].join(', ')}.` };
  const args = call.args ?? {};
  const problem = validate(command.input, args);
  if (problem) return { ok: false, error: problem };
  try {
    const { summary, output } = command.run(draft, args as Record<string, unknown>, ctx);
    return { ok: true, summary, output: output ?? { done: true } };
  } catch (e) {
    if (e instanceof CommandError) return { ok: false, error: e.message };
    throw e;
  }
}
