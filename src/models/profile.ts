import { Dictionary } from "lodash";

export type Profile = {
  id: number;
  user: number;
  variables: Dictionary<string[]>;
};

export type ProfileBD = Omit<Profile, "id" | "user">;
