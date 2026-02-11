import { PlayOutputType } from "./play";

export type LLMResponse = {
  id: number;
  response: string;
  user: number;
  system_instructions: string;
  user_instructions: string;
  is_cached: boolean;
};

export type LLMResponseBD = Omit<
  LLMResponse,
  "id" | "user" | "response" | "is_cached"
> & {
  play_output_type: PlayOutputType;
  model_provider?: string;
  model_name?: string;
};
