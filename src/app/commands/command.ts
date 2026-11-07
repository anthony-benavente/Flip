import { Plan } from '../model/plan.model';
import { ObjectSchema } from './schema';

/** A named request to change or read the plan: what an AI (or any script) sends. */
export interface CommandCall {
  name: string;
  args?: unknown;
}

export type CommandResult =
  | { ok: true; /** One line saying what changed, for the change list. */ summary: string; output: unknown }
  | { ok: false; error: string };

/** Thrown by a command for a request it cannot carry out; the message goes back to the caller. */
export class CommandError extends Error {}

export interface Command {
  /** snake_case, so it is a valid tool name for every AI provider. */
  name: string;
  /** Tells the AI what the command does and when to use it. */
  description: string;
  /** Reads the plan without changing it. */
  readOnly?: boolean;
  input: ObjectSchema;
  /**
   * Carries the command out on `draft`. Arguments are already checked against `input`. Check
   * everything before changing anything: a command that throws must leave the draft untouched.
   */
  run(draft: Plan, args: Record<string, any>): { summary: string; output?: unknown };
}

/** What an AI provider needs to offer a command as a tool. */
export interface CommandSpec {
  name: string;
  description: string;
  readOnly: boolean;
  inputSchema: ObjectSchema;
}
