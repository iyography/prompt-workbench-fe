import { Dictionary } from "lodash";
import { Play, PlayOutputType, RunFinalPlayResponseType } from "../../models/play";
import { useBackendMutation, useBackendQuery } from "../../hooks/networking";
import { useCompanyAndProfileVariables } from "../../hooks/useCompanyAndProfileVariables";
import {
    useHubspotCompany,
    useHubspotContact,
    useHubspotDeal,
    useHubspotEmployees,
} from "../../hooks/useHubspot";
import { LinkedInProfile, LinkedInProfileBD } from "../../models/linkedin-profile";
import { useCompanyEnrichment } from "@/hooks/useCompanyEnrichment";
import { useLinkedInJobs, useLinkedInPosts } from "@/hooks/useApify";
import { useOrgChartMatching } from "@/hooks/useOrgChartMatching";
import React from "react";
import { flattenHubspotData, formatHubspotEmployees } from "../../utils/formatting";
import { levenshteinDistance } from "@/utils/levenshtein";
import { getAccountIntelForResearch } from "@/hooks/useOrgChartMatching";

interface PlayRanServerSide extends Play {
    value: string;
    name: string;
}

interface UseViewApiCallsProps {
    shouldFetchData: boolean;
    currentUsername?: string;
    linkedInProfile?: LinkedInProfile;
    profile?: any;
    extractedEmailFromHubSpot?: string;
    linkedin?: any;
    companyName?: string;
    companyId?: string;
    linkedInCompanyId?: string;
    verifiedCompanyName?: string;
    effectiveCoreSignalCompanyName?: string;
    companyEnrichmentWebsite?: string;
    shouldCallHubspot: boolean;
    hubspotContactFinished: boolean;
    hasValidHubspotContact: boolean;
}

export function useViewApiCalls({
    shouldFetchData,
    currentUsername,
    linkedInProfile,
    profile,
    extractedEmailFromHubSpot,
    linkedin,
    companyName,
    companyId,
    linkedInCompanyId,
    verifiedCompanyName,
    effectiveCoreSignalCompanyName,
    companyEnrichmentWebsite,
    shouldCallHubspot,
    hubspotContactFinished,
    hasValidHubspotContact,
}: UseViewApiCallsProps) {

    // LinkedIn profile data fetching
    const {
        data: linkedInProfileData,
        isIdle: didDoResearch,
        mutateAsync: fetchLinkedInProfileData,
        isPending: isLinkedinProfileDataLoading,
        error: linkedinProfileDataError,
    } = useBackendMutation<LinkedInProfileBD, LinkedInProfile>(
        "linkedin-profiles/",
        "POST",
        {
            shouldCacheResponse: false,
        },
    );

    // Load all available research play templates (not executed yet)
    const {
        isLoading: isLoadingResearchPlays,
        error: errorResearchPlays,
        data: researchPlayTemplates,
    } = useBackendQuery<Play[]>(
        `plays/?output_type=variable`,
        {
            enabled: Boolean(shouldFetchData),
        },
    );

    // Smart variables data fetching (keep for backward compatibility)
    const {
        isLoading: isLoadingSmartVariables,
        error: errorSmartVariables,
        data: smartVariablesBackwardCompatibility,
    } = useBackendQuery<PlayRanServerSide[]>(
        `smart-variables/?profile_id=${currentUsername}`,
        {
            enabled: Boolean(linkedInProfile && shouldFetchData),
        },
    );

    // Company and profile variables
    const {
        profile: profileData,
        company, // Access company for settings like linkedin_job_search_term
        data: companyAndUserVariables,
        error: errorVariables,
        isFetching: isLoadingVariables,
    } = useCompanyAndProfileVariables();

    // Plays data fetching
    const {
        data: finalPlaysData,
        isLoading: isLoadingPlays,
        error: errorPlays,
    } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.FINAL}`, {
        enabled: shouldFetchData,
    });

    // Build LinkedIn URL from currentUsername if available (Priority 1)
    const linkedInUrl = currentUsername ? `https://www.linkedin.com/in/${currentUsername}/` : undefined;

    // Hubspot data fetching
    // Priority: LinkedIn URL > Email > Name + Company
    const {
        data: hubspotContactData,
        isLoading: loadingContact,
        refetch: refetchHubspotContactData,
        isFetching: isFetchingHubspotContactData,
        isPending: isPendingHubspotContactData
    } = useHubspotContact(
        profile?.id,
        linkedInUrl
            ? { linkedInUrl }  // Priority 1: LinkedIn URL (fastest and most accurate)
            : extractedEmailFromHubSpot 
                ? { email: extractedEmailFromHubSpot }  // Priority 2: Email
                : (linkedInProfile?.profile_id === currentUsername && linkedin
                    ? {
                        firstName: linkedin?.first_name,
                        lastName: linkedin?.last_name,
                        companyName: companyName, // Priority 3: Name + Company (fallback)
                    } : undefined),
        {
            enabled: shouldCallHubspot,
        },
        currentUsername
    );

    const hubspotContact = hubspotContactData?.results?.data[0];

    const {
        data: hubspotEmployeesData,
        error: hubspotEmployeesError,
        isLoading: loadingEmployees,
        refetch: refetchHubspotEmployeesData,
        isPending: isPendingHubspotEmployeesData,
        isFetching: isFetchingHubspotEmployeesData,
    } = useHubspotEmployees(
        profile?.id,
        companyId ? String(companyId) : undefined,
        {
            enabled:
                !!(profile?.id && shouldFetchData && shouldCallHubspot && hubspotContactFinished && hasValidHubspotContact),
        },
        currentUsername
    );

    const hubspotEmployees = hubspotEmployeesData?.results.data;

    // Company Enrichment (CoreSignal) – use LinkedIn company ID if available, fallback to HubSpot company ID
    const { data: companyEnrichment, isLoading: isLoadingCompanyEnrichment } = useCompanyEnrichment(
        linkedInCompanyId || (companyId ? String(companyId) : undefined),
        !!(linkedInCompanyId || companyId)
    );

    // Apify LinkedIn Posts - get posts from current LinkedIn profile  
    const currentLinkedInUrl = currentUsername ? `https://www.linkedin.com/in/${currentUsername}/` : '';
    const { data: linkedInPostsData, isLoading: isLoadingLinkedInPosts, error: linkedInPostsError } = useLinkedInPosts(
        currentLinkedInUrl,
        10,
        {
            enabled: !!(currentUsername && shouldFetchData && linkedInProfile),
        }
    );

    // Apify LinkedIn Jobs - get jobs for the verified company name
    // USE COMPANY SETTINGS: Get job titles from company configuration (linkedin_job_search_term)
    // This is set by the user in Settings page under "Job Posts Configuration"
    const configuredJobTitles = company?.linkedin_job_search_term || '';
    
    // Construct search query: "{Job Titles} at {Company Name}"
    // This format is required by the backend API to extract jobTitles parameter
    // If no configured titles, fall back to common business roles
    const jobSearchQuery = configuredJobTitles
        ? `${configuredJobTitles} at ${verifiedCompanyName || 'company'}`
        : `Account Executive,Sales Development Representative,Business Development,Product Manager,Software Engineer at ${verifiedCompanyName || 'company'}`;
    const { data: linkedInJobsData, isLoading: isLoadingLinkedInJobs, error: linkedInJobsError } = useLinkedInJobs(
        {
            searchQuery: jobSearchQuery,
            location: 'United States', 
            jobType: 'full-time',
            experienceLevel: 'mid-senior',
            verifiedCompanyName: verifiedCompanyName, // This filters jobs to only the specific company
            linkedInCompanyId: linkedInCompanyId // Optional: LinkedIn company ID for more accurate filtering
        },
        {
            enabled: !!(verifiedCompanyName && shouldFetchData && linkedInProfile),
        }
    );

    const {
        data: hubspotDealData,
        isLoading: loadingDeal,
        refetch: refetchHubspotDealData,
        isFetching: isFetchingHubspotDealData,
        isPending: isPendingHubspotDealData,
    } = useHubspotDeal(
        profile?.id, // connectionId - same as other HubSpot hooks
        undefined, // contactId - not using contact-based deals anymore
        undefined, // companyId - not using company ID
        companyName, // Use extracted company name
        {
            enabled: !!(profile?.id && companyName && shouldFetchData),
        },
        currentUsername
    );

    // NEW: Org Chart Matching - Match company to org charts for account intel
    const {
        match: orgChartMatch,
        isLoading: isLoadingOrgCharts,
        hasMatch: hasOrgChartMatch,
        matchConfidence: orgChartMatchConfidence,
        matchType: orgChartMatchType,
        accountIntel: orgChartAccountIntel
    } = useOrgChartMatching(
        companyEnrichmentWebsite,
        effectiveCoreSignalCompanyName,
        shouldFetchData // Only fetch when research is enabled
    );

    const {
        data: hubspotCompanyData,
        isLoading: loadingHubspotCompany,
        refetch: refetchHubspotCompanyData,
        isFetching: isFetchingHubspotCompanyData,
        isPending: isPendingHubspotCompanyData,
    } = useHubspotCompany(
        profile?.id,
        companyId ? String(companyId) : undefined,
        {
            enabled: !!(profile?.id && shouldFetchData && shouldCallHubspot && hubspotContactFinished && hasValidHubspotContact),
        },
        currentUsername
    );

    const hubspotCompany = hubspotCompanyData?.results?.data?.[0];

    // Play execution
    const {
        mutateAsync: _runPlay,
        isPending: isLoadingRun,
        error: runError,
    } = useBackendMutation<
        {
            external_data: Record<string, string>;
            persona_data: Dictionary<string[]>;
            playId: number;
        },
        RunFinalPlayResponseType
    >(({playId}) => `plays/${playId}/run/`, "PUT");

    const {mutateAsync: runSmartPlay} = useBackendMutation<
        {
            external_data: Record<string, string>;
            persona_data: Dictionary<string[]>;
            playId: number;
        },
        RunFinalPlayResponseType
    >(({playId}) => `plays/${playId}/run/`, "PUT");

    // Extract company name from Company Enrichment data (preferred source)
    let enrichmentCompanyName: string | undefined = (companyEnrichment?.data as any)?.name || 
                                                    (companyEnrichment?.data as any)?.company_name || 
                                                    (companyEnrichment?.data as any)?.companyName ||
                                                    (companyEnrichment as any)?.company_name || 
                                                    (companyEnrichment as any)?.company_company_name;
    
    // Fallback: Extract company name from LinkedIn URL if available
    if (!enrichmentCompanyName && companyEnrichment?.data?.linkedin_url) {
        const linkedInUrl = companyEnrichment.data.linkedin_url;
        const companySlugMatch = linkedInUrl.match(/linkedin\.com\/company\/([^\/\?]+)/);
        if (companySlugMatch) {
            // Convert company slug to proper name (e.g., "amazon" -> "Amazon")
            enrichmentCompanyName = companySlugMatch[1].charAt(0).toUpperCase() + companySlugMatch[1].slice(1);
        }
    }

    // Fuzzy company match: compare CoreSignal (LinkedIn/CoreSignal-derived) vs HubSpot company name
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
        return ratio <= 0.25; // allow small differences
    }

    const coreSignalCompanyName = effectiveCoreSignalCompanyName; // prefer enrichment when available
    const rawHubspotName: any = hubspotCompany?.properties?.name?.value ?? hubspotCompany?.properties?.name;
    const hubspotCompanyName: string | undefined = typeof rawHubspotName === 'string' ? rawHubspotName : undefined;
    const companyNamesMatch = isFuzzyMatch(coreSignalCompanyName, hubspotCompanyName);








    return {
        // LinkedIn Profile
        linkedInProfile: linkedInProfileData,
        didDoResearch,
        fetchLinkedInProfileData,
        isLinkedinProfileDataLoading,
        linkedinProfileDataError,

        // Research Plays
        isLoadingResearchPlays,
        errorResearchPlays,
        researchPlayTemplates,

        // Smart Variables (backward compatibility)
        isLoadingSmartVariables,
        errorSmartVariables,
        smartVariablesBackwardCompatibility,

        // Company & Profile Variables
        profile: profileData,
        companyAndUserVariables,
        errorVariables,
        isLoadingVariables,

        // Final Plays
        finalPlaysData,
        isLoadingPlays,
        errorPlays,

        // HubSpot Contact
        hubspotContactData,
        hubspotContact,
        loadingContact,
        refetchHubspotContactData,
        isFetchingHubspotContactData,
        isPendingHubspotContactData,

        // HubSpot Employees
        hubspotEmployeesData,
        hubspotEmployees,
        hubspotEmployeesError,
        loadingEmployees,
        refetchHubspotEmployeesData,
        isPendingHubspotEmployeesData,
        isFetchingHubspotEmployeesData,

        // Company Enrichment
        companyEnrichment,
        enrichmentCompanyName,
        isLoadingCompanyEnrichment,

        // LinkedIn Posts
        linkedInPostsData,
        isLoadingLinkedInPosts,
        linkedInPostsError,

        // LinkedIn Jobs
        linkedInJobsData,
        isLoadingLinkedInJobs,
        linkedInJobsError,

        // HubSpot Deal
        hubspotDealData,
        loadingDeal,
        refetchHubspotDealData,
        isFetchingHubspotDealData,
        isPendingHubspotDealData,

        // Org Chart Matching
        orgChartMatch,
        isLoadingOrgCharts,
        hasOrgChartMatch,
        orgChartMatchConfidence,
        orgChartMatchType,
        orgChartAccountIntel,

        // HubSpot Company
        hubspotCompanyData,
        hubspotCompany,
        loadingHubspotCompany,
        refetchHubspotCompanyData,
        isFetchingHubspotCompanyData,
        isPendingHubspotCompanyData,

        // Company matching
        companyNamesMatch,
        coreSignalCompanyName,
        hubspotCompanyName,
        normalizeCompanyName,
        isFuzzyMatch,

        // Play Execution
        runFinalPlay: _runPlay,
        isLoadingRun,
        runError,
        runSmartPlay,
    };
}