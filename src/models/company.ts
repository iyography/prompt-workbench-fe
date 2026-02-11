import { Dictionary } from "lodash";

export type Company = {
  users: number[];
  company_variables: Dictionary<string[]>;
  personas: Dictionary<Dictionary<string[]>>;
  linkedin_job_search_term: string;
  linkedin_job_location: string;
  linkedin_max_job_details: number;
  linkedin_max_jobs: number;
  linkedin_max_posts: number;
  id: number;
};

export type CompanyBD = Omit<Company, "users" | "id">;
