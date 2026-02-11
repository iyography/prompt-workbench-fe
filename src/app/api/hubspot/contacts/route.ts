import { Nango, ProxyConfiguration } from "@nangohq/node";
import { NextResponse } from "next/server";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type NangoMetadata = {
  first_seen_at: string;
  last_modified_at: string;
  last_action: string;
  deleted_at: string | null;
  cursor: string;
};

type Contact = {
  id: string;
  created_at: string;
  updated_at: string;
  first_name: string;
  last_name: string;
  email: string;
  active: boolean;
  _nango_metadata: NangoMetadata;
};

interface SearchFilter {
  propertyName: string;
  operator: string;
  value: string;
}

async function searchContacts(
  nango: Nango,
  id: string,
  searchParams: { linkedInUrl?: string; email?: string; firstName?: string; lastName?: string; companyName?: string },
  properties: string[],
  fetchAll: boolean = true,
  cursor?: string,
) {
  const filters: SearchFilter[] = [];

  // Priority 1: LinkedIn URL (fastest and most accurate - exact match)
  if (searchParams.linkedInUrl) {
    // Extract username from LinkedIn URL (e.g., "brian-minick" from "https://www.linkedin.com/in/brian-minick/")
    const linkedInUrlMatch = searchParams.linkedInUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
    const linkedInUsername = linkedInUrlMatch ? linkedInUrlMatch[1] : null;
    
    // Try common LinkedIn URL property names in HubSpot
    // Most common property names first
    const linkedInProperty = 'linkedin_profile'; // Most common property name
    
    if (linkedInUsername) {
      // Search by username in LinkedIn profile property (faster than full URL)
      filters.push({
        propertyName: linkedInProperty,
        operator: "CONTAINS",
        value: linkedInUsername,
      });
    } else {
      // Fallback: search by full URL if username extraction failed
      filters.push({
        propertyName: linkedInProperty,
        operator: "CONTAINS",
        value: searchParams.linkedInUrl,
      });
    }
  }

  // Priority 2: Email (exact match)
  if (searchParams.email) {
    filters.push({
      propertyName: "email",
      operator: "EQ",
      value: searchParams.email,
    });
  }

  // Priority 3: Name + Company (fallback - slower)
  if (searchParams.firstName) {
    // Use CONTAINS_TOKEN for more flexible name matching
    filters.push({
      propertyName: "firstname",
      operator: "CONTAINS_TOKEN",
      value: searchParams.firstName,
    });
  }

  if (searchParams.lastName) {
    // Use CONTAINS_TOKEN for more flexible name matching
    filters.push({
      propertyName: "lastname",
      operator: "CONTAINS_TOKEN",
      value: searchParams.lastName,
    });
  }

  // Add company name filtering for more accurate matching
  if (searchParams.companyName) {
    // Use the most common company field in HubSpot
      filters.push({
      propertyName: "company",
        operator: "CONTAINS_TOKEN",
      value: searchParams.companyName,
    });
  }

  let allContacts: FullContact[] = [];
  let after: string | undefined = cursor;

  // Paginate through all results or fetch single page
  do {
    const config: ProxyConfiguration = {
      endpoint: "crm/v3/objects/contacts/search",
      providerConfigKey: "hubspot",
      connectionId: id,
      method: "POST",
      data: {
        filterGroups: [{ filters }],
        properties: properties, // Include all contact properties in search
        limit: 100,
        ...(after && { after }), // Include 'after' cursor if it exists
      },
    };

    const searchResponse = await nango.post<FullContactResponse>(config);
    allContacts.push(...searchResponse.data.results);

    // Get the next cursor if it exists
    after = searchResponse.data.paging?.next?.after;

    // If fetchAll is false, only fetch one page
    if (!fetchAll) {
      break;
    }
  } while (after);

  if (fetchAll) {
  }

  return { contacts: allContacts, nextCursor: after };
}

async function getAllContacts(
  nango: Nango,
  id: string,
  properties: string[],
  fetchAll: boolean = true,
  cursor?: string,
) {
  let allContacts: FullContact[] = [];
  let after: string | undefined = cursor;

  // Paginate through all results or fetch single page
  do {
    const config: ProxyConfiguration = {
      endpoint: "crm/v3/objects/contacts",
      providerConfigKey: "hubspot",
      connectionId: id,
      params: {
        properties: properties.join(","),
        limit: 100,
        ...(after && { after }), // Include 'after' cursor if it exists
      },
    };

    const response = await nango.get<FullContactResponse>(config);
    allContacts.push(...response.data.results);

    // Get the next cursor if it exists
    after = response.data.paging?.next?.after;

    // If fetchAll is false, only fetch one page
    if (!fetchAll) {
      break;
    }
  } while (after);

  if (fetchAll) {
  }

  return { contacts: allContacts, nextCursor: after };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const linkedInUrl = searchParams.get("linkedInUrl") || undefined;
    const email = searchParams.get("email") || undefined;
    const firstName = searchParams.get("firstName") || undefined;
    const lastName = searchParams.get("lastName") || undefined;
    const companyName = searchParams.get("companyName") || undefined;
    const fetchAll = searchParams.get("fetchAll") !== "false"; // Default to true
    const cursor = searchParams.get("cursor") || undefined;

    if (!id) {
      return NextResponse.json(
        { error: "Connection ID is required" },
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
        properties[result.name] = result.label;
        propertyLabels[result.name] = result.label;
      });

    // Get all property names for fetching
    const propertyNames = Object.keys(properties);
    
    // Add essential company association properties
    const essentialProperties = [
      'associatedcompanyid',
      'company',
      'associatedcompanyname',
      'hs_associatedcompanyid',
      'hs_company_id'
    ];
    
    // Combine all properties, ensuring we have company association data
    const allPropertyNames = Array.from(new Set([...propertyNames, ...essentialProperties]));

    let contacts: FullContact[];
    let nextCursor: string | undefined;
    
    // CRITICAL SAFETY CHECK: Only search if we have specific search criteria
    // NEVER call getAllContacts() to prevent fetching all contacts without filtering
    if (email || firstName || lastName || companyName) {
      // Search for specific contact with all properties
      const result = await searchContacts(
        nango,
        String(id),
        { linkedInUrl, email, firstName, lastName, companyName },
        allPropertyNames,
        fetchAll,
        cursor,
      );
      contacts = result.contacts;
      nextCursor = result.nextCursor;
    } else {
      // SAFETY: Never fetch all contacts without search criteria
      console.error('🚨 BLOCKED: Attempted to call getAllContacts() without search criteria - returning empty result');
      return NextResponse.json(
        { 
          error: "At least one search criterion (email, firstName, lastName, or companyName) is required",
          results: {
            data: [],
            status: 400,
            statusText: "Bad Request - Search criteria required"
          },
          pagination: {
            nextCursor: undefined,
            hasMore: false
          }
        },
        { status: 400 }
      );
    }

    // Format contacts with labels
    const formattedContacts = contacts.map((contact) => {
      const propertiesWithLabels: Record<
        string,
        { value: any; label: string }
      > = {};

      if (contact.properties) {
        Object.entries(contact.properties).forEach(([key, value]) => {
          // Only include properties that are not null
          if (value !== null) {
            propertiesWithLabels[key] = {
              value: value,
              label: propertyLabels[key] || key,
            };
          }
        });
      }

      // // Log the contact data for debugging
      // // });

      return {
        id: contact.id,
        created_at: contact.createdAt,
        updated_at: contact.updatedAt,
        firstname: contact.properties.firstname || "",
        lastname: contact.properties.lastname || "",
        email: contact.properties.email || "",
        properties: propertiesWithLabels,
      };
    });

    return NextResponse.json({
      results: {
        data: formattedContacts,
        status: 200,
        statusText: "OK",
      },
      pagination: {
        nextCursor: nextCursor,
        hasMore: !!nextCursor,
      },
    });
  } catch (error) {
    console.error("Error fetching Hubspot contacts:", error);
    return NextResponse.json(
      { error: "Failed to fetch Hubspot contacts" },
      { status: 500 },
    );
  }
}
