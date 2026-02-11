import { Nango, ProxyConfiguration } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DealProperties = {
  updatedAt: string;
  createdAt: string;
  name: string;
  label: string;
  type: string;
  fieldType: string;
  description: string;
  groupName: string;
  options: any[];
  displayOrder: number;
  calculated: boolean;
  externalOptions: boolean;
  hasUniqueValue: boolean;
  hidden: boolean;
  hubspotDefined: boolean;
  modificationMetadata: {
    archivable: boolean;
    readOnlyDefinition: boolean;
    readOnlyValue: boolean;
  };
  formField: boolean;
  dataSensitivity: string;
};

export type DealPropertiesResponse = {
  results: DealProperties[];
};

export type Property = {
  [key: string]: string | number | boolean | null;
};

export type FullDeal = {
  id: string;
  properties: Property;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

export type FullDealResponse = {
  results: FullDeal[];
};

type Association = {
  from: { id: string };
  to: { id: string }[];
};

type AssociationResponse = {
  results: Association[];
};

export type NangoMetadata = {
  first_seen_at: string;
  last_modified_at: string;
  last_action: string;
  deleted_at: string | null;
  cursor: string;
};

export type Deal = {
  id: string;
  created_at: string;
  updated_at: string;
  amount: string;
  close_date: string;
  name: string;
  pipeline: string;
  stage: string;
  _nango_metadata: NangoMetadata;
};

// PERFORMANCE NOTE: When searching by company name (no contactId), this endpoint makes 3 sequential API calls:
// 1. Search for company by name
// 2. Get deal associations for company
// 3. Fetch the actual deal data
// This can take 20-30+ seconds when no deal exists. Consider adding timeout/abort logic or caching.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const connectionId = searchParams.get("id");
    const contactId = searchParams.get("contactId");
    const companyId = searchParams.get("companyId"); // Company ID
    const companyName = searchParams.get("companyName"); // Company name
    if (!connectionId) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

    const dealProperties: DealPropertiesResponse = await nango.triggerAction(
      "hubspot",
      connectionId,
      "fetch-properties",
      {
        name: "deal",
      },
    );

    let properties: Record<string, string> = {};
    let propertyLabels: Record<string, string> = {};

    dealProperties.results.forEach((result) => {
      if (!result.name.startsWith("hs_")) {
        properties[result.name] = result.label;
        propertyLabels[result.name] = result.label;
      }
    });

    // Priority: contactId > companyId > companyName (most accurate to least accurate)
    if (contactId) {
      // Contact-based deal lookup (most accurate - deals directly associated with the contact)
      const associationConfig: ProxyConfiguration = {
        endpoint: "crm/v3/associations/contacts/deals/batch/read",
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "POST",
        data: {
          inputs: [{ id: contactId }],
          sorts: [
            {
              propertyName: "createdate",
              direction: "DESCENDING", // Most recent first (consistent with company lookups)
            },
          ],
        },
      };

      const associationResponse = await nango.post<AssociationResponse>(associationConfig);
      const associatedDeals = associationResponse.data.results[0]?.to;

      if (!associatedDeals || associatedDeals.length === 0) {
        return NextResponse.json(
          { error: "No deals found for the given contact" },
          { status: 404 },
        );
      }
      // Get the most recent deal (first one due to DESCENDING sort)
      const mostRecentDealId = associatedDeals[0].id;
      const dealConfig: ProxyConfiguration = {
        endpoint: `crm/v3/objects/deals/${mostRecentDealId}`,
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "GET",
        params: {
          properties: Object.keys(properties).join(","),
        },
      };
      
      const dealResponse = await nango.get<FullDeal>(dealConfig);
      const deal = dealResponse.data;

      if (!deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 },
        );
      }

      const propertiesWithLabels: Record<string, { value: any; label: string }> = {};

      Object.entries(deal.properties).forEach(([key, value]) => {
        if (value !== null) {
          propertiesWithLabels[key] = {
            value: value,
            label: propertyLabels[key] || key,
          };
        }
      });

      const sanitizedResponse = {
        id: deal.id,
        created_at: deal.createdAt,
        updated_at: deal.updatedAt,
        properties: propertiesWithLabels,
      };

      return NextResponse.json({ deal: sanitizedResponse });
    } else if (companyId) {
      // Search for deals associated with the given company ID
      const associationConfig: ProxyConfiguration = {
        endpoint: "crm/v3/associations/companies/deals/batch/read",
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "POST",
        data: {
          inputs: [{ id: companyId }],
          sorts: [
            {
              propertyName: "createdate",
              direction: "DESCENDING", // Most recent first
            },
          ],
        },
      };

      const associationResponse = await nango.post<AssociationResponse>(associationConfig);
      const associatedDeals = associationResponse.data.results[0]?.to;

      if (!associatedDeals || associatedDeals.length === 0) {
        return NextResponse.json(
          { error: "No deals found for the given company" },
          { status: 404 },
        );
      }
      // Get the most recent deal
      const mostRecentDealId = associatedDeals[0].id; // First one is most recent due to DESCENDING sort
      
      const dealConfig: ProxyConfiguration = {
        endpoint: `crm/v3/objects/deals/${mostRecentDealId}`,
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "GET",
        params: {
          properties: Object.keys(properties).join(","),
        },
      };
      
      const dealResponse = await nango.get<FullDeal>(dealConfig);
      const deal = dealResponse.data;

      if (!deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 },
        );
      }

      const propertiesWithLabels: Record<string, { value: any; label: string }> = {};

      Object.entries(deal.properties).forEach(([key, value]) => {
        if (value !== null) {
          propertiesWithLabels[key] = {
            value: value,
            label: propertyLabels[key] || key,
          };
        }
      });

      const sanitizedResponse = {
        id: deal.id,
        created_at: deal.createdAt,
        updated_at: deal.updatedAt,
        properties: propertiesWithLabels,
      };

      return NextResponse.json({ deal: sanitizedResponse });
    } else if (companyName) {
      // Search for deals by company name (least accurate - requires fuzzy search)
      // First, search for the company by name
      const companySearchConfig: ProxyConfiguration = {
        endpoint: "crm/v3/objects/companies/search",
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "POST",
        data: {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "name",
                  operator: "CONTAINS_TOKEN",
                  value: companyName,
                },
              ],
            },
          ],
          properties: ["name", "id"],
          limit: 1,
        },
      };

      const companySearchResponse = await nango.post(companySearchConfig);
      const companies = companySearchResponse.data.results;

      if (!companies || companies.length === 0) {
        return NextResponse.json(
          { error: "No company found with the given name" },
          { status: 404 },
        );
      }

      const foundCompanyId = companies[0].id;
      // Now search for deals associated with this company
      const associationConfig: ProxyConfiguration = {
        endpoint: "crm/v3/associations/companies/deals/batch/read",
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "POST",
        data: {
          inputs: [{ id: foundCompanyId }],
          sorts: [
            {
              propertyName: "createdate",
              direction: "DESCENDING", // Most recent first
            },
          ],
        },
      };

      const associationResponse = await nango.post<AssociationResponse>(associationConfig);
      const associatedDeals = associationResponse.data.results[0]?.to;

      if (!associatedDeals || associatedDeals.length === 0) {
        return NextResponse.json(
          { error: "No deals found for the given company" },
          { status: 404 },
        );
      }
      // Get the most recent deal
      const mostRecentDealId = associatedDeals[0].id; // First one is most recent due to DESCENDING sort
      
      const dealConfig: ProxyConfiguration = {
        endpoint: `crm/v3/objects/deals/${mostRecentDealId}`,
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        method: "GET",
        params: {
          properties: Object.keys(properties).join(","),
        },
      };
      
      const dealResponse = await nango.get<FullDeal>(dealConfig);
      const deal = dealResponse.data;

      if (!deal) {
        return NextResponse.json(
          { error: "Deal not found" },
          { status: 404 },
        );
      }

      const propertiesWithLabels: Record<string, { value: any; label: string }> = {};

      Object.entries(deal.properties).forEach(([key, value]) => {
        if (value !== null) {
          propertiesWithLabels[key] = {
            value: value,
            label: propertyLabels[key] || key,
          };
        }
      });

      const sanitizedResponse = {
        id: deal.id,
        created_at: deal.createdAt,
        updated_at: deal.updatedAt,
        properties: propertiesWithLabels,
      };

      return NextResponse.json({ deal: sanitizedResponse });
    } else {
      // Fetch all deals (existing functionality)
      const config: ProxyConfiguration = {
        endpoint: "crm/v3/objects/deals",
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        params: {
          properties: Object.keys(properties).join(","),
        },
      };

      const partialDeals = await nango.listRecords<Deal>({
        providerConfigKey: "hubspot",
        connectionId: connectionId,
        model: "Deal",
      });

      const fullDealData = await nango.get<FullDealResponse>(config);

      const joined = partialDeals.records.map((deal) => {
        const fullDeal = fullDealData.data.results.find(
          (fd) => fd.id === deal.id,
        );
        const propertiesWithLabels: Record<string, { value: any; label: string }> = {};

        if (fullDeal?.properties) {
          Object.entries(fullDeal.properties).forEach(([key, value]) => {
            if (value !== null) {
              propertiesWithLabels[key] = {
                value: value,
                label: propertyLabels[key] || key,
              };
            }
          });
        }

        return {
          ...deal,
          properties: propertiesWithLabels,
        };
      });

      const sanitizedResponse = {
        data: joined,
        status: fullDealData.status,
        statusText: fullDealData.statusText,
      };

      return NextResponse.json({ results: sanitizedResponse });
    }
  } catch (error) {
    console.error("Error fetching Hubspot deals:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hubspot deals" },
      { status: 500 },
    );
  }
}
