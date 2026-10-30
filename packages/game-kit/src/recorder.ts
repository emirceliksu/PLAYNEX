export interface RecordedInput<Input> {
  frame: number;
  input: Input;
}

export interface RunRecord<Input> {
  seed: number;
  inputs: RecordedInput<Input>[];
}

// Seed plus inputs replays a solo run exactly, which is what server-side score checks will need.
export class InputRecorder<Input> {
  private inputs: RecordedInput<Input>[] = [];

  constructor(private readonly seed: number) {}

  record(frame: number, input: Input): void {
    this.inputs.push({ frame, input });
  }

  finish(): RunRecord<Input> {
    return { seed: this.seed, inputs: this.inputs };
  }
}

export function replay<State, Input>(
  run: RunRecord<Input>,
  initial: State,
  apply: (state: State, input: Input, frame: number) => State,
): State {
  return run.inputs.reduce((state, { frame, input }) => apply(state, input, frame), initial);
}
