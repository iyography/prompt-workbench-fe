import { useBackendQuery } from "./networking";
import { levenshteinDistance } from "@/utils/levenshtein";

interface OrgChartAPI {
  id: number;
  company: number;
  name: string;
  website?: string;
  account_intel?: string;
  chart_data?: {
    version?: string;
    metadata?: {
      name?: string;
      account_intel?: string;
      website?: string;
      domain?: string;
      created_at?: string;
      last_modified?: string;
    };
    root_node?: any;
    ai_metadata?: any;
  };
  created_at: string;
  updated_at: string;
}

interface OrgChartMatch {
  orgChart: OrgChartAPI;
  matchType: 'website' | 'fuzzy_name';
  confidence: number;
  accountIntel?: string;
}

// String similarity function using Levenshtein distance
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;
  
  const normalized1 = str1.toLowerCase().trim();
  const normalized2 = str2.toLowerCase().trim();
  
  if (normalized1 === normalized2) return 100;
  
  const maxLength = Math.max(normalized1.length, normalized2.length);
  if (maxLength === 0) return 100;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  return Math.round(((maxLength - distance) / maxLength) * 100);
}

// Extract domain from URL
function extractDomain(url: string): string {
  if (!url) return '';
  
  try {
    // Remove protocol and www
    let domain = url.toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split('?')[0];
    
    return domain;
  } catch {
    return url.toLowerCase().trim();
  }
}

// Match company to org charts using the specified logic
function matchCompanyToOrgCharts(
  companyEnrichmentWebsite: string | undefined,
  companyName: string | undefined,
  orgCharts: OrgChartAPI[]
): OrgChartMatch | null {
  
  if (!orgCharts || orgCharts.length === 0) return null;

  // Layer 1: Website/Domain matching
  if (companyEnrichmentWebsite) {
    const companyDomain = extractDomain(companyEnrichmentWebsite);
    
    for (const orgChart of orgCharts) {
      // Check multiple possible website fields in the org chart
      const orgWebsiteFields = [
        orgChart.website,  // Direct field on OrgChart model
        orgChart.chart_data?.metadata?.website,
        orgChart.chart_data?.metadata?.domain,
        // Add more fields as needed based on actual schema
      ].filter(Boolean);

      for (const orgWebsite of orgWebsiteFields) {
        const orgDomain = extractDomain(orgWebsite as string);
        
        if (orgDomain && companyDomain && orgDomain === companyDomain) {
          return {
            orgChart,
            matchType: 'website',
            confidence: 100,
            accountIntel: orgChart.account_intel || orgChart.chart_data?.metadata?.account_intel
          };
        }
      }
    }
  }

  // Layer 2: Fuzzy name matching (80%+ accuracy)
  if (companyName) {
    let bestMatch: OrgChartMatch | null = null;
    let highestConfidence = 0;

    for (const orgChart of orgCharts) {
      // Get possible company names from the org chart
      const orgNames = [
        orgChart.name,
        orgChart.chart_data?.metadata?.name,
        // Add more name fields as needed
      ].filter(Boolean);

      for (const orgName of orgNames) {
        const similarity = calculateSimilarity(companyName, orgName as string);
        
        if (similarity >= 80 && similarity > highestConfidence) {
          highestConfidence = similarity;
          bestMatch = {
            orgChart,
            matchType: 'fuzzy_name',
            confidence: similarity,
            accountIntel: orgChart.account_intel || orgChart.chart_data?.metadata?.account_intel
          };
        }
      }
    }

    return bestMatch;
  }

  return null;
}

// Hook to get matched org chart for a company
export function useOrgChartMatching(
  companyEnrichmentWebsite?: string,
  companyName?: string,
  enabled: boolean = true
) {
  // Fetch all org charts for the user
  const { 
    data: orgCharts, 
    isLoading: loadingOrgCharts, 
    error: orgChartsError 
  } = useBackendQuery<OrgChartAPI[]>("org-charts/", {
    enabled: enabled
  });

  // Perform matching when data is available
  const match = orgCharts && (companyEnrichmentWebsite || companyName) 
    ? matchCompanyToOrgCharts(companyEnrichmentWebsite, companyName, orgCharts)
    : null;

  return {
    orgCharts,
    match,
    isLoading: loadingOrgCharts,
    error: orgChartsError,
    hasMatch: !!match,
    matchConfidence: match?.confidence || 0,
    matchType: match?.matchType,
    accountIntel: match?.accountIntel
  };
}

// Helper function to get account intel data for research
export function getAccountIntelForResearch(match: OrgChartMatch | null): Record<string, string> {
  if (!match || !match.accountIntel) {
    return {};
  }

  const result = {
    account_intel: match.accountIntel,
    org_chart_matched: 'true',
    org_chart_match_type: match.matchType,
    org_chart_confidence: match.confidence.toString(),
    org_chart_company_name: match.orgChart.name
  };

  return result;
}