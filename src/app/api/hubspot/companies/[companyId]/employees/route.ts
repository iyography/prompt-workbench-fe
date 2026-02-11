import { Nango, ProxyConfiguration } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

type ContactProperties = {
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

type ContactPropertiesResponse = {
  results: ContactProperties[];
};

type Property = {
  [key: string]: string | number | boolean | null;
};

type FullContact = {
  id: string;
  properties: Property;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

type FullContactResponse = {
  results: FullContact[];
  paging?: {
    next?: {
      after: string;
    };
  };
};

async function getEmployeesByCompanyId(
  nango: Nango,
  id: string,
  companyId: string,
  properties: string[],
  fetchAll: boolean = true,
  cursor?: string,
) {
  // Validate that companyId is provided
  if (!companyId) {
    throw new Error("Company ID is required to fetch employees");
  }

  let allEmployees: FullContact[] = [];
  let after: string | undefined = cursor;

  // Paginate through all results or fetch single page
  do {
    const config: ProxyConfiguration = {
      endpoint: "crm/v3/objects/contacts/search",
      providerConfigKey: "hubspot",
      connectionId: id,
      method: "POST",
      data: {
        filterGroups: [
          {
            filters: [
              {
                propertyName: "associatedcompanyid",
                operator: "EQ",
                value: companyId,
              },
            ],
          },
        ],
        properties: properties,
        limit: 100,
        ...(after && { after }), // Include 'after' cursor if it exists
      },
    };

    const response = await nango.post<FullContactResponse>(config);
    allEmployees.push(...response.data.results);

    // Get the next cursor if it exists
    after = response.data.paging?.next?.after;

    // If fetchAll is false, only fetch one page
    if (!fetchAll) {
      break;
    }
  } while (after);

  if (fetchAll) {
  }

  return { employees: allEmployees, nextCursor: after };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const fetchAll = searchParams.get("fetchAll") !== "false"; // Default to true
    const cursor = searchParams.get("cursor") || undefined;
    const { companyId } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Connection ID is required" },
        { status: 400 },
      );
    }

    if (!companyId) {
      return NextResponse.json(
        { error: "Company ID is required" },
        { status: 400 },
      );
    }

    const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

    // Get contact properties for labels
    const contactProperties: ContactPropertiesResponse =
      await nango.triggerAction("hubspot", String(id), "fetch-properties", {
        name: "contact",
      });

    let properties: Record<string, string> = {};
    let propertyLabels: Record<string, string> = {};

    contactProperties.results.forEach((result) => {
      // exclude default hubspot properties
      if (!result.name.startsWith("hs_")) {
        properties[result.name] = result.label;
        propertyLabels[result.name] = result.label;
      }
    });

    // Get all property names for fetching
    const propertyNames = Object.keys(properties);

    // Get employees (contacts) associated with the company
    const { employees, nextCursor } = await getEmployeesByCompanyId(
      nango,
      String(id),
      companyId,
      propertyNames,
      fetchAll,
      cursor,
    );
    // Format employees with labels
    const formattedEmployees = employees.map((employee) => {
      const propertiesWithLabels: Record<
        string,
        { value: any; label: string }
      > = {};

      if (employee.properties) {
        Object.entries(employee.properties).forEach(([key, value]) => {
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
        id: employee.id,
        created_at: employee.createdAt,
        updated_at: employee.updatedAt,
        firstname: employee.properties.firstname || "",
        lastname: employee.properties.lastname || "",
        email: employee.properties.email || "",
        properties: propertiesWithLabels,
      };
    });

    return NextResponse.json({
      results: {
        data: formattedEmployees,
        status: 200,
        statusText: "OK",
      },
      pagination: {
        nextCursor: nextCursor,
        hasMore: !!nextCursor,
      },
    });
  } catch (error) {
    console.error("Error fetching Hubspot employees:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hubspot employees" },
      { status: 500 },
    );
  }
}
