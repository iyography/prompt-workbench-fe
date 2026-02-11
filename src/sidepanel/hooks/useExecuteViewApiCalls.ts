import { useRef, useState, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
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

interface PlayRanServerSide extends Play {
    value: string;
    name: string;
}

export interface ApiCallsState {
    // State variables only - no derived data
    // Derived data is calculated internally in useExecuteViewApiCalls
    hasManuallyResearched: boolean;
    shouldFetchData: boolean;
    currentUsername: string | undefined;
    extractedEmailFromHubSpot: string | undefined;
}

export interface ApiCallsData {
    // LinkedIn Profile
    linkedInProfile: LinkedInProfile | undefined;
    isLinkedinProfileDataLoading: boolean;
    linkedinProfileDataError: any;
    fetchLinkedInProfileDataWithTracking: (params: any) => Promise<any>;
    
    // Research plays
    isLoadingResearchPlays: boolean;
    errorResearchPlays: any;
    researchPlayTemplates: Play[] | undefined;
    
    // Smart variables
    isLoadingSmartVariables: boolean;
    errorSmartVariables: any;
    smartVariablesDataInitial: PlayRanServerSide[];
    // Smart variables streaming states
    isSmartVariablesStreaming: boolean;
    smartVariablesStreamingError: Error | null;
    
    // Company and profile variables
    profile: any;
    companyAndUserVariables: any;
    errorVariables: any;
    isLoadingVariables: boolean;
    
    // Plays
    plays: Play[];
    isLoadingPlays: boolean;
    errorPlays: any;
    
    // HubSpot Contact
    hubspotContactData: any;
    loadingContact: boolean;
    refetchHubspotContactData: () => void;
    isFetchingHubspotContactData: boolean;
    isPendingHubspotContactData: boolean;
    hubspotContact: any;
    
    // HubSpot Employees
    hubspotEmployeesData: any;
    hubspotEmployeesError: any;
    loadingEmployees: boolean;
    refetchHubspotEmployeesData: () => void;
    isPendingHubspotEmployeesData: boolean;
    isFetchingHubspotEmployeesData: boolean;
    hubspotEmployees: any;
    
    // Company Enrichment
    companyEnrichment: any;
    isLoadingCompanyEnrichment: boolean;
    
    // LinkedIn Posts
    linkedInPostsData: any;
    isLoadingLinkedInPosts: boolean;
    linkedInPostsError: any;
    
    // LinkedIn Jobs
    linkedInJobsData: any;
    isLoadingLinkedInJobs: boolean;
    linkedInJobsError: any;
    
    // HubSpot Deal
    hubspotDealData: any;
    loadingDeal: boolean;
    refetchHubspotDealData: () => void;
    isFetchingHubspotDealData: boolean;
    isPendingHubspotDealData: boolean;
    
    // Org Chart Matching
    orgChartMatch: any;
    isLoadingOrgCharts: boolean;
    hasOrgChartMatch: boolean;
    orgChartMatchConfidence: number;
    orgChartMatchType: string | undefined;
    orgChartAccountIntel: any;
    
    // HubSpot Company
    hubspotCompanyData: any;
    loadingHubspotCompany: boolean;
    refetchHubspotCompanyData: () => void;
    isFetchingHubspotCompanyData: boolean;
    isPendingHubspotCompanyData: boolean;
    hubspotCompany: any;
    
    // Play execution
    _runPlay: (params: any) => Promise<any>;
    isLoadingRun: boolean;
    runError: any;
    runSmartPlay: (params: any) => Promise<any>;
    // Streaming states
    isPlayStreaming: boolean;
    playStreamingError: Error | null;
}

/**
 * useExecuteViewApiCalls Hook
 * 
 * SEQUENTIAL DATA FLOW ENFORCED:
 * ================================
 * 
 * 1. LINKEDIN PROFILE DATA (Manual Trigger)
 *    └─> fetchLinkedInProfileDataWithTracking() called by user action
 *    └─> Extracts: actualCompanyName, actualLinkedInCompanyId
 * 
 * 2. COMPANY ENRICHMENT (Auto-triggered when LinkedIn data available)
 *    └─> Requires: actualLinkedInCompanyId from step 1
 *    └─> useCompanyEnrichment() fetches CoreSignal data
 *    └─> Must complete (isLoadingCompanyEnrichment = false) before step 3
 *    └─> Provides: actualVerifiedCompanyName, actualCompanyEnrichmentWebsite
 * 
 * 3. HUBSPOT API CALLS (Auto-triggered when enrichment completes)
 *    └─> Requires: LinkedIn Profile data + Company Enrichment completed
 *    └─> callHubspot() checks: hasLinkedInData && companyEnrichmentCompleted
 *    └─> Calls in sequence:
 *        a) HubSpot Contact (REQUIRES verifiedCompanyName - prevents fetching all contacts)
 *        b) HubSpot Employees (waits for contact to finish)
 *        c) HubSpot Company (waits for contact to finish)
 *        d) HubSpot Deal (REQUIRES verifiedCompanyName)
 * 
 * 4. CONTENT ENRICHMENT (After Company Enrichment Completes)
 *    └─> LinkedIn Posts (Apify) - waits for enrichment
 *    └─> LinkedIn Jobs (Apify) - waits for enrichment
 *    └─> Org Chart Matching
 * 
 * KEY GUARANTEES:
 * - HubSpot calls NEVER start before Company Enrichment completes
 * - Company Enrichment NEVER starts without LinkedIn Profile data
 * - Content enrichment (Posts/Jobs) WAITS for Company Enrichment to prevent double execution
 * - All hooks maintain call order (React requirement)
 * - Async fetching happens in the enforced sequence via enabled conditions
 * 
 * DOUBLE EXECUTION PREVENTION:
 * - Jobs/Posts/Deal/Contact queries wait for !isLoadingCompanyEnrichment
 * - This prevents React Query from seeing two different company names and firing twice
 * - Ensures stable queryKey/parameter values before any dependent queries start
 * - Applies to: LinkedIn Jobs, LinkedIn Posts, HubSpot Deal, HubSpot Contact
 * - All use verifiedCompanyName (enriched) with fallback to actualCompanyName (LinkedIn)
 * 
 * COMPANY NAME REQUIREMENT:
 * - HubSpot Contact query REQUIRES contactCompanyName to be defined
 * - Returns undefined searchParams (not empty object) when company name is missing
 * - Prevents fetching all HubSpot contacts without filtering
 * - enabled: hubspotContactEnabled checks both callHubspot() AND !!contactCompanyName
 */
export function useExecuteViewApiCalls(state: ApiCallsState): ApiCallsData {
    // Extract only the state variables (no derived data)
    const {
        hasManuallyResearched,
        shouldFetchData,
        currentUsername,
        extractedEmailFromHubSpot
    } = state;

    // LinkedIn profile data fetching
    const {
        data: linkedInProfile,
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

    // Wrap the original fetchLinkedInProfileData to track manual research
    const fetchLinkedInProfileDataWithTracking = async (params: any) => {
        return await fetchLinkedInProfileData(params);
    };

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
    // Smart variables streaming support
    // Memoize callback to prevent React Query from re-subscribing on every render
    const handleSmartVariableStreamResult = useCallback((data: any) => {
        if (data.play_id && data.play_name && data.value !== undefined) {
            // This will be handled by the parent component
        }
    }, []); // Empty deps - callback doesn't need to change

    // Memoize query options to prevent React Query from treating it as a new config on every render
    const smartVariablesQueryOptions = useMemo(() => ({
        enabled: Boolean(linkedInProfile && shouldFetchData),
        streaming: true,
        onStreamResult: handleSmartVariableStreamResult,
    }), [linkedInProfile, shouldFetchData, handleSmartVariableStreamResult]);

    const {
        isLoading: isLoadingSmartVariables,
        error: errorSmartVariables,
        data,
        isStreaming: isSmartVariablesStreaming,
        streamingError: smartVariablesStreamingError,
    } = useBackendQuery<PlayRanServerSide[]>(
        `smart-variables/?profile_id=${currentUsername}`,
        smartVariablesQueryOptions,
    );

    // Use research play templates as primary source, fallback to executed smart variables
    const smartVariablesDataInitial = (researchPlayTemplates && researchPlayTemplates.length > 0) 
        ? researchPlayTemplates.map(play => ({ ...play, value: "" })) // Convert templates to format expected by execution logic
        : (data || []);

    // Company and profile variables
    const {
        profile,
        company, // Access company for settings like linkedin_job_search_term
        data: companyAndUserVariables,
        error: errorVariables,
        isFetching: isLoadingVariables,
    } = useCompanyAndProfileVariables();

    // Plays data fetching
    const {
        data: p,
        isLoading: isLoadingPlays,
        error: errorPlays,
    } = useBackendQuery<Play[]>(`plays/?output_type=${PlayOutputType.FINAL}`, {
        enabled: shouldFetchData,
    });
    const plays = p || [];

    // Calculate basic derived values from LinkedIn data
    const actualLinkedin = linkedInProfile?.profile_data_raw;
    const actualLinkedinProcessed = linkedInProfile?.profile_data;

    // Extract company name with priority for active/current company
    const actualCompanyName = (() => {

        if (!actualLinkedin) return undefined;
        
        // PRIORITY 1: active_experience_company_name
        if (actualLinkedin.active_experience_company_name) {
            return actualLinkedin.active_experience_company_name;
        }
        
        // PRIORITY 2: Experience array - find current job
        let experienceArray = actualLinkedin.experience;
        if (experienceArray && typeof experienceArray === 'string') {
            try {
                experienceArray = JSON.parse(experienceArray);
            } catch (e) {
                console.error('Failed to parse experience array:', e);
            }
        }
        
        if (Array.isArray(experienceArray) && experienceArray.length > 0) {
            const currentExp = experienceArray.find((e: any) => e?.is_current === true || e?.current === true);
            if (currentExp) {
                const currentCompanyName = currentExp.company_name || currentExp.company || currentExp.companyName;
                if (currentCompanyName) {
                    return currentCompanyName;
                }
            }
            // Fallback to first experience
            const firstCompanyName = experienceArray[experienceArray.length - 1]?.company_name || experienceArray[experienceArray.length - 1]?.company || experienceArray[experienceArray.length - 1]?.companyName;
            if (firstCompanyName) {
                return firstCompanyName;
            }
        }
        
        // PRIORITY 3: Headline parsing
        if (actualLinkedin.headline && actualLinkedin.headline.indexOf(' at ') !== -1) {
            const headlineCompany = actualLinkedin.headline.substring(actualLinkedin.headline.indexOf(' at ') + 4).trim();
            return headlineCompany;
        }

        // PRIORITY 4: Fallback to company_name field (might be old)
        if (actualLinkedin.company_name) {
            return actualLinkedin.company_name;
        }
        
        return undefined;
    })();
    
    // Extract linkedInCompanyId from profile data - ROBUST EXTRACTION
    const actualLinkedInCompanyId = (() => {
        if (!actualLinkedin) return undefined;
        
        // PRIORITY 1: active_experience_company_id (most reliable for current company)
        if (actualLinkedin.active_experience_company_id) {
            return String(actualLinkedin.active_experience_company_id);
        }
        
        // PRIORITY 2: Experience array - find current job's company ID
        let experienceArray = actualLinkedin.experience;
        if (experienceArray && typeof experienceArray === 'string') {
            try {
                experienceArray = JSON.parse(experienceArray);
            } catch (e) {
                console.error('Failed to parse experience array for company ID:', e);
            }
        }
        
        if (Array.isArray(experienceArray) && experienceArray.length > 0) {
            // Find the current experience (is_current or current flag)
            const currentExp = experienceArray.find((e: any) => e?.is_current === true || e?.current === true);
            
            if (currentExp && currentExp.company_id) {
                return String(currentExp.company_id);
            }

            // Fallback to first experience (most recent) if no current flag
            const firstExp = experienceArray[experienceArray.length - 1];
            if (firstExp && firstExp.company_id) {
                return String(firstExp.company_id);
            }
        }
        
        // PRIORITY 3: Check for other possible field names (fallback)
        const possibleFields = ['company_id', 'active_company_id', 'current_company_id', 'employer_id'];
        for (const fieldName of possibleFields) {
            if (actualLinkedin[fieldName]) {
                return String(actualLinkedin[fieldName]);
            }
        }

        return undefined;
    })();

    // ============================================================================
    // STEP 1: COMPANY ENRICHMENT (MUST COMPLETE BEFORE HUBSPOT)
    // ============================================================================
    // Company Enrichment (CoreSignal) - Run this BEFORE HubSpot calls
    const enrichmentId = actualLinkedInCompanyId || undefined;
    const enrichmentEnabled = !!actualLinkedInCompanyId;

    const { data: companyEnrichment, isLoading: isLoadingCompanyEnrichment } = useCompanyEnrichment(
        enrichmentId,
        enrichmentEnabled
    );

    // Calculate enriched company data
    let actualEnrichmentCompanyName: string | undefined = (companyEnrichment?.data as any)?.name || 
                                                         (companyEnrichment?.data as any)?.company_name || 
                                                         (companyEnrichment?.data as any)?.companyName ||
                                                         (companyEnrichment as any)?.company_name || 
                                                         (companyEnrichment as any)?.company_company_name;
    
    // Fallback: Extract company name from LinkedIn URL if available
    if (!actualEnrichmentCompanyName && companyEnrichment?.data?.linkedin_url) {
        const linkedInUrl = companyEnrichment.data.linkedin_url;
        const companySlugMatch = linkedInUrl.match(/linkedin\.com\/company\/([^\/\?]+)/);
        if (companySlugMatch) {
            actualEnrichmentCompanyName = companySlugMatch[1].charAt(0).toUpperCase() + companySlugMatch[1].slice(1);
        }
    }

    // Prioritize company enrichment name - it's the most accurate source
    // Use enrichment name first, fallback to LinkedIn profile name if enrichment is not available
    let actualVerifiedCompanyName: string | undefined;
    let actualEffectiveCoreSignalCompanyName: string | undefined;
    
    if (actualEnrichmentCompanyName) {
        // Company enrichment has company name - use it (most accurate source)
        actualVerifiedCompanyName = actualEnrichmentCompanyName;
        actualEffectiveCoreSignalCompanyName = actualEnrichmentCompanyName;
        
    } 
    
    const actualCompanyEnrichmentWebsite = companyEnrichment?.data?.website || (companyEnrichment?.data as any)?.company_website;

    // ============================================================================
    // STEP 2: HUBSPOT API CALLS (ONLY AFTER COMPANY ENRICHMENT COMPLETES)
    // ============================================================================
    // Helper function for HubSpot call conditions
    // ENFORCES SEQUENTIAL DATA FLOW: LinkedIn Profile → Company Enrichment → HubSpot
    function callHubspot(): boolean {
        // Step 1: Must have LinkedIn profile data loaded
        const hasLinkedInData = !!(extractedEmailFromHubSpot || actualLinkedin);
        
        // Step 2: Must have company enrichment completed (not just started)
        // Company enrichment is enabled when we have actualLinkedInCompanyId or actualCompanyId
        const companyEnrichmentCompleted = enrichmentEnabled ? !isLoadingCompanyEnrichment : true;
        
        const result = !!(
            profile?.id && 
            shouldFetchData && 
            hasLinkedInData &&
            companyEnrichmentCompleted  // 👈 NEW: Wait for company enrichment to finish
        );
        
        return result;
    }


    // Hubspot Contact data fetching
    // CRITICAL: Use verified company name from enrichment (not fallback from LinkedIn profile)
    // This ensures Contact and Deal queries use the same company name
    // PREVENTS DOUBLE EXECUTION: Only use verified name after enrichment completes
    
    // Only calculate contactCompanyName when enrichment is complete to avoid React Query seeing two different queryKeys
    const contactCompanyName = isLoadingCompanyEnrichment
        ? undefined  // 👈 Force undefined while loading to prevent premature query with fallback name
        : (actualVerifiedCompanyName || actualCompanyName);

    // CRITICAL: Always require company name for HubSpot Contact query
    // This prevents fetching all contacts without filtering
    const hubspotContactEnabled = callHubspot() && !!contactCompanyName;

    // Construct search params with validation to ensure at least one search criterion exists
    // This prevents the API from calling getAllContacts() which would fetch all HubSpot contacts
    // CRITICAL: Use profile_data (processed) for names, not profile_data_raw
    const firstName = actualLinkedinProcessed?.first_name || actualLinkedin?.first_name;
    const lastName = actualLinkedinProcessed?.last_name || actualLinkedin?.last_name;
    
    // Only create search params if we have both names AND company name
    // This ensures meaningful search criteria and prevents fetching unrelated contacts
    const hubspotContactSearchParams = (
        linkedInProfile?.profile_id === currentUsername && 
        (actualLinkedin || actualLinkedinProcessed) && 
        contactCompanyName &&
        firstName &&  // 👈 Require first name
        lastName      // 👈 Require last name
    )
        ? {
            email: extractedEmailFromHubSpot,  // 👈 Include email if available (more specific)
            firstName: firstName,
            lastName: lastName,
            companyName: contactCompanyName,  // 👈 ALWAYS required - use enriched name ONLY after enrichment completes
        } 
        : undefined;  // 👈 Return undefined (not empty object) to prevent query from running

    // SAFETY CHECK: Ensure at least one search parameter is provided
    // This prevents getAllContacts() from being called in the API route
    if (hubspotContactSearchParams) {
        const hasAtLeastOneParam = !!(
            hubspotContactSearchParams.email ||
            hubspotContactSearchParams.firstName ||
            hubspotContactSearchParams.lastName ||
            hubspotContactSearchParams.companyName
        );

        if (!hasAtLeastOneParam) {
            console.error('🚨 SAFETY CHECK FAILED: No search parameters provided for HubSpot contact query - preventing getAllContacts() call');
        }
    }

    const {
        data: hubspotContactData,
        isLoading: loadingContact,
        refetch: refetchHubspotContactData,
        isFetching: isFetchingHubspotContactData,
        isPending: isPendingHubspotContactData
    } = useHubspotContact(
        profile?.id,
        hubspotContactSearchParams,
        {
            enabled: hubspotContactEnabled,  // 👈 Require both callHubspot() AND contactCompanyName
        },
        currentUsername
    );

    const hubspotContact = hubspotContactData?.results?.data[0];

    // Calculate company ID from HubSpot contact data
    const actualCompanyId = hubspotContact?.properties?.associatedcompanyid?.value || 
                           hubspotContact?.properties?.associatedcompanyid ||
                           hubspotContact?.properties?.hs_associatedcompanyid?.value ||
                           hubspotContact?.properties?.hs_associatedcompanyid;

    // Stable hook conditions to prevent hook order violations
    const shouldCallHubspot = callHubspot();
    const hubspotContactFinished = !isPendingHubspotContactData;
    const hasValidHubspotContact = !!hubspotContact?.id;

    // HubSpot Employees data
    const {
        data: hubspotEmployeesData,
        error: hubspotEmployeesError,
        isLoading: loadingEmployees,
        refetch: refetchHubspotEmployeesData,
        isPending: isPendingHubspotEmployeesData,
        isFetching: isFetchingHubspotEmployeesData,
    } = useHubspotEmployees(
        profile?.id,
        String(actualCompanyId)!, // CRITICAL: Convert to string and force non-undefined
        {
            enabled:
                !!(profile?.id && shouldFetchData && shouldCallHubspot && hubspotContactFinished && hasValidHubspotContact),
        },
        currentUsername
    );

    const hubspotEmployees = hubspotEmployeesData?.results.data;

    // ============================================================================
    // STEP 3: CONTENT ENRICHMENT (LinkedIn Posts & Jobs)
    // ============================================================================
    // Apify LinkedIn Posts
    const currentLinkedInUrl = currentUsername ? `https://www.linkedin.com/in/${currentUsername}/` : '';
    // Wait for company enrichment to complete before starting posts query
    // This ensures consistent timing with other enrichment queries
    const postsEnabled = !!(
        currentUsername &&
        shouldFetchData &&
        linkedInProfile &&
        !isLoadingCompanyEnrichment  // Consistent with jobs query timing
    );

    const { data: linkedInPostsData, isLoading: isLoadingLinkedInPosts, error: linkedInPostsError } = useLinkedInPosts(
        currentLinkedInUrl,
        10,
        {
            enabled: postsEnabled,
        }
    );

    // Apify LinkedIn Jobs - NEW ENHANCED ACTOR (oza-dev/linkedin-jobs-scraper)
    // USE COMPANY SETTINGS: Get job titles from company configuration (linkedin_job_search_term)
    // This is set by the user in Settings page under "Job Posts Configuration"
    const configuredJobTitles = company?.linkedin_job_search_term || '';
    
    // Construct search query: "{Job Titles} at {Company Name}"
    // This format is required by the backend API to extract jobTitles parameter
    // If no configured titles, fall back to common business roles
    const jobSearchQuery = useMemo(() => 
        configuredJobTitles
            ? `${configuredJobTitles} at ${actualVerifiedCompanyName || 'company'}`
            : `Account Executive,Sales Development Representative,Business Development,Product Manager,Software Engineer at ${actualVerifiedCompanyName || 'company'}`,
        [configuredJobTitles, actualVerifiedCompanyName]
    );
    
    // Jobs enabled when we have company name AND enrichment has completed
    // CRITICAL: Wait for company enrichment to finish to prevent double execution
    // when verifiedCompanyName changes from LinkedIn fallback to enrichment value
    const jobsEnabled = !!(
        actualVerifiedCompanyName &&
        shouldFetchData &&
        linkedInProfile &&
        !isLoadingCompanyEnrichment  // 👈 PREVENTS DOUBLE EXECUTION: Wait for stable company name
    );
    
    // Memoize LinkedIn Jobs params object to prevent React Query from treating it as a new query on every render
    const linkedInJobsParams = useMemo(() => ({
        searchQuery: jobSearchQuery,
        location: 'United States', 
        jobType: 'full-time',
        experienceLevel: 'mid-senior',
        verifiedCompanyName: actualVerifiedCompanyName,
        linkedInCompanyId: actualLinkedInCompanyId // CRITICAL: Pass LinkedIn company ID for accurate filtering
    }), [jobSearchQuery, actualVerifiedCompanyName, actualLinkedInCompanyId]);
    
    const { data: linkedInJobsData, isLoading: isLoadingLinkedInJobs, error: linkedInJobsError } = useLinkedInJobs(
        linkedInJobsParams,
        {
            enabled: jobsEnabled,
        }
    );

    // HubSpot Deal data
    // CRITICAL: Wait for company enrichment to complete before starting deal query
    // This prevents double execution when verifiedCompanyName changes from fallback to enriched value
    const dealEnabled = !!(
        profile?.id &&
        actualVerifiedCompanyName &&
        shouldFetchData &&
        !isLoadingCompanyEnrichment  // 👈 PREVENTS DOUBLE EXECUTION: Wait for stable company name
    );
    
    const {
        data: hubspotDealData,
        isLoading: loadingDeal,
        refetch: refetchHubspotDealData,
        isFetching: isFetchingHubspotDealData,
        isPending: isPendingHubspotDealData,
    } = useHubspotDeal(
        profile?.id,
        undefined,
        undefined,
        actualVerifiedCompanyName,
        {
            enabled: dealEnabled,
        },
        currentUsername
    );

    // Org Chart Matching
    const {
        match: orgChartMatch,
        isLoading: isLoadingOrgCharts,
        hasMatch: hasOrgChartMatch,
        matchConfidence: orgChartMatchConfidence,
        matchType: orgChartMatchType,
        accountIntel: orgChartAccountIntel
    } = useOrgChartMatching(
        actualCompanyEnrichmentWebsite,
        actualEffectiveCoreSignalCompanyName,
        shouldFetchData
    );

    // HubSpot Company data
    const {
        data: hubspotCompanyData,
        isLoading: loadingHubspotCompany,
        refetch: refetchHubspotCompanyData,
        isFetching: isFetchingHubspotCompanyData,
        isPending: isPendingHubspotCompanyData,
    } = useHubspotCompany(
        profile?.id,
        actualCompanyId ? String(actualCompanyId) : undefined,
        {
            enabled: !!(profile?.id && shouldFetchData && shouldCallHubspot && hubspotContactFinished && hasValidHubspotContact),
        },
        currentUsername
    );

    const hubspotCompany = hubspotCompanyData?.results?.data?.[0];

    // Play execution mutations with streaming support
    // Memoize callback to prevent React Query from re-subscribing on every render
    const handlePlayStreamResult = useCallback((data: any) => {
        if (data.index !== undefined && data.value !== undefined) {
            // This will be handled by the parent component
        }
    }, []); // Empty deps - callback doesn't need to change

    // Memoize mutation options to prevent React Query from treating it as a new config on every render
    // Extended timeout (10 minutes) to handle large messaging plays and account intel data without timing out
    // User was experiencing 8+ second timeouts, likely due to default axios timeout settings
    const playMutationOptions = useMemo(() => ({
        streaming: true,
        onStreamResult: handlePlayStreamResult,
        timeout: 600000, // 10 minutes timeout for play execution (increased from 5 minutes to fix messaging timeouts)
    }), [handlePlayStreamResult]);

    const {
        mutateAsync: _runPlay,
        isPending: isLoadingRun,
        error: runError,
        isStreaming: isPlayStreaming,
        streamingError: playStreamingError,
    } = useBackendMutation<
        {
            external_data: Record<string, string>;
            persona_data: Dictionary<string[]>;
            playId: number;
            num_outputs?: number;
        },
        RunFinalPlayResponseType
    >(({playId}) => `plays/${playId}/run/`, "PUT", playMutationOptions);

    const {mutateAsync: runSmartPlay} = useBackendMutation<
        {
            external_data: Record<string, string>;
            persona_data: Dictionary<string[]>;
            playId: number;
        },
        RunFinalPlayResponseType
    >(({playId}) => `plays/${playId}/run/`, "PUT", playMutationOptions);

    return {
        // LinkedIn Profile
        linkedInProfile,
        isLinkedinProfileDataLoading,
        linkedinProfileDataError,
        fetchLinkedInProfileDataWithTracking,
        
        // Research plays
        isLoadingResearchPlays,
        errorResearchPlays,
        researchPlayTemplates,
        
        // Smart variables
        isLoadingSmartVariables,
        errorSmartVariables,
        smartVariablesDataInitial,
        // Smart variables streaming states
        isSmartVariablesStreaming,
        smartVariablesStreamingError,
        
        // Company and profile variables
        profile,
        companyAndUserVariables,
        errorVariables,
        isLoadingVariables,
        
        // Plays
        plays,
        isLoadingPlays,
        errorPlays,
        
        // HubSpot Contact
        hubspotContactData,
        loadingContact,
        refetchHubspotContactData,
        isFetchingHubspotContactData,
        isPendingHubspotContactData,
        hubspotContact,
        
        // HubSpot Employees
        hubspotEmployeesData,
        hubspotEmployeesError,
        loadingEmployees,
        refetchHubspotEmployeesData,
        isPendingHubspotEmployeesData,
        isFetchingHubspotEmployeesData,
        hubspotEmployees,
        
        // Company Enrichment
        companyEnrichment,
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
        loadingHubspotCompany,
        refetchHubspotCompanyData,
        isFetchingHubspotCompanyData,
        isPendingHubspotCompanyData,
        hubspotCompany,
        
        // Play execution
        _runPlay,
        isLoadingRun,
        runError,
        runSmartPlay,
        // Streaming states
        isPlayStreaming,
        playStreamingError,
    };
} 