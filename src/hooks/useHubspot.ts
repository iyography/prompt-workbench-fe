import {DefinedInitialDataOptions, useQuery} from "@tanstack/react-query";
import {Company, Contact, Deal, HubspotResponse} from "../types/hubspot";
import {HubspotApiUrlService} from "@/utils/HubspotApiUrlService";

function fetchParams(): RequestInit {
    return {
        // credentials: 'include',
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json'
        }
    };
}

const hubspotApiUrlService = HubspotApiUrlService.create();

export const useHubspotCompanies = (
    connectionId: number | null,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Company>>>,
    currentUsername?: string,
) => {
    return useQuery<HubspotResponse<Company>>({
        ...options,
        queryKey: ["hubspot", "companies", connectionId, currentUsername],
        queryFn: async () => {
            const apiUrl = hubspotApiUrlService.companies(connectionId);
            console.log('🔗 Fetching HubSpot companies:', apiUrl);
            const response = await fetch(apiUrl, fetchParams());
            
            if (!response.ok) {
                console.error('❌ HubSpot companies API error:', response.status, response.statusText);
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ HubSpot companies data received:', data);
            return data;
        },
        retry: 1, // Allow one retry for better reliability
    });
};

export const useHubspotCompany = (
    connectionId?: number,
    companyId?: string,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Company>>>,
    currentUsername?: string,
) => {
    return useQuery<HubspotResponse<Company>>({
        ...options,
        queryKey: ["hubspot", "company", connectionId, companyId, currentUsername],
        queryFn: async () => {
            const apiUrl = hubspotApiUrlService.company(connectionId, companyId);
            console.log('🔗 Fetching HubSpot company:', apiUrl);
            const response = await fetch(apiUrl, fetchParams());
            
            if (!response.ok) {
                console.error('❌ HubSpot company API error:', response.status, response.statusText);
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ HubSpot company data received:', data);
            return data;
        },
        retry: 1, // Allow one retry for better reliability
    });
};

export const useHubspotEmployees = (
    connectionId?: number,
    companyId?: string,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Contact>>>,
    currentUsername?: string,
    fetchAll?: boolean,
    cursor?: string,
) => {
    return useQuery<HubspotResponse<Contact>>({
        ...options,
        queryKey: ["hubspot", "employees", connectionId, companyId, currentUsername, fetchAll, cursor],
        queryFn: async () => {
            const apiUrl = hubspotApiUrlService.companyEmployees(connectionId, companyId, fetchAll, cursor);
            console.log('🔗 Fetching HubSpot employees:', apiUrl);
            const response = await fetch(apiUrl, fetchParams());
            
            if (!response.ok) {
                console.error('❌ HubSpot employees API error:', response.status, response.statusText);
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ HubSpot employees data received:', data);
            return data;
        },
        retry: 1, // Allow one retry for better reliability
    });
};

export const useHubspotContacts = (
    connectionId?: number,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Contact>>>,
    currentUsername?: string,
    fetchAll?: boolean,
    cursor?: string,
) => {
    return useQuery<HubspotResponse<Contact>>({
        ...options,
        queryKey: ["hubspot", "contacts", connectionId, currentUsername, fetchAll, cursor],
        queryFn: async () => {
            const apiUrl = hubspotApiUrlService.contacts(connectionId, undefined, undefined, undefined, undefined, undefined, fetchAll, cursor);
            console.log('🔗 Fetching HubSpot contacts:', apiUrl);
            const response = await fetch(apiUrl, fetchParams());
            
            if (!response.ok) {
                console.error('❌ HubSpot contacts API error:', response.status, response.statusText);
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ HubSpot contacts data received:', data);
            return data;
        },
        retry: 1, // Allow one retry for better reliability
    });
};

export const useAtwoodHubspotVariables = (
    connectionId?: number,
    searchParams?: { email?: string; firstName?: string; lastName?: string },
    options?: Partial<DefinedInitialDataOptions<Record<string, string>>>,
    currentUsername?: string,
) => {
    return useQuery<Record<string, string>>({
        ...options,
        queryKey: ["hubspot", "contact", connectionId, searchParams, currentUsername],
        queryFn: async (): Promise<Record<string, string>> => {

            const apiUrl = hubspotApiUrlService.fullHubspotVariables(connectionId, searchParams?.email, searchParams?.firstName, searchParams?.lastName);
            const response = await fetch(apiUrl, fetchParams());
            const data = await response.json() as {variables: Record<string, string>};
            data.variables.hubspot_guaranteed_value = '';

            return data.variables;
        },
        retry: false,
    });
};

export const useHubspotContact = (
    connectionId?: number,
    searchParams?: { linkedInUrl?: string; email?: string; firstName?: string; lastName?: string; companyName?: string },
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Contact>>>,
    currentUsername?: string,
) => {
    return useQuery<HubspotResponse<Contact>>({
        ...options,
        queryKey: ["hubspot", "contact", connectionId, searchParams, currentUsername],
        queryFn: async () => {
            // Priority: LinkedIn URL > Email > Name + Company
            const apiUrl = hubspotApiUrlService.contacts(
                connectionId, 
                searchParams?.linkedInUrl,  // Priority 1: LinkedIn URL
                searchParams?.email,        // Priority 2: Email
                searchParams?.firstName,    // Priority 3: Name + Company
                searchParams?.lastName,
                searchParams?.companyName
            );
            console.log('🔗 Fetching HubSpot contact:', apiUrl, { searchParams });
            const response = await fetch(apiUrl, fetchParams());
            
            if (!response.ok) {
                console.error('❌ HubSpot contact API error:', response.status, response.statusText);
                throw new Error(`HubSpot API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ HubSpot contact data received:', data);
            return data;
        },
        retry: 1, // Allow one retry for better reliability
    });
};

export const useHubspotVariable = () => {
  return useQuery({
    queryKey: ["hubspot", "guaranteed-variable"],
    queryFn: async () => ({
      hubspot_guaranteed_value: ""
    })
  });
};

export const useHubspotDeals = (
    connectionId: number,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<Deal>>>,
    currentUsername?: string,
) => {
    return useQuery<HubspotResponse<Deal>>({
        ...options,
        queryKey: ["hubspot", "deals", connectionId, currentUsername],
        queryFn: async () => {
            const apiUrl = hubspotApiUrlService.deals(connectionId);
            const response = await fetch(apiUrl, fetchParams());
            const data = await response.json();

            return data;
        },
        retry: false,
    });
};

export const useHubspotDeal = (
    connectionId?: number,
    contactId?: string,
    companyId?: string,
    companyName?: string,
    options?: Partial<DefinedInitialDataOptions<{ deal: Deal }>>,
    currentUsername?: string,
) => {
    return useQuery<{ deal: Deal }>({
        ...options,
        queryKey: ["hubspot", "deal", connectionId, contactId, companyId, companyName, currentUsername],
        queryFn: async ({ signal }) => {
            const apiUrl = hubspotApiUrlService.deal(connectionId, contactId, companyId, companyName);
            const startTime = Date.now();

            // Create a custom AbortController with timeout
            const timeoutDuration = 15000; // 15 seconds timeout
            const timeoutId = setTimeout(() => {
                console.warn(`⏱️ HubSpot deal API call taking longer than ${timeoutDuration / 1000}s - may timeout soon`);
            }, timeoutDuration);

            try {
                const response = await fetch(apiUrl, {
                    ...fetchParams(),
                    signal, // Pass the abort signal from React Query
                });

                const elapsedTime = Date.now() - startTime;
                clearTimeout(timeoutId);
                const data = await response.json();

                // If no deal found, log it clearly
                if (response.status === 404 || !data.deal) {
                }

                return data;
            } catch (error) {
                const elapsedTime = Date.now() - startTime;
                clearTimeout(timeoutId);
                
                // If the error is due to abortion/timeout, return empty result
                if (error instanceof Error && error.name === 'AbortError') {
                    console.warn(`⏱️ HubSpot deal request aborted after ${elapsedTime}ms`);
                    return { error: 'Request timeout', deal: null };
                }
                
                console.error(`❌ HubSpot deal request failed after ${elapsedTime}ms:`, error);
                throw error;
            }
        },
        retry: false,
        // Add timeout configuration
        gcTime: 30000, // Cache for 30 seconds
        staleTime: 15000, // Consider stale after 15 seconds
    });
};

interface HubspotCompanySearchResult {
    id: string;
    name: string;
    domain: string;
    hs_is_target_account: string;
    industry: string;
    city: string;
    state: string;
}

export const useHubspotCompanySearch = (
    connectionId?: number,
    companyName?: string,
    website?: string,
    options?: Partial<DefinedInitialDataOptions<HubspotResponse<HubspotCompanySearchResult>>>,
) => {
    return useQuery<HubspotResponse<HubspotCompanySearchResult>>({
        ...options,
        queryKey: ["hubspot", "company-search", connectionId, companyName, website],
        queryFn: async () => {
            const response = await fetch('/api/hubspot/companies/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    connectionId,
                    companyName,
                    website,
                }),
            });
            const data = await response.json();

            return data;
        },
        retry: false,
    });
};