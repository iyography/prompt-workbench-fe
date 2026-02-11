import { Nango, ProxyConfiguration } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

type Company = {
  id: string;
  properties: {
    name?: string;
    domain?: string;
    hs_is_target_account?: string;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

type CompanySearchResponse = {
  results: Company[];
  total: number;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { connectionId, companyName, website } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    if (!companyName && !website) {
      return NextResponse.json(
        { error: "Company name or website is required" },
        { status: 400 },
      );
    }

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

    // Helper function to clean website/domain for better fuzzy matching
    const cleanDomain = (url: string): string => {
      let cleaned = url.toLowerCase().trim();
      
      // Remove protocols
      cleaned = cleaned.replace(/^https?:\/\//, '');
      cleaned = cleaned.replace(/^ftp:\/\//, '');
      
      // Remove www prefix
      cleaned = cleaned.replace(/^www\./, '');
      
      // Remove trailing slashes and paths
      cleaned = cleaned.split('/')[0];
      
      // Remove common TLDs for broader matching (optional - can improve recall)
      // cleaned = cleaned.replace(/\.(com|org|net|co|io|ai)$/, '');
      
      return cleaned;
    };

    // Build filter groups with OR logic (multiple filterGroups = OR)
    // Each filterGroup can match either by name OR by domain
    const filterGroups: any[] = [];
    
    // Optionally filter for target accounts (applies to all groups)
    // const targetAccountFilter = {
    //   propertyName: "hs_is_target_account",
    //   operator: "EQ",
    //   value: "true",
    // };

    // Filter Group 1: Search by company name (if provided)
    if (companyName) {
      filterGroups.push({
        filters: [
          // targetAccountFilter, // Uncomment to filter only target accounts
          {
            propertyName: "name",
            operator: "CONTAINS_TOKEN", // Fuzzy matching with token-based search
            value: companyName,
          },
        ],
      });
    }

    // Filter Group 2: Search by domain/website (if provided)
    if (website) {
      const cleanedDomain = cleanDomain(website);
      filterGroups.push({
        filters: [
          // targetAccountFilter, // Uncomment to filter only target accounts
          {
            propertyName: "domain",
            operator: "CONTAINS_TOKEN", // Fuzzy matching with token-based search
            value: cleanedDomain,
          },
        ],
      });
    }

    console.log('🔍 HubSpot company search parameters:', {
      originalCompanyName: companyName,
      originalWebsite: website,
      cleanedDomain: website ? cleanDomain(website) : null,
      filterGroupsCount: filterGroups.length,
    });

    const config: ProxyConfiguration = {
      endpoint: "/crm/v3/objects/companies/search",
      providerConfigKey: "hubspot",
      connectionId: String(connectionId),
      method: "POST",
      data: {
        filterGroups: filterGroups,
        properties: ["name", "domain", "hs_is_target_account", "industry", "city", "state"],
        // limit: 10, // Commented out - limit may not be implemented properly
      },
    };

    const response = await nango.post<CompanySearchResponse>(config);

    console.log('✅ HubSpot company search results:', {
      resultsCount: response.data.results?.length || 0,
      total: response.data.total,
    });

    if (!response.data.results || response.data.results.length === 0) {
      console.log('⚠️ No companies found with fuzzy matching');
      return NextResponse.json({
        results: {
          data: [],
          status: 404,
          statusText: "No companies found",
        },
      });
    }

    // Format the response
    const companies = response.data.results.map((company) => ({
      id: company.id,
      name: company.properties.name || "",
      domain: company.properties.domain || "",
      hs_is_target_account: company.properties.hs_is_target_account || "",
      industry: company.properties.industry || "",
      city: company.properties.city || "",
      state: company.properties.state || "",
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    }));

    console.log('📊 Formatted company results:', companies.map(c => ({ name: c.name, domain: c.domain })));

    return NextResponse.json({
      results: {
        data: companies,
        total: response.data.total,
        status: 200,
        statusText: "OK",
      },
    });
  } catch (error) {
    console.error("Error searching HubSpot companies:", error);
    return NextResponse.json(
      { 
        error: "Failed to search HubSpot companies",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 },
    );
  }
}


