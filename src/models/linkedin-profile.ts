import { Dictionary } from "lodash";

export type LinkedInProfile = {
  // created_at: string; // ISO 8601 date string (e.g. "2024-03-06T23:54:47.823397-05:00")
  // updated_at: string; // ISO 8601 date string (e.g. "2024-03-06T23:54:47.823397-05:00")
  // is_cached: boolean;
  profile_data_raw?: Record<string, string>;
  // NOTE: This is actually stored as a JSON string in the database. For now, we'll enforce structure here with types.
  profile_data: Dictionary<string>;
  profile_id: string;
  persona: { [persona_name: string]: Dictionary<string[]> }; // Will only be one key-value pair in the top level object
  persona_prompts?: { system_instructions?: string; user_instructions?: string } | null;
};

// Base type without the fields we want to make optional
type LinkedInProfileBase = Omit<
  LinkedInProfile,
  "created_at" | "updated_at" | "is_cached" | "profile_data" | "persona" | "profile_id"
>;

// Union type that allows either profile_id or email
export type LinkedInProfileBD = LinkedInProfileBase & (
  | { profile_id: string; email?: never }
  | { email: string; profile_id?: never }
);

// Extended LinkedIn profile type specifically for org chart use case
// Includes additional fields returned by the backend API
export type LinkedInProfileOrgChart = LinkedInProfile & {
  is_cached?: boolean;
  cache_status?: string;
  source?: string;
};
