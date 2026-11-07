import { CommandCall, CommandResult, CommandSpec } from '../commands/command';
import { commandSpecs } from '../commands/run-command';

/** What `window.flip` offers to scripts and browser agents running in the page. */
export interface FlipWindowApi {
  version: 1;
  /** Every command with its description and JSON Schema, ready to hand to any AI as tools. */
  commands(): CommandSpec[];
  /** Runs one command, for example `flip.run('place_furniture', { catalogId: 'sofa-3', x: 200, y: 100 })`. */
  run(name: string, args?: unknown): CommandResult;
  /** Runs commands in order. A failing command is reported and the rest still run. */
  runBatch(calls: CommandCall[]): CommandResult[];
}

/** Publishes `window.flip` for the open plan and returns a function that removes it. */
export function installWindowApi(session: { execute(call: CommandCall): CommandResult }): () => void {
  if (typeof window === 'undefined') return () => {};
  const api: FlipWindowApi = {
    version: 1,
    commands: commandSpecs,
    run: (name, args) => session.execute({ name, args }),
    runBatch: (calls) => calls.map((c) => session.execute(c)),
  };
  const host = window as unknown as { flip?: FlipWindowApi };
  host.flip = api;
  return () => {
    if (host.flip === api) delete host.flip;
  };
}
