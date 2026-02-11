import { Dictionary } from "lodash";

export type PlayStep = {
  system_instructions_template?: string;
  user_instructions_template?: string;
  name?: string;
  model_provider?: string;
  model_name?: string;
};

export enum PlayOutputType {
  FINAL = "final",
  VARIABLE = "variable",
}

export type Play = {
  name: string;
  variables: Dictionary<string>;
  user: number;
  category: string | null;
  // NOTE: This is actually stored as a JSON string in the database. For now, we'll enforce structure here with types.
  play_steps: PlayStep[];
  visible?: boolean;
  id: number;
  output_type: PlayOutputType;
  required_batches?: number[]; // NEW: Array of required batch numbers (1-5)
};

export type PlayBD = Omit<Play, "user" | "id">;

// SmartVariables are just Plays with output_type = PlayOutputType.VARIABLE and a value b/c the play was run server-side
// Eventually when final output Plays can also be run server-side, we can remove this type and just use Play with value?
export type PlayRanServerSide = Play & { value: string };

// When we call /plays/id/run we get back a list of strings, one final output for each company variable set
export type RunFinalPlayResponseType = (string | null)[];

export type UserPlayPreference = {
  id?: number | null;
  play: number;
  num_outputs: number;
};