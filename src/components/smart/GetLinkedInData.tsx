import React, { useCallback, useEffect, useState } from "react";
import { useBackendQuery, useBackendMutation } from "@/hooks/networking";
import { LinkedInProfile, LinkedInProfileBD } from "@/models/linkedin-profile";
import { Company } from "@/models/company";
import { Company as HubspotCompany, Contact, Deal } from "@/types/hubspot";
import { flattenHubspotData } from "@/utils/formatting";
import { formatHubspotEmployees } from "@/utils/formatting";
import { levenshteinDistance } from "@/utils/levenshtein";
import { DictionaryTable } from "../common/DictionaryTable";
import { LinkedInJobs } from "../apify/LinkedInJobs";
import { LinkedInPosts } from "../apify/LinkedInPosts";
import { CompanyEnrichment } from "./CompanyEnrichment";
import HubspotCompanies from "../integrations/HubspotCompanies";
import HubspotContacts from "../integrations/HubspotContacts";
import HubspotDeals from "../integrations/HubspotDeals";
import { useCompanyEnrichment } from "@/hooks/useCompanyEnrichment";
import { Profile } from "@/models/profile";
import { useHubspotCompany, useHubspotContact, useHubspotDeal, useHubspotVariable, useHubspotEmployees } from "@/hooks/useHubspot";
import { HubspotApiUrlService } from "@/utils/HubspotApiUrlService";
import { getLinkedInUsernameFromUrl } from "@/utils/linkedin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Nango from "@nangohq/frontend";


const hubspotApiUrlService = HubspotApiUrlService.create();
// Constants
const LINKEDIN_RETRY_LIMIT = 3;
const LINKEDIN_RETRY_WAIT_MS = 1000 * 60; // 1 minute
const DEFAULT_LINKEDIN_URL =
    "https://www.linkedin.com/in/mike-isernio-0135b07b/";

// Types
interface GetLinkedInDataProps {
    onLoadData?: (linkedInProfile: LinkedInProfile) => void;
    setHubspotVariables?: (variables: Record<string, string>) => void;
    setLinkedInVariables?: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    hideDataTable?: boolean;
    hidePersonaData?: boolean;
}

// Loading Indicator Component
export const LoadingIndicator = ({message}: { message: string }) => (
    <div className={`flex items-center gap-2 text-indigo-700`}>
        <div
            className={`animate-spin h-4 w-4 border-2 border-indigo-700 rounded-full border-t-transparent`}
        ></div>
        <span>{message}</span>
    </div>
);

// Extract company ID from LinkedIn profile data
const extractCompanyId = (profileData?: any): string | undefined => {
    if (!profileData) {
        return undefined;
    }

    // Check if active_experience_company_id is directly available
    if (profileData.active_experience_company_id) {
        return profileData.active_experience_company_id.toString();
    }

    // Check for other possible field names
    const possibleCompanyIdFields = ['company_id', 'active_company_id', 'current_company_id', 'employer_id'];
    for (const fieldName of possibleCompanyIdFields) {
        if (profileData[fieldName]) {
            return profileData[fieldName].toString();
        }
    }

    // Check in experience array for the most recent experience
    if (profileData.experience && Array.isArray(profileData.experience)) {
        for (let i = 0; i < profileData.experience.length; i++) {
            const exp = profileData.experience[i];

            if (exp && typeof exp === 'object' && exp.company_id) {
                return exp.company_id.toString();
            }
        }
    }

    return undefined;
};

// Extract job search query from LinkedIn headline
const extractJobSearchQuery = (headline: string | undefined, profileData?: any): { searchQuery: string, companyName?: string } => {
    if (!headline && !profileData) return { searchQuery: '' };

    // First, try to extract company name from experience section
    if (profileData && profileData.experience && Array.isArray(profileData.experience)) {
        // Look for the most recent/active experience
        for (let i = 0; i < profileData.experience.length; i++) {
            const exp = profileData.experience[i];

            if (exp && typeof exp === 'object') {
                // Try different possible field names for company name
                const possibleCompanyFields = ['company_name', 'company', 'companyName', 'employer', 'organization'];

                for (const fieldName of possibleCompanyFields) {
                    if (exp[fieldName]) {
                        const companyName = exp[fieldName].trim();
                        if (isValidCompanyName(companyName)) {
                            return { searchQuery: companyName, companyName };
                        }
                    }
                }
                
                // If no direct company field, try to extract from title/description
                // Experience entries often have format like "CEO at Company Name" or "Co-founder And CEO at Boston Venture Studio"
                const title = exp.title || exp.job_title || exp.role || '';
                const description = exp.description || exp.summary || '';
                const combinedText = `${title} ${description}`.trim();

                // Look for "at Company Name" pattern
                const atPattern = /\bat\s+([A-Za-z0-9\s\.\-]+?)(?:\s*\||\s*$)/i;
                const atMatch = combinedText.match(atPattern);

                if (atMatch) {
                    const companyName = atMatch[1].trim();
                    if (isValidCompanyName(companyName)) {
                        return { searchQuery: companyName, companyName };
                    }
                }

                // Look for "of Company Name" pattern
                const ofPattern = /\bof\s+([A-Za-z0-9\s\.\-]+?)(?:\s*\||\s*$)/i;
                const ofMatch = combinedText.match(ofPattern);

                if (ofMatch) {
                    const companyName = ofMatch[1].trim();
                    if (isValidCompanyName(companyName)) {
                        return { searchQuery: companyName, companyName };
                    }
                }
            }
        }
    }
    
    // If no experience data, fall back to headline extraction
    if (!headline) return { searchQuery: '' };

    // Clean the headline first - remove extra spaces and special characters
    const cleanHeadline = headline.replace(/\s+/g, ' ').trim();
    
    // Patterns to extract company name from headline
    const patterns = [
        // "Software Engineer at Google" -> Google
        /^([A-Za-z\s]+)\s+at\s+(.+)$/i,
        // "CEO of Company" -> Company
        /^([A-Za-z\s]+)\s+of\s+(.+)$/i,
        // "Manager, Company" -> Company
        /^([A-Za-z\s]+),\s+(.+)$/i,
        // "COO at ZeroBounce" -> ZeroBounce
        /^([A-Z]{2,})\s+at\s+(.+)$/i,
        // "M.D. at Company" -> Company
        /^([A-Z]\.D\.)\s+at\s+(.+)$/i,
        // "M.D., Company" -> Company
        /^([A-Z]\.D\.),\s+(.+)$/i,
        // "M.D. of Company" -> Company
        /^([A-Z]\.D\.)\s+of\s+(.+)$/i
    ];
    
    for (const pattern of patterns) {
        const match = cleanHeadline.match(pattern);
        if (match) {
            const companyName = match[2].trim();
            // Clean up the company name - remove any trailing text after common separators
            const cleanCompanyName = companyName.split(/[|,;]/)[0].trim();
            if (isValidCompanyName(cleanCompanyName)) {
                return { searchQuery: cleanCompanyName, companyName: cleanCompanyName };
            }
        }
    }
    
    // If no pattern matches, try to extract company name from "at" or "of"
    const atIndex = cleanHeadline.indexOf(' at ');
    const ofIndex = cleanHeadline.indexOf(' of ');
    
    if (atIndex > 0) {
        const companyName = cleanHeadline.substring(atIndex + 4).trim();
        const cleanCompanyName = companyName.split(/[|,;]/)[0].trim();
        if (isValidCompanyName(cleanCompanyName)) {
            return { searchQuery: cleanCompanyName, companyName: cleanCompanyName };
        }
    }

    if (ofIndex > 0) {
        const companyName = cleanHeadline.substring(ofIndex + 4).trim();
        const cleanCompanyName = companyName.split(/[|,;]/)[0].trim();
        if (isValidCompanyName(cleanCompanyName)) {
            return { searchQuery: cleanCompanyName, companyName: cleanCompanyName };
        }
    }
    
    // Try to find common company names in the headline
    const commonCompanies = [
        'Deloitte', 'Google', 'Microsoft', 'Apple', 'Amazon', 'Meta', 'Netflix', 'ZeroBounce', 'Splunk', 'Kayak.com', 'Kayak',
        'Boston Venture Studio', 'Supercal.com', 'Deets', 'Embrace Boston', 'Xiangqi.com',
        'Hospital', 'Medical Center', 'Clinic', 'University', 'College'
    ];
    for (const company of commonCompanies) {
        if (cleanHeadline.toLowerCase().includes(company.toLowerCase())) {
            return { searchQuery: company, companyName: company };
        }
    }

    // If the headline contains "M.D." or "MD", it's likely a medical professional
    if (cleanHeadline.includes('M.D.') || cleanHeadline.includes('MD')) {
        return { searchQuery: 'healthcare', companyName: 'healthcare' };
    }

    // If the headline contains "Ph.D." or "PhD", it's likely an academic
    if (cleanHeadline.includes('Ph.D.') || cleanHeadline.includes('PhD')) {
        return { searchQuery: 'academic', companyName: 'academic' };
    }
    
    // Enhanced company name extraction - look for any capitalized words that might be company names
    const words = cleanHeadline.split(/\s+/);
    const potentialCompanyNames = words.filter(word => {
        // Look for capitalized words that are likely company names
        return word.length > 2 && 
               word[0] === word[0].toUpperCase() && 
               word[1] === word[1].toLowerCase() &&
               !word.includes('.') &&
               !['The', 'And', 'Or', 'For', 'With', 'From', 'To', 'In', 'On', 'At', 'By'].includes(word);
    });
    
    if (potentialCompanyNames.length > 0) {
        const companyName = potentialCompanyNames[0];
        return { searchQuery: companyName, companyName };
    }

    // Fallback: return empty string to allow user preferences to be used
    return { searchQuery: '' };
};

// Helper function to validate if a string looks like a real company name
const isValidCompanyName = (companyName: string): boolean => {
    if (!companyName || companyName.length < 2 || companyName.length > 50) {
        return false;
    }
    
    // Reject if it contains common job title keywords
    const jobTitleKeywords = [
        'Content', 'Manager', 'Director', 'Lead', 'Senior', 'Junior', 'Associate',
        'Coordinator', 'Specialist', 'Analyst', 'Consultant', 'Advisor', 'Executive',
        'Officer', 'Supervisor', 'Administrator', 'Assistant', 'Representative'
    ];
    
    for (const keyword of jobTitleKeywords) {
        if (companyName.toLowerCase().includes(keyword.toLowerCase())) {
            return false;
        }
    }
    
    // Reject if it contains special characters that indicate it's not a company name
    if (companyName.includes('@') || companyName.includes('|') || companyName.includes('•')) {
        return false;
    }
    
    // Reject if it looks like a job description (contains multiple words that don't form a company name)
    const words = companyName.split(' ');
    if (words.length > 3) {
        return false;
    }
    
    return true;
};

// Helper function to map common company names to their full official names
const getFullCompanyName = (companyName: string): string => {
    const companyMappings: Record<string, string> = {
        'Meta': 'Meta', // Try just "Meta" first
        'Facebook': 'Meta',
        'Google': 'Google', // Try just "Google" first
        'Alphabet': 'Google',
        'Microsoft': 'Microsoft',
        'Apple': 'Apple Inc',
        'Amazon': 'Amazon.com Inc',
        'Netflix': 'Netflix Inc',
        'Tesla': 'Tesla Inc',
        'Twitter': 'X Corp',
        'X': 'X Corp',
        'Uber': 'Uber Technologies Inc',
        'Airbnb': 'Airbnb Inc',
        'Spotify': 'Spotify Technology SA',
        'LinkedIn': 'Microsoft Corporation', // LinkedIn is owned by Microsoft
        'Instagram': 'Meta', // Instagram is owned by Meta
        'WhatsApp': 'Meta', // WhatsApp is owned by Meta
        'YouTube': 'Google', // YouTube is owned by Google
    };
    
    return companyMappings[companyName] || companyName;
};

// Extract contact info from LinkedIn profile data
const extractContactInfo = (profileData: any, linkedInProfile?: LinkedInProfile) => {
    if (!profileData) return undefined;

    const contactInfo: { email?: string; firstName?: string; lastName?: string; companyName?: string } = {};

    // Try to find email in various possible fields
    if (profileData.email) {
        contactInfo.email = profileData.email;
    }

    // Get first name
    if (profileData.first_name) {
        contactInfo.firstName = profileData.first_name;
    }

    // Get last name with special handling
    if (profileData.last_name) {
        const lastName = profileData.last_name;

        // If the last name looks like an initial (e.g., "B."),
        // check if we can get the full last name from the profile_id
        if (lastName.length <= 2 && lastName.includes('.') && linkedInProfile?.profile_id) {
            // Extract the potential last name from the profile_id
            // Assuming profile_id format like "sharibrooks"
            const profileId = linkedInProfile.profile_id;
            const firstName = profileData.first_name?.toLowerCase() || '';

            if (firstName && profileId.toLowerCase().startsWith(firstName.toLowerCase())) {
                // Extract what comes after the first name as potential last name
                const potentialLastName = profileId.slice(firstName.length);

                if (potentialLastName && potentialLastName[0].toLowerCase() === lastName[0].toLowerCase()) {
                    // Use the extracted last name with proper capitalization
                    contactInfo.lastName = potentialLastName.charAt(0).toUpperCase() +
                                          potentialLastName.slice(1).toLowerCase();
                } else {
                    contactInfo.lastName = lastName;
                }
            } else {
                contactInfo.lastName = lastName;
            }
        } else {
            contactInfo.lastName = lastName;
        }
    }

    // Get company name from various possible fields
    if (profileData.company_name) {
        contactInfo.companyName = profileData.company_name;
    } else if (profileData.headline) {
        // Extract company name from headline (e.g., "COO at ZeroBounce" -> "ZeroBounce")
        const headline = profileData.headline;
        const atIndex = headline.indexOf(' at ');
        if (atIndex !== -1) {
            contactInfo.companyName = headline.substring(atIndex + 4).trim();
        }
    }

    return contactInfo;
};

// Custom hook for LinkedIn and Hubspot data fetching logic
const useLinkedInData = (
    onLoadData?: (profile: LinkedInProfile) => void,
    setHubspotVariables?: (d: Record<string, string>) => void,
) => {
    const [profileURL, setProfileURL] = useState<string>(DEFAULT_LINKEDIN_URL);
    const [errorMessage, setErrorMessage] = useState<string>("");
    const [warningMessage, setWarningMessage] = useState<string>("");
    const [retryCount, setRetryCount] = useState<number>(0);
    const [profile, setProfile] = useState<LinkedInProfile | null>(null);

    const { data: guaranteedHubspotVar } = useHubspotVariable();

    // Get user profile for Hubspot connection ID
    const {data: userProfile, isLoading: loadingProfile} =
        useBackendQuery<Profile>("profile/");
    
    // Get company data for job search settings
    const { data: companies } = useBackendQuery<Company[]>("companies/");
    const hookCompany = companies?.[0]; // Get the first company

    // Extract contact info from LinkedIn profile
    const contactInfo = extractContactInfo(profile?.profile_data, profile || undefined);

    // Fetch Hubspot contact data
    const {
        data: hubspotContactData,
        isLoading: loadingHubspotContact,
        error: hubspotContactError,
    } = useHubspotContact(userProfile?.id, contactInfo, {
        enabled: !!(contactInfo && userProfile?.id),
    });
    const hubspotContact = hubspotContactData?.results?.data[0];

    // Fetch company data if contact has associated company
    const {
        data: hubspotCompanyData,
        isLoading: loadingCompany,
        error: hubspotCompanyError,
    } = useHubspotCompany(
        userProfile?.id || 0,
        // Use robust extraction for company id
        String(
            hubspotContact?.properties?.associatedcompanyid?.value ??
            hubspotContact?.properties?.associatedcompanyid ??
            (hubspotContact as any)?.properties?.hs_associatedcompanyid?.value ??
            (hubspotContact as any)?.properties?.hs_associatedcompanyid
        ),
        {
            enabled: !!(
                (
                    hubspotContact?.properties?.associatedcompanyid?.value ||
                    hubspotContact?.properties?.associatedcompanyid ||
                    (hubspotContact as any)?.properties?.hs_associatedcompanyid?.value ||
                    (hubspotContact as any)?.properties?.hs_associatedcompanyid
                ) && userProfile?.id
            ),
        },
    );
    const hubspotCompany = hubspotCompanyData?.results?.data[0];



    // Fetch deal data if contact exists
    const {
        data: hubspotDealData,
        isLoading: loadingDeal,
        error: hubspotDealError,
    } = useHubspotDeal(
        userProfile?.id, // connectionId
        hubspotContact?.id, // contactId
        undefined, // companyId
        contactInfo?.companyName, // companyName - use extracted company name
        {
        enabled: !!(userProfile?.id && hubspotContact?.id),
        },
        undefined // currentUsername
    );

    const hubspotDeal = hubspotDealData?.deal;

    // Fetch employees (coworkers) for the associated company
    const {
        data: hubspotEmployeesData,
        isLoading: loadingEmployees,
        error: hubspotEmployeesError,
    } = useHubspotEmployees(
        userProfile?.id,
        String(
            hubspotContact?.properties?.associatedcompanyid?.value ??
            hubspotContact?.properties?.associatedcompanyid ??
            (hubspotContact as any)?.properties?.hs_associatedcompanyid?.value ??
            (hubspotContact as any)?.properties?.hs_associatedcompanyid
        ),
        {
            enabled: !!(
                userProfile?.id && (
                    hubspotContact?.properties?.associatedcompanyid?.value ||
                    hubspotContact?.properties?.associatedcompanyid ||
                    (hubspotContact as any)?.properties?.hs_associatedcompanyid?.value ||
                    (hubspotContact as any)?.properties?.hs_associatedcompanyid
                )
            ),
        },
    );
    const hubspotEmployees = (hubspotEmployeesData as any)?.results?.data;


    useEffect(() => {
        if (setHubspotVariables) {
            // Start with the guaranteed variables
            let hubspotData = guaranteedHubspotVar || {};

            // Company name resolution: LinkedIn-derived (enrichment available only in parent component)
            const enrichmentCompanyName: string | undefined = undefined;
            const linkedInDerivedCompanyName: string | undefined = (() => {
                if (profile?.profile_data?.company_name) return profile.profile_data.company_name as string;
                const headline = profile?.profile_data?.headline as string | undefined;
                if (headline && headline.includes(' at ')) return headline.split(' at ').pop()?.trim();
                return undefined;
            })();
            const coreSignalCompanyName = enrichmentCompanyName || linkedInDerivedCompanyName;

            const normalizeCompanyName = (name?: string): string => {
                return (name || "")
                    .toLowerCase()
                    .replace(/[,\.]/g, " ")
                    .replace(/\b(inc|incorporated|llc|l\.l\.c|ltd|limited|co|corp|corporation|sa|gmbh|ag|plc)\b/g, "")
                    .replace(/\s+/g, " ")
                    .trim();
            }
            const isFuzzyMatch = (a?: string, b?: string): boolean => {
                const na = normalizeCompanyName(a);
                const nb = normalizeCompanyName(b);
                if (!na || !nb) return false;
                if (na === nb) return true;
                if (na.length >= 4 && nb.includes(na)) return true;
                if (nb.length >= 4 && na.includes(nb)) return true;
                const dist = levenshteinDistance(na, nb);
                const ratio = dist / Math.max(na.length, nb.length);
                return ratio <= 0.25;
            }
            const rawHubspotName: any = (hubspotCompany as any)?.properties?.name?.value ?? (hubspotCompany as any)?.properties?.name;
            const hubspotCompanyName: string | undefined = typeof rawHubspotName === 'string' ? rawHubspotName : undefined;
            const companyNamesMatch = isFuzzyMatch(coreSignalCompanyName, hubspotCompanyName);

            // Add other HubSpot data if available
            if (hubspotContact) {
                hubspotData = {
                    ...hubspotData,
                    ...flattenHubspotData("Contact", hubspotContact)
                };

                if (hubspotCompany && companyNamesMatch) {
                    hubspotData = {
                        ...hubspotData,
                        ...flattenHubspotData("Company", hubspotCompany),
                    };
                }

                if (hubspotDeal && companyNamesMatch) {
                    hubspotData = {
                        ...hubspotData,
                        ...flattenHubspotData("Deal", hubspotDeal),
                    };
                }

                if (hubspotEmployees && Array.isArray(hubspotEmployees) && companyNamesMatch) {
                    hubspotData = {
                        ...hubspotData,
                        ...formatHubspotEmployees(hubspotEmployees),
                    };
                }

                // Expose match status for UI/plays
                hubspotData = {
                    ...hubspotData,
                    hubspot_company_match_status: companyNamesMatch ? "matched" : "mismatch"
                };
 
 
            }
 
            // Add LinkedIn posts and jobs data to variables for plays
            if (profile) {
                // LinkedIn posts data
                hubspotData = {
                    ...hubspotData,
                    linkedin_posts_count: "5", // Default count
                    linkedin_posts_company: profile.profile_data?.headline || "Unknown",
                };

                // LinkedIn jobs data
                const jobSearchQuery = extractJobSearchQuery(profile.profile_data?.headline);
                
                // Priority 1: Use company's configured job search term if available
                const companyName = hookCompany?.linkedin_job_search_term || 
                                   (hubspotData as any)?.hubspot_guaranteed_value || 
                                   jobSearchQuery.companyName || 
                                   jobSearchQuery.searchQuery;
                const searchQuery = hookCompany?.linkedin_job_search_term || 
                                   (hubspotData as any)?.hubspot_guaranteed_value || 
                                   jobSearchQuery.searchQuery;
                
                hubspotData = {
                    ...hubspotData,
                    linkedin_jobs_count: "0", // Will be updated when jobs are fetched
                    linkedin_jobs_company: companyName,
                    linkedin_jobs_search_query: searchQuery,
                };
            }

            // Always set the variables, even if we only have the guaranteed ones
            setHubspotVariables(hubspotData);
        }
    }, [
        guaranteedHubspotVar,
        loadingDeal,
        loadingEmployees,
        loadingCompany,
        loadingHubspotContact,
        hubspotContact,
        hubspotCompany,
        hubspotDeal,
        hubspotEmployees,
        profile,
        setHubspotVariables,
        hookCompany
    ]);

    const {data: connectionData, isLoading: loadingConnection} = useQuery({
        queryKey: ["hubspot-connection"],
        queryFn: async () => {
            if (!userProfile?.id) return null;

            const response = await fetch(hubspotApiUrlService.connection(userProfile.id));
            if (!response.ok) {
                return null;
            }
            return response.json();
        },
        enabled: !!profile,
    });

    const client = useQueryClient();

    const connectHubspot = async () => {
        if (!profile) return;
        try {
            const nango = new Nango({
                publicKey: process.env.NEXT_PUBLIC_NANGO_PUBLIC_KEY || "",
            });
            const result = await nango.auth("hubspot", String(userProfile?.id), {});

            if (result.connectionId) {
                client.invalidateQueries({queryKey: ["hubspot-connection"]});
                client.invalidateQueries({queryKey: ["hubspot"]});
                fetchProfile();
            }
        } catch (error) {
            console.error("Failed to connect to HubSpot:", error);
        }
    };

    const {mutate, isPending} = useBackendMutation<
        LinkedInProfileBD,
        LinkedInProfile
    >("linkedin-profiles/", "POST", {
        shouldCacheResponse: false,
        onSuccess: async (data, variables) => {
            // Check if data has the expected structure
            if (data) {
                setProfile(data);
                setRetryCount(0);
                if (onLoadData) onLoadData(data);
            } else {
                handleRetry(variables);
            }
        },
        onError: (error) => {
            handleError();
        },
    });



    const handleRetry = (variables: LinkedInProfileBD) => {
        if (retryCount < LINKEDIN_RETRY_LIMIT) {
            setWarningMessage(
                "We're fetching this data fresh from LinkedIn. This process can take up to 3 minutes. This page will automatically update when ready.",
            );
            setRetryCount((count) => count + 1);
            setTimeout(() => mutate(variables), LINKEDIN_RETRY_WAIT_MS);
        } else {
            handleError();
        }
    };

    const handleError = () => {
        setErrorMessage(
            "We were unable to fetch the data from LinkedIn. Please try again later. If the issue persists, please contact support.",
        );
        setWarningMessage("");
        setRetryCount(0);
    };

    const fetchProfile = () => {
        if (isPending || retryCount > 0) return;

        // Check if input is an email address
        const isEmail = profileURL.includes('@') && !profileURL.includes('linkedin.com');
        
        if (isEmail) {
            // Handle email input - send email to backend
            setErrorMessage("");
            setWarningMessage("");
            mutate({email: profileURL});
        } else {
            // Handle LinkedIn URL input
        const username = getLinkedInUsernameFromUrl(profileURL);
        if (username) {
            setErrorMessage("");
            setWarningMessage("");
            mutate({profile_id: username});
        } else {
            setErrorMessage(
                    "Please enter a valid LinkedIn profile URL (like https://www.linkedin.com/in/username) or email address",
            );
            }
        }
    };

    const showConnectButton =
        !loadingConnection && !connectionData?.connection && !loadingHubspotContact;

    const hubspotError =
        !loadingConnection &&
        connectionData?.connection &&
        !loadingHubspotContact &&
        !hubspotContact
            ? "No HubSpot contact found."
            : (hubspotContactError || hubspotCompanyError || hubspotDealError)
                ?.message;

    return {
        profileURL,
        setProfileURL,
        errorMessage,
        warningMessage,
        hubspotError,
        profile,
        hubspotContact,
        hubspotCompany,
        hubspotDeal,
        hubspotEmployees,
        loadingHubspotContact,
        loadingCompany,
        loadingDeal,
        loadingEmployees,
        connectHubspot,
        showConnectButton,
        isLoading: isPending || loadingProfile || retryCount > 0,
        fetchProfile,
        guaranteedHubspotVar,
        company: hookCompany
    };
};

// Enhanced Input Component for LinkedIn URL or Email
const LinkedInInput = ({
                              profileURL,
                              setProfileURL,
                              isLoading,
                              onFetch,
                          }: {
    profileURL: string;
    setProfileURL: (url: string) => void;
    isLoading: boolean;
    onFetch: () => void;
}) => {
    const isEmail = profileURL.includes('@') && !profileURL.includes('linkedin.com');
    const isLinkedInUrl = profileURL.includes('linkedin.com/in/');
    
    return (
    <div className="flex flex-col gap-2 w-full">
            <label htmlFor="linkedin-input">Import Data from LinkedIn:</label>
        <div className="flex gap-4 w-full">
            <input
                value={profileURL}
                onChange={(e) => setProfileURL(e.target.value)}
                type="text"
                    name="linkedin-input"
                    id="linkedin-input"
                autoComplete="off"
                className="block w-full primary-input h-fit flex-grow"
                    placeholder="https://www.linkedin.com/in/username or user@company.com"
            />
            <button
                disabled={!profileURL || isLoading}
                type="submit"
                className="btn-primary w-fit flex-shrink-0 flex-grow-0"
                onClick={onFetch}
            >
                Fetch Data
            </button>
        </div>
            <div className="text-sm text-gray-600">
                {isEmail && (
                    <span className="text-blue-600">📧 Using email - will search HubSpot for LinkedIn profile</span>
                )}
                {isLinkedInUrl && (
                    <span className="text-green-600">🔗 Using LinkedIn URL - direct lookup</span>
                )}
                {profileURL && !isEmail && !isLinkedInUrl && (
                    <span className="text-orange-600">⚠️ Please enter a valid LinkedIn URL or email address</span>
                )}
        </div>
    </div>
);
};

// Hubspot Data Display Component
const HubspotDataDisplay = <T extends HubspotCompany | Contact | Deal>({
                                                                    info,
                                                                    name,
                                                                }: {
    info: T;
    name: Parameters<typeof flattenHubspotData>["0"];
}) => {
    const data = flattenHubspotData(name, info);

    return (
        <details className="mt-4">
            <summary className="cursor-pointer font-medium">
                Hubspot {name} Data
            </summary>
            <DictionaryTable data={data}/>
        </details>
    );
};

// LinkedIn Data Display Component
const LinkedInDataDisplay = ({
                                 profile,
                                 hidePersonaData,
                             }: {
    profile: LinkedInProfile;
    hidePersonaData: boolean;
}) => {
    const [detectedPersonaName, rawPersonaData] = Object.entries(
        profile.persona || {},
    )?.[0] || ["", {}];
    
    // Convert personaData to proper format for DictionaryTable
    const personaData = typeof rawPersonaData === 'object' && rawPersonaData !== null 
        ? Object.entries(rawPersonaData).reduce((acc, [key, value]) => {
            // Convert arrays to strings, keep strings as is
            const stringValue = Array.isArray(value) ? value.join(', ') : String(value);
            return { ...acc, [key]: stringValue };
        }, {} as Record<string, string>)
        : {};

    return (
        <>
            <p className="subtitle">Click sections below to expand/collapse data.</p>
            {!hidePersonaData && (
                <details className="mt-4">
                    <summary className="cursor-pointer font-medium">
                        Detected Persona: {detectedPersonaName}
                    </summary>
                    <div className="mt-2">
                        <DictionaryTable data={personaData}/>
                    </div>
                </details>
            )}
            <details className="mt-4">
                <summary className="cursor-pointer font-medium">
                    LinkedIn Profile Data
                </summary>
                <div className="mt-2">
                    <DictionaryTable data={profile.profile_data || {}}/>
                </div>
            </details>
        </>
    );
};

// Main Component
export const GetLinkedInData = ({
                                    onLoadData,
                                    setHubspotVariables,
    setLinkedInVariables,
                                    hideDataTable = false,
                                    hidePersonaData: forceHidePersonaData = false,
                                }: GetLinkedInDataProps) => {
    // Get company data for job search preferences
    const { data: companies } = useBackendQuery<Company[]>("companies/");
    const componentCompany = companies?.[0]; // Get the first company
    
    const {
        profileURL,
        setProfileURL,
        errorMessage,
        warningMessage,
        hubspotError,
        profile,
        hubspotContact,
        hubspotCompany,
        hubspotDeal,
        hubspotEmployees,

        loadingHubspotContact,
        loadingCompany,
        loadingDeal,
        loadingEmployees,
        connectHubspot,
        isLoading,
        showConnectButton,
        fetchProfile,
        guaranteedHubspotVar,
        company: hookCompany
    } =  useLinkedInData(onLoadData, setHubspotVariables);

    // Extract company ID from LinkedIn profile data
    const companyId = extractCompanyId(profile?.profile_data_raw || profile?.profile_data);
    
    // Get company enrichment data
    const { data: companyData } = useCompanyEnrichment(companyId, !!companyId);
    
    




    // Update LinkedIn variables for plays when profile changes
    useEffect(() => {
        if (setLinkedInVariables && profile) {
            const jobSearchQuery = extractJobSearchQuery(profile.profile_data?.headline, profile.profile_data);
            
            // Priority 1: Use extracted company name from LinkedIn headline
            const companyName = jobSearchQuery.companyName || 
                               jobSearchQuery.searchQuery || 
                               guaranteedHubspotVar?.hubspot_guaranteed_value || 
                               componentCompany?.linkedin_job_search_term;
            const searchQuery = jobSearchQuery.searchQuery || 
                               guaranteedHubspotVar?.hubspot_guaranteed_value || 
                               componentCompany?.linkedin_job_search_term;
            
            const linkedInData = {
                linkedin_posts_count: "5", // Default count, will be updated by posts component
                linkedin_posts_company: profile.profile_data?.headline || "Unknown",
                linkedin_jobs_count: "0", // Will be updated by jobs component
                linkedin_jobs_company: companyName || "Unknown",
                linkedin_jobs_search_query: searchQuery || "Unknown",
                // LinkedIn profile is base data - no guaranteed variable needed
            };
            setLinkedInVariables(linkedInData);
        }
    }, [profile, setLinkedInVariables, guaranteedHubspotVar, componentCompany]);

    // Update HubSpot guaranteed variable when HubSpot data changes
    useEffect(() => {
        if (setLinkedInVariables && guaranteedHubspotVar) {
            setLinkedInVariables((prev: Record<string, string>) => ({
                ...prev,
                // BATCH 3: HubSpot guaranteed variable
                hubspot_guaranteed: guaranteedHubspotVar?.hubspot_guaranteed_value ? "complete" : "no_data",
            }));
        }
    }, [guaranteedHubspotVar, setLinkedInVariables]);

    // Callbacks for updating LinkedIn data with guaranteed variables
    const handlePostsDataUpdate = useCallback((data: Record<string, string>) => {
        if (setLinkedInVariables) {
            setLinkedInVariables((prev: Record<string, string>) => ({
                ...prev,
                ...data,
                // BATCH 4: LinkedIn Posts guaranteed variable
                linkedin_posts_guaranteed: data && Object.keys(data).length > 0 ? "complete" : "no_data",
            }));
        }
    }, [setLinkedInVariables]);

    const handleJobsDataUpdate = useCallback((data: Record<string, string>) => {
        if (setLinkedInVariables) {
            setLinkedInVariables((prev: Record<string, string>) => ({
                ...prev,
                ...data,
                // BATCH 5: LinkedIn Jobs guaranteed variable
                linkedin_jobs_guaranteed: data && Object.keys(data).length > 0 ? "complete" : "no_data",
            }));
        }
        // Persist enrichment company name locally for job search
        if (data.company_company_name) {
            setCompanyNameFromEnrichment(data.company_company_name);
        }
    }, [setLinkedInVariables]);

    const [companyNameFromEnrichment, setCompanyNameFromEnrichment] = useState<string | undefined>(undefined);

    const handleCompanyDataUpdate = useCallback((data: Record<string, string>) => {
        if (setLinkedInVariables) {
            setLinkedInVariables((prev: Record<string, string>) => ({
                ...prev,
                ...data,
                // BATCH 2: Company Enrichment guaranteed variable
                company_enrichment_guaranteed: data && Object.keys(data).length > 0 ? "complete" : "no_data",
            }));
        }
        // Persist enrichment company name locally for job search
        if (data.company_company_name) {
            setCompanyNameFromEnrichment(data.company_company_name);
        }
    }, [setLinkedInVariables]);

    return (
        <>
            <LinkedInInput
                profileURL={profileURL}
                setProfileURL={setProfileURL}
                isLoading={isLoading}
                onFetch={fetchProfile}
            />
            {hideDataTable ? null : isLoading ? (
                <LoadingIndicator message="Loading LinkedIn Data..."/>
            ) : errorMessage ? (
                <p className="error">⛔️ {errorMessage}</p>
            ) : warningMessage ? (
                <p className="subtitle">⚠️ {warningMessage}</p>
            ) : profile ? (
                <>
                    <LinkedInDataDisplay
                        profile={profile}
                        hidePersonaData={forceHidePersonaData}
                    />
                    {showConnectButton && (
                        <button onClick={connectHubspot} className="btn-primary w-fit">
                            Connect Hubspot
                        </button>
                    )}
                    {loadingHubspotContact ? (
                        <LoadingIndicator message="Finding matching Hubspot contact..."/>
                    ) : hubspotContact ? (
                        <>
                            <HubspotDataDisplay info={hubspotContact} name="Contact"/>
                            {loadingCompany ? (
                                <LoadingIndicator message="Loading company data..."/>
                            ) : hubspotCompany ? (
                                <HubspotDataDisplay info={hubspotCompany} name="Company"/>
                            ) : null}
                            {loadingDeal ? (
                                <LoadingIndicator message="Loading deal data..."/>
                            ) : hubspotDeal ? (
                                <HubspotDataDisplay info={hubspotDeal} name="Deal"/>
                            ) : null}

                            {loadingEmployees ? (
                                <LoadingIndicator message="Loading coworkers..."/>
                            ) : Array.isArray(hubspotEmployees) && hubspotEmployees.length > 0 ? (
                                <details className="mt-4">
                                    <summary className="cursor-pointer font-medium">
                                        Hubspot Coworkers ({hubspotEmployees.length})
                                    </summary>
                                    <div className="mt-2 flex flex-col gap-4">
                                        {hubspotEmployees.map((e: any) => (
                                            <details key={e.id} className="border rounded-md p-3">
                                                <summary className="cursor-pointer font-medium">
                                                    {e.firstname} {e.lastname}
                                                    {e.properties?.jobtitle?.value ? ` — ${e.properties.jobtitle.value}` : ""}
                                                    {e.email ? ` · ${e.email}` : ""}
                                                </summary>
                                                <div className="mt-2">
                                                    <DictionaryTable data={flattenHubspotData("Contact", e)} />
                                                </div>
                                            </details>
                                        ))}
                                    </div>
                                </details>
                            ) : null}

                       </>
                    ) : (
                        hubspotError ? (
                            <p className="error">⛔️ {hubspotError}</p>
                        ) : null
                    )}
                    
                    {/* Apify LinkedIn Posts - Always show regardless of HubSpot data */}
                    <LinkedInPosts 
                        profileUrl={profileURL}
                        maxPosts={5}
                        enabled={!!profile}
                        onDataUpdate={handlePostsDataUpdate}
                    />
                    
                    {/* Company Enrichment - Show company details from CoreSignal */}
                    {(() => {
                        return companyId && (
                    <details className="mt-4">
                        <summary className="cursor-pointer font-medium">
                                    🏢 Company Enrichment Data
                        </summary>
                                <div className="mt-2">
                                    <CompanyEnrichment 
                                        companyId={companyId}
                                        enabled={!!profile && !!companyId}
                                        onDataUpdate={handleCompanyDataUpdate}
                                    />
                                </div>
                    </details>
                        );
                    })()}
                    
                    {/* Apify LinkedIn Jobs - Only show if Company Enrichment data is available */}
                    <LinkedInJobs
                        verifiedCompanyName={companyNameFromEnrichment}
                        linkedInCompanyId={companyId}
                        searchQuery={(() => {
                            // Get user's job preferences
                            const userJobKeyword = componentCompany?.linkedin_job_search_term || '';
                            
                            // Extract company name from LinkedIn profile data (experience section first, then headline)
                            const headline = profile?.profile_data?.headline;
                            const profileData = profile?.profile_data;
                            const result = extractJobSearchQuery(headline, profileData);
                            
                            // Priority 1: Use company name from Company Enrichment data (most accurate)
                            if (companyNameFromEnrichment) {
                                const companyName = companyNameFromEnrichment;
                                const fullCompanyName = getFullCompanyName(companyName);
                                
                                // If user has specified a job keyword, search for that job at the company
                                if (userJobKeyword && userJobKeyword.trim()) {
                                    // Search for "software engineer jobs at Meta Platforms" format
                                    const combinedQuery = `${userJobKeyword} at ${fullCompanyName}`;
                                    return combinedQuery;
                                } else {
                                    // If no job keyword specified, just search for all jobs at the company
                                    return fullCompanyName;
                                }
                            }
                            
                            // Priority 2: Use company name from LinkedIn profile data
                            if (result.companyName && result.companyName.trim() !== '') {
                                const companyName = result.companyName;
                                const fullCompanyName = getFullCompanyName(companyName);
                                
                                // If user has specified a job keyword, search for that job at the company
                                if (userJobKeyword && userJobKeyword.trim()) {
                                    // Search for "software engineer jobs at Meta Platforms" format
                                    const combinedQuery = `${userJobKeyword} at ${fullCompanyName}`;
                                    return combinedQuery;
                                } else {
                                    // If no job keyword specified, just search for all jobs at the company
                                    return fullCompanyName;
                                }
                            }
                            
                            // Priority 3: Use HubSpot company name
                            if (hubspotContact?.properties?.company?.value) {
                                const companyName = String(hubspotContact.properties.company.value);
                                const fullCompanyName = getFullCompanyName(companyName);
                                
                                if (userJobKeyword && userJobKeyword.trim()) {
                                    const combinedQuery = `${userJobKeyword} at ${fullCompanyName}`;
                                    return combinedQuery;
                                } else {
                                    return fullCompanyName;
                                }
                            }
                            
                            // Priority 4: Use onboarding company name
                            if (componentCompany?.linkedin_job_search_term && componentCompany.linkedin_job_search_term.trim() !== '') {
                                return componentCompany.linkedin_job_search_term;
                            }
                            
                            // Final fallback: use the search query from headline extraction (now potentially empty)
                            return result.searchQuery || '';
                        })()}
                        location={componentCompany?.linkedin_job_location || "United States"}
                        jobType={componentCompany?.linkedin_job_search_term || "full-time"}
                        experienceLevel={componentCompany?.linkedin_job_search_term || "mid-senior"}
                        maxJobs={Math.min(componentCompany?.linkedin_max_job_details || 10, 5)}
                        enabled={!!profile}
                        onDataUpdate={handleJobsDataUpdate}
                    />
                </>
            ) : null}
        </>
    );
};