import { Nango, ProxyConfiguration } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CompanyProperties = {
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

type CompanyPropertiesResponse = {
  results: CompanyProperties[];
};

type Property = {
  [key: string]: string | number | boolean | null;
};

type FullCompany = {
  id: string;
  properties: Property;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

type FullCompanyResponse = {
  results: FullCompany[];
};

type NangoMetadata = {
  first_seen_at: string;
  last_modified_at: string;
  last_action: string;
  deleted_at: string | null;
  cursor: string;
};

type Company = {
  id: string;
  created_at: string;
  updated_at: string;
  name: string;
  domain: string;
  _nango_metadata: NangoMetadata;
};

async function getCompanyById(
  nango: Nango,
  id: string,
  companyId: string,
  properties: string[],
) {
  const config: ProxyConfiguration = {
    endpoint: `crm/v3/objects/companies/${companyId}`,
    providerConfigKey: "hubspot",
    connectionId: id,
    params: {
      properties: properties.join(","),
    },
  };

  const response = await nango.get<FullCompany>(config);

  return response.data;
}

async function getAllCompanies(nango: Nango, id: string, properties: string[]) {
  const config: ProxyConfiguration = {
    endpoint: "crm/v3/objects/companies",
    providerConfigKey: "hubspot",
    connectionId: id,
    params: {
      properties: properties.join(","),
      // limit: 250, // Commented out - limit may not be implemented properly
    },
  };

  const response = await nango.get<FullCompanyResponse>(config);
  return response.data.results;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const companyId = searchParams.get("companyId");

    if (!id) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

    // Get company properties for labels
    const companyProperties: CompanyPropertiesResponse =
      await nango.triggerAction("hubspot", String(id), "fetch-properties", {
        name: "company",
      });

    let properties: Record<string, string> = {};
    let propertyLabels: Record<string, string> = {};

    companyProperties.results.forEach((result) => {
      // exclude default hubspot properties
      if (!result.name.startsWith("hs_")) {
        properties[result.name] = result.label;
        propertyLabels[result.name] = result.label;
      }
    });

    // Get all property names for fetching
    const propertyNames = Object.keys(properties);

    let companies: FullCompany[];
    if (companyId) {
      // Get specific company by ID
      const c = await getCompanyById(
        nango,
        String(id),
        companyId,
        propertyNames,
      );
      companies = [c];
    } else {
      // Get all companies
      companies = await getAllCompanies(nango, String(id), propertyNames);
    }

    const partialCompanies = await nango.listRecords<Company>({
      providerConfigKey: "hubspot",
      connectionId: String(id),
      model: "Company",
    });

    // Format companies with labels
    const formattedCompanies = companies.map((company) => {
      const partialCompany = partialCompanies.records.find(
        (c) => c.id === company.id,
      );
      const propertiesWithLabels: Record<
        string,
        { value: any; label: string }
      > = {};

      if (company.properties) {
        Object.entries(company.properties).forEach(([key, value]) => {
          // Only include properties that are not null
          if (value !== null) {
            propertiesWithLabels[key] = {
              value: value,
              label: propertyLabels[key] || key,
            };
          }
        });
      }

      return {
        ...partialCompany,
        properties: propertiesWithLabels,
      };
    });

    return NextResponse.json({
      results: {
        data: formattedCompanies,
        status: 200,
        statusText: "OK",
      },
    });
  } catch (error) {
    console.error("Error fetching Hubspot companies:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hubspot companies" },
      { status: 500 },
    );
  }
}
