import { useQuery } from "@tanstack/react-query";
import { useBackendQuery } from "./networking";

export interface CompanyEnrichmentData {
  success: boolean;
  company_id: string;
  data: {
    name?: string;
    industry?: string;
    company_size?: string;
    location?: string;
    website?: string;
    active_job_postings_count?: number;
    [key: string]: any;
  };
  source: string;
  endpoint: string;
}

export function useCompanyEnrichment(companyId: string | undefined, enabled: boolean = true) {
  return useBackendQuery<CompanyEnrichmentData>(
    `company-enrichment/?company_id=${companyId}`,
    {
      enabled: enabled && !!companyId,
    }
  );
} 