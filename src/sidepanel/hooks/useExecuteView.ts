import {useEffect, useMemo, useRef, useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {Dictionary} from "lodash";
import {Play, PlayOutputType, PlayStep, RunFinalPlayResponseType,} from "../../models/play";
import {useActiveTabUrl} from "../../hooks/chrome";
import {
    extractLinkedInProfileFromSalesNav,
    getLinkedInUsernameFromUrl,
    handleHubSpotProfileExtraction,
    isHubSpotContactPage,
    isSalesNavigatorProfile,
} from "../../utils/linkedin";
import {flattenHubspotData, formatHubspotEmployees,} from "../../utils/formatting";
import {isValidSmartVariableValue, requiredKeys} from "../../utils/llm";
import {LinkedInProfile, LinkedInProfileBD,} from "../../models/linkedin-profile";
import {CustomVariables, PlayResponse, SmartVariablesData,} from "../types/execute-view.types";
import {formatString, prepareDataForPlay} from "@/utils/string-interpolation";
import React from "react";
import { levenshteinDistance } from "@/utils/levenshtein";
import { getAccountIntelForResearch } from "@/hooks/useOrgChartMatching";
import { useExecuteViewApiCalls, ApiCallsState } from "./useExecuteViewApiCalls";

const NARRATIVE_AI_AUTO_RUN = "narrative-ai-auto-run";

interface PlayRanServerSide extends Play {
    value: string;
    name: string;
}

// Helper function to handle profile extraction
const handleProfileExtraction = async (
    extractFn: () => Promise<string | undefined>,
    setIsScrapingProfile: (isScrapingProfile: boolean) => void,
    processUsername: (username: string | undefined) => void,
) => {
    setIsScrapingProfile(true);
    try {
        const profileUrl = await extractFn();
        if (profileUrl) {
            const username = getLinkedInUsernameFromUrl(profileUrl);
            processUsername(username);
        }
    } catch (error) {
        console.error("Error extracting profile:", error);
    } finally {
        setIsScrapingProfile(false);
    }
};

export function useExecuteView() {
    console.log("🔍 useExecuteView hook called!");
    console.log("🚨 HOOK START DEBUG - Testing if debug logs work at all");
    const [totalTasksInitiated, setTotalTasksInitiated] = useState(0);
    const [linkedInProfileFromEmail, setLinkedInProfileFromEmail] = useState<string | null | false>(null);
    const [selectedPlay, setSelectedPlay] = useState<Play | undefined>(undefined);
    const [isLoadingSmartVariablesFinal, setIsLoadingSmartVariablesFinal] =
        useState(false);
    const [playResponses, setPlayResponses] = useState<PlayResponse>({});
    const [autoRun, setAutoRun] = useState(
        localStorage.getItem(NARRATIVE_AI_AUTO_RUN) === "true",
    );
    // Add state to track if we've manually researched a profile
    const [hasManuallyResearched, setHasManuallyResearched] = useState(false);
    // Track if this is the first run for API completion bubbles
    const [isFirstRun, setIsFirstRun] = useState(true);
    // Circuit breaker for preventing infinite execution loops
    const [executionCount, setExecutionCount] = useState(0);
    const maxExecutions = 50; // Increase limit - was too low at 10
    const [smartVariablesData, setSmartVariablesData] =
        useState<SmartVariablesData>({});
    const [customVariables, setCustomVariables] = useState<CustomVariables>({});
    const [currentUsername, setCurrentUsername] = useState<string | undefined>(
        undefined,
    );
    const [showCopiedOnIndex, setShowCopiedOnIndex] = useState<number | null>(
        null,
    );
    // Add state to store the email extracted from HubSpot page
    const [extractedEmailFromHubSpot, setExtractedEmailFromHubSpot] = useState<string | undefined>(undefined);

    // Add API completion state tracking - initialize based on current username
    const [apiCompletionStates, setApiCompletionStates] = useState({
        companyEnrichment: false,
        hubspot: false,
        apifyContent: false,
        accountIntel: false
    });

    // Track which API states have been completed (locked once true to prevent flickering)
    const apiCompletionLocksRef = useRef({
        companyEnrichment: false,
        hubspot: false,
        apifyContent: false,
        accountIntel: false
    });

    // Add loading states for each data source
    const [dataLoadingStates, setDataLoadingStates] = useState({
        companyEnrichment: false,
        hubspot: false,
        apifyContent: false,
        accountIntel: false
    });

    // Add debug modal state
    const [showDebugModal, setShowDebugModal] = useState(false);

    // Reset API completion states immediately when username changes
    useEffect(() => {
        if (!currentUsername) {
            apiCompletionLocksRef.current = {
                companyEnrichment: false,
                hubspot: false,
                apifyContent: false,
                accountIntel: false
            };
            setApiCompletionStates({
                companyEnrichment: false,
                hubspot: false,
                apifyContent: false,
                accountIntel: false
            });
            setDataLoadingStates({
                companyEnrichment: false,
                hubspot: false,
                apifyContent: false,
                accountIntel: false
            });
        } else {
            // Reset isFirstRun when profile changes
            setIsFirstRun(true);
        }
    }, [currentUsername]);


    // Create a derived state that indicates whether we should fetch data
    const shouldFetchData = autoRun || hasManuallyResearched;
    
    // DEBUG: Log the crucial variables that control research execution
    console.log('🎯 RESEARCH EXECUTION CONTROL:', {
        autoRun,
        hasManuallyResearched,
        shouldFetchData,
        'Research will execute?': shouldFetchData
    });

    const attemptsRef = useRef<Record<string, number>>({});

    const [isScrapingProfile, setIsScrapingProfile] = useState(false);
    const [pendingTasks, setPendingTasks] = useState<string[]>([]);

    // Track last batch status signature to throttle logs
    const lastBatchLoggedSigRef = useRef<string>("");
    const originalConsoleLogRef = useRef<typeof console.log>(console.log);
    // Track plays currently executing to avoid duplicate scheduling
    const inFlightRef = useRef<Set<string>>(new Set());

    // Minimal API timing instrumentation
    const apiTimingRef = useRef<{ startedAt?: number; endpoints: Record<string, { doneAt?: number; ms?: number }> }>({ endpoints: {} });
    const [apiTimingVersion, setApiTimingVersion] = useState(0);
    const markEndpoint = (key: string, isDone: boolean) => {
        if (!isDone) return;
        const started = apiTimingRef.current.startedAt;
        if (!started) return;
        const already = apiTimingRef.current.endpoints[key]?.doneAt;
        if (already) return;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        apiTimingRef.current.endpoints[key] = { doneAt: now, ms: Math.round(now - started) };
        setApiTimingVersion((v: number) => v + 1);
    };

    // Add research control state
    const [isResearchStopped, setIsResearchStopped] = useState(false);

    const url = useActiveTabUrl();
    const client = useQueryClient();
    
    // Extract company name from LinkedIn data
    const extractCompanyName = (profileData: any) => {
        if (!profileData) return undefined;
        
        // PRIORITY 1: active_experience_company_name (most reliable for current company)
        if (profileData.active_experience_company_name) {
            console.log('✅ Using active_experience_company_name:', profileData.active_experience_company_name);
            return String(profileData.active_experience_company_name);
        }

        // PRIORITY 2: Experience array - find current job (is_current=true or most recent)
        let experienceArray = profileData.experience;
        
        // Parse if experience is a JSON string
        if (experienceArray && typeof experienceArray === 'string') {
            try {
                experienceArray = JSON.parse(experienceArray);
            } catch (e) {
                console.error('Failed to parse experience array:', e);
            }
        }
        
        if (Array.isArray(experienceArray) && experienceArray.length > 0) {
            // Find the current experience (is_current or current flag)
            const currentExp = experienceArray.find((e: any) => e?.is_current === true || e?.current === true);
            
            if (currentExp) {
                const currentCompanyName = currentExp.company_name || currentExp.company || currentExp.companyName;
                if (currentCompanyName) {
                    console.log('✅ Using current experience company:', currentCompanyName);
                    return String(currentCompanyName);
                }
            }
            
            // Fallback to first experience (most recent) if no current flag
            const firstExp = experienceArray[experienceArray.length - 1];
            const firstCompanyName = firstExp?.company_name || firstExp?.company || firstExp?.companyName;
            if (firstCompanyName) {
                console.log('⚠️ Using first experience company (no current flag):', firstCompanyName);
                return String(firstCompanyName);
            }
        }

        // PRIORITY 3: Headline parsing "Role at Company"
        if (profileData.headline && typeof profileData.headline === 'string') {
            const headline = profileData.headline;
            const atIndex = headline.indexOf(' at ');
            if (atIndex !== -1) {
                const headlineCompany = headline.substring(atIndex + 4).trim();
                console.log('⚠️ Using headline company:', headlineCompany);
                return headlineCompany;
            }
        }
        
        // PRIORITY 4: Fallback to generic company fields (least reliable, might be old)
        const fallbackCandidates = [
            profileData.company,
            profileData.companyName,
            profileData.company_name,
        ].filter(Boolean);
        if (fallbackCandidates.length > 0) {
            console.log('⚠️ Using fallback company field:', fallbackCandidates[0]);
            return String(fallbackCandidates[0]);
        }
        
        console.log('❌ No company name found in profile');
        return undefined;
    };
    
    // Extract company ID from LinkedIn profile data for Company Enrichment
    const extractCompanyIdFromProfile = (profileData: any): string | undefined => {
        if (!profileData) return undefined;
        
        // PRIORITY 1: active_experience_company_id (most reliable for current company)
        if (profileData.active_experience_company_id) {
            console.log('✅ Using active_experience_company_id:', profileData.active_experience_company_id);
            return String(profileData.active_experience_company_id);
        }
        
        // PRIORITY 2: Experience array - find current job's company ID
        let experienceArray = profileData.experience;
        
        // Parse if experience is a JSON string
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
                console.log('✅ Using current experience company_id:', currentExp.company_id);
                return String(currentExp.company_id);
            }
            
            // Fallback to first experience (most recent) if no current flag
            console.log('EXPERIENCE ARRAY:', experienceArray);
            const firstExp = experienceArray[experienceArray.length - 1];
            if (firstExp && firstExp.company_id) {
                console.log('⚠️ Using first experience company_id (no current flag):', firstExp.company_id);
                return String(firstExp.company_id);
            }
        }
        
        console.log('❌ No company ID found in profile');
        return undefined;
    };

    // Create basic API calls state  
    const apiCallsState: ApiCallsState = {
        hasManuallyResearched,
        shouldFetchData,
        currentUsername,
        extractedEmailFromHubSpot,
    };

    // Use the extracted API calls
    const apiData = useExecuteViewApiCalls(apiCallsState);

    // When user triggers Research (button), enable research fetches
    const fetchLinkedInProfileData = async (params: any) => {
        if (!hasManuallyResearched) setHasManuallyResearched(true);
        // Reset isFirstRun when research starts
        if (isFirstRun) setIsFirstRun(false);
        // Reset API completion states and locks for new research
        apiCompletionLocksRef.current = {
            companyEnrichment: false,
            hubspot: false,
            apifyContent: false,
            accountIntel: false
        };
        setApiCompletionStates({
            companyEnrichment: false,
            hubspot: false,
            apifyContent: false,
            accountIntel: false
        });
        // Start timing on explicit Research click
        apiTimingRef.current = { startedAt: (typeof performance !== 'undefined' ? performance.now() : Date.now()), endpoints: {} };
        setApiTimingVersion((v: number) => v + 1);
        return fetchLinkedInProfileDataWithTracking(params);
    };

    // Extract data from API calls
    const {
        linkedInProfile,
        isLinkedinProfileDataLoading,
        linkedinProfileDataError,
        fetchLinkedInProfileDataWithTracking,
        isLoadingResearchPlays,
        errorResearchPlays,
        researchPlayTemplates,
        isLoadingSmartVariables,
        errorSmartVariables,
        smartVariablesDataInitial,
        profile,
        companyAndUserVariables,
        errorVariables,
        isLoadingVariables,
        plays,
        isLoadingPlays,
        errorPlays,
        hubspotContactData,
        loadingContact,
        refetchHubspotContactData,
        isFetchingHubspotContactData,
        isPendingHubspotContactData,
        hubspotContact,
        hubspotEmployeesData,
        hubspotEmployeesError,
        loadingEmployees,
        refetchHubspotEmployeesData,
        isPendingHubspotEmployeesData,
        isFetchingHubspotEmployeesData,
        hubspotEmployees,
        companyEnrichment,
        isLoadingCompanyEnrichment,
        linkedInPostsData,
        isLoadingLinkedInPosts,
        linkedInPostsError,
        linkedInJobsData,
        isLoadingLinkedInJobs,
        linkedInJobsError,
        hubspotDealData,
        loadingDeal,
        refetchHubspotDealData,
        isFetchingHubspotDealData,
        isPendingHubspotDealData,
        orgChartMatch,
        isLoadingOrgCharts,
        hasOrgChartMatch,
        orgChartMatchConfidence,
        orgChartMatchType,
        orgChartAccountIntel,
        hubspotCompanyData,
        loadingHubspotCompany,
        refetchHubspotCompanyData,
        isFetchingHubspotCompanyData,
        isPendingHubspotCompanyData,
        hubspotCompany,
        _runPlay,
        isLoadingRun,
        runError,
        runSmartPlay,
        // Streaming states
        isPlayStreaming,
        playStreamingError,
        isSmartVariablesStreaming,
        smartVariablesStreamingError,
    } = apiData;

    // Update loading states based on API call states
    useEffect(() => {
        setDataLoadingStates({
            companyEnrichment: isLoadingCompanyEnrichment,
            hubspot: isPendingHubspotContactData,
            apifyContent: isLoadingLinkedInPosts || isLoadingLinkedInJobs,
            accountIntel: isLoadingOrgCharts
        });
    }, [isLoadingCompanyEnrichment, isPendingHubspotContactData, isLoadingLinkedInPosts, isLoadingLinkedInJobs, isLoadingOrgCharts]);

    // Now set the derived values
    const linkedin = linkedInProfile?.profile_data_raw;
    const companyName = extractCompanyName(linkedin);
    const linkedInCompanyId = extractCompanyIdFromProfile(linkedin);
    
    // Get company ID from contact properties
    const companyId = hubspotContact?.properties?.associatedcompanyid?.value || 
                     hubspotContact?.properties?.associatedcompanyid ||
                     hubspotContact?.properties?.hs_associatedcompanyid?.value ||
                     hubspotContact?.properties?.hs_associatedcompanyid;

    // Extract company name from Company Enrichment data
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
            enrichmentCompanyName = companySlugMatch[1].charAt(0).toUpperCase() + companySlugMatch[1].slice(1);
        }
    }

    // Prioritize company enrichment name - it's the most accurate source
    // Use enrichment name first, fallback to LinkedIn profile name if enrichment is not available
    let verifiedCompanyName: string | undefined;
    let effectiveCoreSignalCompanyName: string | undefined;
    
    if (enrichmentCompanyName) {
        // Company enrichment has company name - use it (most accurate source)
        verifiedCompanyName = enrichmentCompanyName;
        effectiveCoreSignalCompanyName = enrichmentCompanyName;
        
    } else if (companyName) {
        // Fallback to LinkedIn profile if enrichment doesn't have company name
        verifiedCompanyName = companyName;
        effectiveCoreSignalCompanyName = companyName;
    }
    
    const companyEnrichmentWebsite = companyEnrichment?.data?.website || (companyEnrichment?.data as any)?.company_website;
    

    // Helper function for HubSpot call conditions
    function callHubspot(): boolean {
        return !!(profile?.id && shouldFetchData && linkedin);
    }

    // Fuzzy company match logic
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

    const coreSignalCompanyName = effectiveCoreSignalCompanyName;
    const rawHubspotName: any = hubspotCompany?.properties?.name?.value ?? hubspotCompany?.properties?.name;
    const hubspotCompanyName: string | undefined = typeof rawHubspotName === 'string' ? rawHubspotName : undefined;
    const companyNamesMatch = isFuzzyMatch(coreSignalCompanyName, hubspotCompanyName);
    // Consider an explicit HubSpot association as a match signal
    const effectiveCompanyNamesMatch = companyNamesMatch || !!companyId;



    // Required keys calculation
    const allRequiredKeys = new Set<string>();
    [...plays, ...smartVariablesDataInitial].forEach((play) => {
        if (!play.visible) return;
        const {requiredKeys: keys} = requiredKeys(play.play_steps);
        keys.forEach((key) => allRequiredKeys.add(key));
    });

    // DEBUG: Log research plays loading
    console.log('🔍 Research Plays Debug:', {
        researchPlaysLoading: isLoadingResearchPlays,
        researchPlaysCount: researchPlayTemplates?.length || 0,
        researchPlayNames: researchPlayTemplates?.map(p => p.name) || [],
        smartVariablesCount: smartVariablesDataInitial.length,
        smartVariableNames: smartVariablesDataInitial.map(p => p.name)
    });

    // Data processing - filter out "default" persona fallbacks
    const personaEntries = Object.entries(linkedInProfile?.persona || {});
    const validPersonaEntry = personaEntries.find(([name]) => name.toLowerCase() !== 'default') || personaEntries[0];
    const [rawPersonaName, persona] = validPersonaEntry || ["", {}];
    
    // Show a more meaningful name if persona was "default"
    const detectedPersonaName = rawPersonaName.toLowerCase() === 'default' ? '' : rawPersonaName;
    
    // Debug persona detection issue
    if (linkedInProfile) {
        console.log('🐛 PERSONA DEBUG:', {
            hasPersona: !!linkedInProfile.persona,
            personaKeys: linkedInProfile.persona ? Object.keys(linkedInProfile.persona) : null,
            allPersonaEntries: personaEntries,
            selectedValidEntry: validPersonaEntry,
            rawPersonaName: rawPersonaName,
            finalDetectedPersonaName: detectedPersonaName,
            wasDefaultFiltered: rawPersonaName.toLowerCase() === 'default',
            fullPersonaObject: linkedInProfile.persona
        });
    }
    
    // Extract persona prompts from linkedInProfile if available
    const personaPrompts = linkedInProfile?.persona_prompts || null;
    
    // Debug logging for persona prompts
    if (linkedInProfile) {
        console.log('🔍 Persona Prompts Debug:', {
            hasLinkedInProfile: !!linkedInProfile,
            hasPersonaPrompts: !!linkedInProfile.persona_prompts,
            personaPromptsKeys: linkedInProfile.persona_prompts ? Object.keys(linkedInProfile.persona_prompts) : null,
            personaPromptsValue: linkedInProfile.persona_prompts,
            extractedPersonaPrompts: personaPrompts,
            linkedInProfileKeys: Object.keys(linkedInProfile),
        });
    }
    const smartVariables = smartVariablesDataInitial.reduce<Dictionary<string>>(
        (acc, sv) => ({
            ...acc,
            [sv.name]: sv.value || "", // Convert null to empty string
        }),
        {},
    );

    const personaData = {
        ...persona,
        ...companyAndUserVariables,
    };

    let variablesForAllPlays: Record<string, string> = {};
    plays.forEach(
        ({variables}) => {
            // Filter out null/undefined values from variables
            const filteredVariables = Object.fromEntries(
                Object.entries(variables)
                    .filter(([_, value]) => value != null)
                    .map(([k, v]) => [k, String(v)])
            ) as Record<string, string>;
            variablesForAllPlays = {...variablesForAllPlays, ...filteredVariables};
        }
    );


    // Helper function to flatten Company Enrichment data
    function flattenCompanyEnrichmentData(enrichmentData: any): Record<string, string> {
        const flattened: Record<string, string> = {};
        
        if (!enrichmentData?.data) return flattened;
        
        const data = enrichmentData.data;
        
        // Map common Company Enrichment fields - try multiple possible name fields
        if (data.name) flattened.company_enrichment_name = data.name;
        if (data.company_name) flattened.company_enrichment_company_name = data.company_name;
        if (data.companyName) flattened.company_enrichment_companyName = data.companyName;
        if (data.description) flattened.company_enrichment_description = data.description;
        if (data.industry) flattened.company_enrichment_industry = data.industry;
        if (data.size) flattened.company_enrichment_size = String(data.size);
        if (data.website) flattened.company_enrichment_website = data.website;
        if (data.founded) flattened.company_enrichment_founded = String(data.founded);
        if (data.headquarters) flattened.company_enrichment_headquarters = data.headquarters;
        if (data.specialties) flattened.company_enrichment_specialties = data.specialties;
        if (data.employee_count) flattened.company_enrichment_employee_count = String(data.employee_count);
        if (data.linkedin_url) flattened.company_enrichment_linkedin_url = data.linkedin_url;
        
        return flattened;
    }

    // Data validation functions for each data source
    function isValidProfileData(profile: any): boolean {
        return !!(profile?.profile_data && Object.keys(profile.profile_data).length > 0);
    }

    function isValidCompanyData(data: Record<string, string>): boolean {
        const companyKeys = Object.keys(data).filter(k => k.startsWith('company_enrichment_'));
        return companyKeys.some(key => 
            data[key] && 
            data[key] !== 'loading' && 
            data[key] !== 'no_data' && 
            data[key].trim() !== ''
        );
    }

    function isValidHubspotData(data: Record<string, string>): boolean {
        const hubspotKeys = Object.keys(data).filter(k => 
            k.startsWith('hubspot_contact_') || 
            k.startsWith('hubspot_company_') || 
            k.startsWith('hubspot_deal_')
        );
        return hubspotKeys.some(key => 
            data[key] && 
            data[key] !== 'loading' && 
            data[key] !== 'no_data' && 
            data[key].trim() !== ''
        );
    }

    function isValidApifyData(data: Record<string, string>): boolean {
        const apifyKeys = Object.keys(data).filter(k => 
            k.includes('linkedin_post_') || k.includes('linkedin_jobs_')
        );
        return apifyKeys.some(key => 
            data[key] && 
            data[key] !== 'loading' && 
            data[key] !== 'no_data' && 
            data[key].trim() !== ''
        );
    }

    function isValidAccountIntelData(data: Record<string, string>): boolean {
        const accountIntelKeys = Object.keys(data).filter(k => 
            k.startsWith('account_intel') || k.startsWith('org_chart_')
        );
        return accountIntelKeys.some(key => 
            data[key] && 
            data[key] !== 'loading' && 
            data[key] !== 'no_data' && 
            data[key].trim() !== ''
        );
    }

    // Helper function to flatten LinkedIn Posts data  
    function flattenLinkedInPostsData(postsData: any): Record<string, string> {
        const flattened: Record<string, string> = {};
        
        if (!postsData?.data || !Array.isArray(postsData.data)) return flattened;
        
        const posts = postsData.data.slice(0, 5); // Limit to 5 posts
        
        flattened.linkedin_posts_count = String(posts.length);
        
        posts.forEach((post: any, index: number) => {
            const idx = index + 1;
            if (post.text) flattened[`linkedin_post_${idx}_text`] = post.text;
            if (post.posted_at?.date) flattened[`linkedin_post_${idx}_date`] = post.posted_at.date;
            if (post.posted_at?.relative) flattened[`linkedin_post_${idx}_relative_date`] = post.posted_at.relative;
            if (post.likes) flattened[`linkedin_post_${idx}_likes`] = String(post.likes);
            if (post.comments) flattened[`linkedin_post_${idx}_comments`] = String(post.comments);
            if (post.shares) flattened[`linkedin_post_${idx}_shares`] = String(post.shares);
        });
        
        // Latest post convenience variables
        if (posts.length > 0) {
            flattened.linkedin_latest_post_text = flattened.linkedin_post_1_text || '';
            flattened.linkedin_latest_post_date = flattened.linkedin_post_1_date || '';
        }
        
        return flattened;
    }

    // Helper function to flatten LinkedIn Jobs data
    function flattenLinkedInJobsData(jobsData: any): Record<string, string> {
        const flattened: Record<string, string> = {};
        
        if (!jobsData?.data || !Array.isArray(jobsData.data)) return flattened;
        
        const jobs = jobsData.data.slice(0, 5); // Limit to 5 jobs
        
        flattened.linkedin_jobs_count = String(jobs.length);
        flattened.linkedin_jobs_company = jobsData.searchParams?.company || '';
        
        jobs.forEach((job: any, index: number) => {
            const idx = index + 1;
            if (job.job_title || job.title) flattened[`linkedin_jobs_${idx}_title`] = job.job_title || job.title;
            if (job.company_name || job.company) flattened[`linkedin_jobs_${idx}_company`] = job.company_name || job.company;
            if (job.job_location || job.location) flattened[`linkedin_jobs_${idx}_location`] = job.job_location || job.location;
            if (job.url || job.linkedinUrl) flattened[`linkedin_jobs_${idx}_url`] = job.url || job.linkedinUrl;
            if (job.job_posted_date || job.postedDate) flattened[`linkedin_jobs_${idx}_posted_date`] = job.job_posted_date || job.postedDate;
            if (job.job_summary || job.description) flattened[`linkedin_jobs_${idx}_description`] = job.job_summary || job.description;
        });
        
        // Latest job convenience variables
        if (jobs.length > 0) {
            flattened.linkedin_latest_job_title = flattened.linkedin_jobs_1_title || '';
            flattened.linkedin_latest_job_company = flattened.linkedin_jobs_1_company || '';
        }
        
        return flattened;
    }

    // Guaranteed variables functions for each data source (batches)
    function guaranteedLinkedInProfileVar(): Record<string, string> {
        // Batch 1: LinkedIn Profile is guaranteed when we have profile data and it's not loading
        if (!isLinkedinProfileDataLoading && linkedInProfile) {
            return { linkedin_profile_guaranteed: "complete" };
        }
        return { linkedin_profile_guaranteed: "loading" };
    }

    function guaranteedCompanyEnrichmentVar(): Record<string, string> {
        // Batch 2: Company Enrichment is guaranteed when enrichment call is done (regardless of data)
        if (!isLoadingCompanyEnrichment) {
            console.log('✅ Batch 2 (Company Enrichment) COMPLETE - returning guaranteed variable');
            return { company_enrichment_guaranteed: "complete" };
        }
        console.log('⏳ Batch 2 (Company Enrichment) LOADING');
        return { company_enrichment_guaranteed: "loading" };
    }

    function guaranteedHubspotVar(): Record<string, string> {
        // Batch 3: HubSpot is guaranteed when HubSpot contact call is finished
        // (Other HubSpot calls depend on contact, so we only wait for contact to finish)
        if (!callHubspot()) {
            // If HubSpot is disabled, mark as no_data immediately
            return { hubspot_guaranteed: "no_data" };
        }
        
        if (!isPendingHubspotContactData) {
            // Check if we have any HubSpot data at all
            const hasContactData = !!hubspotContact;
            const hasCompanyData = !!hubspotCompany;
            const hasDealData = !!hubspotDealData?.deal;
            const hasEmployeeData = !!hubspotEmployees;
            
            const hasAnyHubspotData = hasContactData || hasCompanyData || hasDealData || hasEmployeeData;
            
            console.log('🔍 HubSpot guaranteed check:', {
                hasContactData,
                hasCompanyData, 
                hasDealData,
                hasEmployeeData,
                hasAnyHubspotData,
                isPendingContact: isPendingHubspotContactData
            });
            
            // TEMP FIX: Force HubSpot batch to complete even if no contact found
            // This allows research plays to proceed
            return { hubspot_guaranteed: "complete" };
        }
        return { hubspot_guaranteed: "loading" };
    }

    function guaranteedLinkedInPostsVar(): Record<string, string> {
        // Batch 4: LinkedIn Posts is guaranteed when posts call is done (regardless of data)
        if (!isLoadingLinkedInPosts) {
            console.log('✅ Batch 4 (LinkedIn Posts) COMPLETE - returning guaranteed variable');
            return { linkedin_posts_guaranteed: "complete" };
        }
        console.log('⏳ Batch 4 (LinkedIn Posts) LOADING');
        return { linkedin_posts_guaranteed: "loading" };
    }

    function guaranteedLinkedInJobsVar(): Record<string, string> {
        // Batch 5: LinkedIn Jobs is guaranteed when jobs call is done (regardless of data)
        if (!isLoadingLinkedInJobs) {
            console.log('✅ Batch 5 (LinkedIn Jobs) COMPLETE - returning guaranteed variable');
            return { linkedin_jobs_guaranteed: "complete" };
        }
        console.log('⏳ Batch 5 (LinkedIn Jobs) LOADING');
        return { linkedin_jobs_guaranteed: "loading" };
    }

    // DEBUG: Log company matching and HubSpot employees data
    console.log('🔍 COMPANY MATCHING DEBUG:', {
        effectiveCompanyNamesMatch,
        companyNamesMatch,
        companyId,
        hubspotEmployees: !!hubspotEmployees,
        hubspotEmployeesCount: hubspotEmployees?.length || 0,
        hubspotCompany: !!hubspotCompany,
        coreSignalCompanyName,
        hubspotCompanyName
    });

    // System variables that are always available
    const systemVariables: Record<string, string> = {
        today_date: new Date().toISOString().split('T')[0], // Format: YYYY-MM-DD
    };

    // Only construct allData when we have a current username (indicating we're on a profile)
    // This ensures no cached data interferes with the initial state
    const allData: Record<string, string> = currentUsername ? {
        ...systemVariables,
        ...variablesForAllPlays,
        ...linkedInProfile?.profile_data,
        ...smartVariables,
        ...smartVariablesData,
        ...customVariables,
        // Eagerly fetched, but only exposed when verified
        ...flattenHubspotData("Deal", hubspotDealData?.deal || null),
        ...flattenHubspotData("Contact", hubspotContact || null),
        ...flattenHubspotData("Company", effectiveCompanyNamesMatch ? (hubspotCompany || null) : null),
        ...(hubspotEmployees && effectiveCompanyNamesMatch ? (() => {
            const formatted = formatHubspotEmployees(hubspotEmployees);
            console.log('🔍 FORMATTED HUBSPOT EMPLOYEES:', formatted);
            return formatted;
        })() : {}),
        hubspot_company_match_status: effectiveCompanyNamesMatch ? "matched" : "mismatch",
        // Add Company Enrichment, LinkedIn Posts, and LinkedIn Jobs data
        ...flattenCompanyEnrichmentData(companyEnrichment),
        ...flattenLinkedInPostsData(linkedInPostsData),
        ...flattenLinkedInJobsData(linkedInJobsData),
        // Add Org Chart matching data for research
        ...(() => {
            console.log('🎯 ORG CHART MATCH OBJECT:', {
                hasMatch: !!orgChartMatch,
                matchType: orgChartMatch?.matchType,
                confidence: orgChartMatch?.confidence,
                companyName: orgChartMatch?.orgChart?.name,
                hasAccountIntel: !!orgChartMatch?.accountIntel,
                accountIntelLength: orgChartMatch?.accountIntel?.length || 0
            });
            
            const accountIntelData = getAccountIntelForResearch(orgChartMatch);
            
            console.log('🎯 ACCOUNT INTEL DATA FOR PLAYS:', {
                hasOrgChartMatch: !!orgChartMatch,
                accountIntelData,
                accountIntelDataKeys: Object.keys(accountIntelData),
                accountIntel: accountIntelData.account_intel,
                accountIntelLength: accountIntelData.account_intel?.length || 0,
                accountIntelPreview: accountIntelData.account_intel?.substring(0, 100)
            });
            return accountIntelData;
        })(),
        // GUARANTEED VARIABLES: Batch completion indicators
        ...guaranteedLinkedInProfileVar(),      // Batch 1
        ...guaranteedCompanyEnrichmentVar(),    // Batch 2  
        ...guaranteedHubspotVar(),              // Batch 3
        ...guaranteedLinkedInPostsVar(),        // Batch 4
        ...guaranteedLinkedInJobsVar(),         // Batch 5
    } : {};

    // Always add timing data (even when allData is empty) so the debug modal can display it
    if (apiTimingRef.current.startedAt) {
        allData.timing_json = JSON.stringify(apiTimingRef.current);
    }

        // DEBUG: Log allData construction
        console.log('🔍 AllData Construction Debug:', {
            currentUsername,
            allDataKeys: Object.keys(allData),
            allDataEmpty: Object.keys(allData).length === 0,
            hasLinkedInProfile: !!linkedInProfile,
            hasCompanyEnrichment: !!companyEnrichment,
            hasHubspotData: !!(hubspotDealData || hubspotContact || hubspotCompany),
            hasApifyData: !!(linkedInPostsData || linkedInJobsData)
        });

    // DEBUG: Log guaranteed variables status
    const guaranteedVars = {
        batch1_linkedin: guaranteedLinkedInProfileVar(),
        batch2_company: guaranteedCompanyEnrichmentVar(),
        batch3_hubspot: guaranteedHubspotVar(),
        batch4_posts: guaranteedLinkedInPostsVar(),
        batch5_jobs: guaranteedLinkedInJobsVar()
    };

    // DEBUG: Log all available variables for research plays
    console.log('🔍 ALL DATA VARIABLES DEBUG:', {
        totalVariables: Object.keys(allData).length,
        hubspotVariables: Object.keys(allData).filter(k => k.startsWith('hubspot_')),
        accountIntelVariables: Object.keys(allData).filter(k => k.includes('account_intel') || k.includes('org_chart')),
        missingHubspotCoworkers: !allData.hubspot_coworkers,
        allDataKeys: Object.keys(allData).sort()
    });
    console.log('🔍 GUARANTEED VARIABLES STATUS:');
    Object.entries(guaranteedVars).forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
    });


    
    // DEBUG: Loading states for all data sources
    const loadingStates = {
        linkedin_profile: !isLinkedinProfileDataLoading,
        company_enrichment: !isLoadingCompanyEnrichment,
        hubspot_contact: !isPendingHubspotContactData,
        hubspot_deal: !isPendingHubspotDealData,
        hubspot_company: !isPendingHubspotCompanyData,
        hubspot_employees: !isPendingHubspotEmployeesData,
        linkedin_posts: !isLoadingLinkedInPosts,
        linkedin_jobs: !isLoadingLinkedInJobs
    };
    console.log('🔍 DATA SOURCE LOADING STATES:');
    Object.entries(loadingStates).forEach(([key, value]) => {
        console.log(`  ${key}: ${value ? '✅ LOADED' : '⏳ LOADING'}`);
    });
    
    // DEBUG: Data availability
    const dataAvailability = {
        linkedin_profile_data: !!linkedInProfile,
        company_enrichment_data: !!companyEnrichment,
        hubspot_contact_data: !!hubspotContact,
        hubspot_company_data: !!hubspotCompany,
        hubspot_deal_data: !!hubspotDealData,
        hubspot_employees_data: !!hubspotEmployees,
        linkedin_posts_data: !!linkedInPostsData,
        linkedin_jobs_data: !!linkedInJobsData
    };
    console.log('🔍 DATA AVAILABILITY:');
    Object.entries(dataAvailability).forEach(([key, value]) => {
        console.log(`  ${key}: ${value ? '✅ HAS DATA' : '❌ NO DATA'}`);
    });

    // Debug: Log batch system status ONLY when a batch guaranteed flag changes
    useEffect(() => {
        const sig = [
            allData.linkedin_profile_guaranteed,
            allData.company_enrichment_guaranteed,
            allData.hubspot_guaranteed,
            allData.linkedin_posts_guaranteed,
            allData.linkedin_jobs_guaranteed,
        ].join('|');

        if (sig === lastBatchLoggedSigRef.current) {
            return;
        }
        lastBatchLoggedSigRef.current = sig;

        const linkedInProfileFields = Object.keys(allData).filter(k => k.startsWith('linkedin_') && !k.includes('guaranteed')).length;
        const companyEnrichmentFields = Object.keys(allData).filter(k => k.startsWith('company_enrichment_')).length;
        const hubspotFields = Object.keys(allData).filter(k => k.startsWith('hubspot_')).length;
        const postsFields = Object.keys(allData).filter(k => k.includes('linkedin_post_')).length;
        const jobsFields = Object.keys(allData).filter(k => k.includes('linkedin_jobs_')).length;

        originalConsoleLogRef.current('📊 BATCH SYSTEM STATUS & DATA COUNTS:', {
            'Batch 1 (LinkedIn Profile)': `${allData.linkedin_profile_guaranteed || 'loading'} - ${linkedInProfileFields} fields`,
            'Batch 2 (Company Enrichment)': `${allData.company_enrichment_guaranteed || 'loading'} - ${companyEnrichmentFields} fields`,
            'Batch 3 (HubSpot)': `${allData.hubspot_guaranteed || 'loading'} - ${hubspotFields} fields`,
            'Batch 4 (LinkedIn Posts)': `${allData.linkedin_posts_guaranteed || 'loading'} - ${postsFields} fields`,
            'Batch 5 (LinkedIn Jobs)': `${allData.linkedin_jobs_guaranteed || 'loading'} - ${jobsFields} fields`,
            'TOTAL DATA FIELDS': Object.keys(allData).length
        });

        originalConsoleLogRef.current('🔍 CRITICAL VARIABLES CHECK:', {
            summary: allData.summary ? 'EXISTS' : 'MISSING',
            experience: allData.experience ? 'EXISTS' : 'MISSING', 
            education: allData.education ? 'EXISTS' : 'MISSING',
            first_name: allData.first_name ? 'EXISTS' : 'MISSING',
            last_name: allData.last_name ? 'EXISTS' : 'MISSING',
            headline: allData.headline ? 'EXISTS' : 'MISSING',
            // Backend will handle normalization - these are the raw frontend variables
            company_name: allData.company_name ? 'EXISTS' : 'MISSING',
            website: allData.website ? 'EXISTS' : 'MISSING'
        });

        originalConsoleLogRef.current('🔍 APIFY DATA CHECK:', {
            isLoadingPosts: isLoadingLinkedInPosts,
            postsData: !!linkedInPostsData,
            postsError: linkedInPostsError,
            isLoadingJobs: isLoadingLinkedInJobs, 
            jobsData: !!linkedInJobsData,
            jobsError: linkedInJobsError
        });

        originalConsoleLogRef.current('🔍 AVAILABLE DATA SAMPLE:', Object.keys(allData).slice(0, 20));
    }, [
        allData.linkedin_profile_guaranteed,
        allData.company_enrichment_guaranteed,
        allData.hubspot_guaranteed,
        allData.linkedin_posts_guaranteed,
        allData.linkedin_jobs_guaranteed,
        isLoadingLinkedInPosts,
        linkedInPostsData,
        linkedInPostsError,
        isLoadingLinkedInJobs,
        linkedInJobsData,
        linkedInJobsError,
    ]);

    // API completion detection - update states when data becomes available
    // Only check for completion when we're actually in a research session
    useEffect(() => {
        // Only proceed if we have a current username (indicating we're on a profile)
        if (!currentUsername) {
            console.log('🔍 API Completion: No currentUsername, resetting completion states');
            // Reset completion states and locks when no username (not on a profile)
            apiCompletionLocksRef.current = {
                companyEnrichment: false,
                hubspot: false,
                apifyContent: false,
                accountIntel: false
            };
            setApiCompletionStates({
                companyEnrichment: false,
                hubspot: false,
                apifyContent: false,
                accountIntel: false
            });
            return;
        }
        
        console.log('🔍 API Completion: Checking completion states for username:', currentUsername);
        console.log('🔍 API Completion: Current states:', apiCompletionStates);
        console.log('🔍 API Completion: AllData keys sample:', Object.keys(allData).slice(0, 10));
        
        // Debug: Check what data is triggering the completion states
        const companyEnrichmentKeys = Object.keys(allData).filter(k => k.startsWith('company_enrichment_'));
        const hubspotKeys = Object.keys(allData).filter(k => k.startsWith('hubspot_contact_') || k.startsWith('hubspot_company_') || k.startsWith('hubspot_deal_'));
        const apifyKeys = Object.keys(allData).filter(k => k.includes('linkedin_post_') || k.includes('linkedin_jobs_'));
        
        console.log('🔍 API Completion: Company Enrichment keys found:', companyEnrichmentKeys);
        console.log('🔍 API Completion: HubSpot keys found:', hubspotKeys);
        console.log('🔍 API Completion: Apify keys found:', apifyKeys);
        
        // Debug: Show validation results
        console.log('🔍 Validation Results:', {
            profileValid: isValidProfileData(linkedInProfile),
            companyValid: isValidCompanyData(allData),
            hubspotValid: isValidHubspotData(allData),
            apifyValid: isValidApifyData(allData)
        });
        
        // Debug: Show current completion states
        console.log('🔍 Current Completion States:', apiCompletionStates);
        console.log('🔍 Current Loading States:', dataLoadingStates);
        console.log('🔍 Current Completion Locks:', apiCompletionLocksRef.current);
        
        // Company Enrichment completion - check for valid company data
        if (isValidCompanyData(allData) && !apiCompletionLocksRef.current.companyEnrichment) {
            console.log('✅ Company Enrichment data validated - locking completion state');
            apiCompletionLocksRef.current.companyEnrichment = true;
            setApiCompletionStates(prev => ({ ...prev, companyEnrichment: true }));
        }
        
        // HubSpot completion - check for valid HubSpot data
        if (isValidHubspotData(allData) && !apiCompletionLocksRef.current.hubspot) {
            console.log('✅ HubSpot data validated - locking completion state');
            apiCompletionLocksRef.current.hubspot = true;
            setApiCompletionStates(prev => ({ ...prev, hubspot: true }));
        }
        
        // Apify completion - check for valid Apify data
        if (isValidApifyData(allData) && !apiCompletionLocksRef.current.apifyContent) {
            console.log('✅ Apify data validated - locking completion state');
            apiCompletionLocksRef.current.apifyContent = true;
            setApiCompletionStates(prev => ({ ...prev, apifyContent: true }));
        }
        
        // Account Intel completion - check for valid account intel data
        if (isValidAccountIntelData(allData) && !apiCompletionLocksRef.current.accountIntel) {
            console.log('✅ Account Intel data validated - locking completion state');
            apiCompletionLocksRef.current.accountIntel = true;
            setApiCompletionStates(prev => ({ ...prev, accountIntel: true }));
        }
    }, [allData, apiCompletionStates, linkedInProfile, currentUsername]);

    const cleanDataForLLM = (data: Record<string, any>): Record<string, string> => {
        return Object.entries(data).reduce((acc, [key, rawValue]) => {
            // Always preserve account_intel and org_chart variables - they're conditionally available
            const isAccountIntelVar = key === 'account_intel' || key.startsWith('org_chart_');
            if (isAccountIntelVar && rawValue != null) {
                acc[key] = String(rawValue);
                return acc;
            }
            
            const value = rawValue == null ? '' : String(rawValue);
            if (value !== '' && value !== 'nothing' && !value.includes('⛔️')) {
                acc[key] = value;
            }
            return acc;
        }, {} as Record<string, string>);
    };

    // Sanitize persona data so it doesn't override external_data with empty values or create fan-out
    const cleanPersonaData = (data: Record<string, any>): Record<string, string> => {
        if (!data || typeof data !== 'object') return {};
        const result: Record<string, string> = {};
        Object.entries(data).forEach(([key, val]) => {
            if (val == null) return;
            if (Array.isArray(val)) {
                const strs = val.map(v => (v == null ? '' : String(v).trim())).filter(s => s && s !== 'nothing' && !s.includes('⛔️'));
                if (strs.length > 0) result[key] = strs.join(', ');
            } else {
                const s = String(val).trim();
                if (s && s !== 'nothing' && !s.includes('⛔️')) result[key] = s;
            }
        });
        return result;
    };
    const keysForPlay = (play: Play) => {
        const {requiredKeys: required} = requiredKeys(play.play_steps);
        return required.filter((k) => !personaData[k]);
    };

    function checkIfMentionsHubspotInStepVariables(str: string, variables: Record<string, string>): boolean {
        const {replacedVariables} = formatString(str, variables);
        return !!replacedVariables.find(v => v.name.startsWith('hubspot_'))
    }

    function checkIfMentionsHubspotInStep(play: PlayStep, variables: Record<string, string>): boolean {
        return checkIfMentionsHubspotInStepVariables(play.system_instructions_template ?? '', variables)
            || checkIfMentionsHubspotInStepVariables(play.user_instructions_template ?? '', variables);
    }

    function checkIfPlayMentionsHubspotAnywhereInItsSteps(play: Play, variables: Record<string, string>): boolean {
        for (const step of play.play_steps) {
            if (checkIfMentionsHubspotInStep(step, variables)) {
                return true;
            }
        }
        return false;
    }

    // Batch system: Determine which batches are required for a play
    const getRequiredBatchesForPlay = (play: Play): number[] => {
        // Use API-provided batch requirements if available (from batch management)
        if (play.required_batches && play.required_batches.length > 0) {
            console.log(`🎯 Using API-provided batch requirements for play "${play.name}":`, play.required_batches);
            return play.required_batches;
        }
        
        // Fallback to text-based detection for backward compatibility
        console.log(`📝 Using text-based batch detection for play "${play.name}"`);
        const requiredBatches = [];
        const playStepsText = play.play_steps.map(step => 
            (step.system_instructions_template || '') + (step.user_instructions_template || '')
        ).join(' ').toLowerCase();

        // Batch 1: LinkedIn Profile - required if play mentions LinkedIn profile data
        if (playStepsText.includes('linkedin_') || playStepsText.includes('first_name') || 
            playStepsText.includes('last_name') || playStepsText.includes('headline')) {
            requiredBatches.push(1);
        }

        // Batch 2: Company Enrichment - required if play mentions company enrichment data
        if (playStepsText.includes('company_enrichment_') || playStepsText.includes('company_name') || 
            playStepsText.includes('company_industry') || playStepsText.includes('website') ||
            playStepsText.includes('description')) {
            requiredBatches.push(2);
        }

        // Batch 3: HubSpot - required if play mentions HubSpot data
        if (playStepsText.includes('hubspot_') || checkIfPlayMentionsHubspotAnywhereInItsSteps(play, allData)) {
            requiredBatches.push(3);
        }

        // Batch 4: LinkedIn Posts - required if play mentions LinkedIn posts
        if (playStepsText.includes('linkedin_post_') || playStepsText.includes('linkedin_posts_')) {
            requiredBatches.push(4);
        }

        // Batch 5: LinkedIn Jobs - required if play mentions LinkedIn jobs
        if (playStepsText.includes('linkedin_job_') || playStepsText.includes('linkedin_jobs_')) {
            requiredBatches.push(5);
        }

        console.log(`📝 Text-based detection found batches:`, requiredBatches);
        return requiredBatches;
    };

    // Check if required batches are available
    const areBatchesAvailable = (requiredBatches: number[]): boolean => {
        // If no batches are required, return true (empty requirement)
        if (!requiredBatches || requiredBatches.length === 0) {
            return true;
        }

        for (const batchNumber of requiredBatches) {
            let batchGuaranteedVar = '';
            switch (batchNumber) {
                case 1: batchGuaranteedVar = 'linkedin_profile_guaranteed'; break;
                case 2: batchGuaranteedVar = 'company_enrichment_guaranteed'; break;
                case 3: batchGuaranteedVar = 'hubspot_guaranteed'; break;
                case 4: batchGuaranteedVar = 'linkedin_posts_guaranteed'; break;
                case 5: batchGuaranteedVar = 'linkedin_jobs_guaranteed'; break;
            }
            
            const batchStatus = allData[batchGuaranteedVar];
            
            // Batch is available if it's "complete" or "no_data" (finished loading)
            // Still loading if "loading" or undefined
            if (batchStatus === 'loading' || !batchStatus) {
                console.log(`🔄 Batch ${batchNumber} (${batchGuaranteedVar}) not ready: ${batchStatus}`);
            return false;
        }
        }
        console.log(`✅ All required batches ready: [${requiredBatches.join(', ')}]`);
        return true;
    };

    // Content presence checks per batch to avoid running plays with empty data
    const hasContentForBatch = (batchNumber: number): boolean => {
        switch (batchNumber) {
            case 1: // LinkedIn Profile
                return Boolean(allData.first_name || allData.summary || allData.headline);
            case 2: // Company Enrichment
                return Object.keys(allData).some(k => k.startsWith('company_enrichment_'));
            case 3: // HubSpot
                return Object.keys(allData).some(k => k.startsWith('hubspot_contact_') || k.startsWith('hubspot_company_') || k.startsWith('hubspot_deal_'));
            case 4: // LinkedIn Posts
                return Object.keys(allData).some(k => k.includes('linkedin_post_'));
            case 5: // LinkedIn Jobs
                return Object.keys(allData).some(k => k.includes('linkedin_jobs_'));
            default:
                return true;
        }
    };

    const hasContentForRequiredBatches = (requiredBatches: number[]): boolean => {
        if (!requiredBatches || requiredBatches.length === 0) return true;
        for (const b of requiredBatches) {
            if (!hasContentForBatch(b)) {
                console.log(`⏳ Required batch ${b} ready but has no content yet; delaying play run`);
                return false;
            }
        }
        return true;
    };

    const isPlayAbleToRunWithoutCustomVars = (play: Play): boolean => {
        // NEW BATCH-BASED SYSTEM: Check if required batches are available
        const requiredBatches = getRequiredBatchesForPlay(play);
        const batchesAvailable = areBatchesAvailable(requiredBatches);
        
        // Must have basic LinkedIn profile data (Batch 1) at minimum
        const hasProfile = !!linkedInProfile;
        const isLoading = isLinkedinProfileDataLoading;
        
        // Additional check: for final plays, ensure we have at least LinkedIn profile batch ready
        const linkedInBatchReady = allData.linkedin_profile_guaranteed === 'complete';
        
        // CRITICAL: Check if all required variables are available
        const requiredVars = keysForPlay(play);
        
        // Account intel variables are conditionally available (only if org chart matches)
        // They shouldn't block the play from running if not available
        const accountIntelVars = ['account_intel', 'org_chart_matched', 'org_chart_match_type', 'org_chart_confidence', 'org_chart_company_name'];
        
        const allRequiredVarsAvailable = requiredVars.every(key => {
            // Skip account intel variables - they're conditionally available
            if (accountIntelVars.includes(key)) {
                console.log(`🔍 Variable check for ${play.name}: ${key} is account intel variable (optional) - skipping validation`);
                return true; // Don't block execution if account intel is not available
            }
            
            const value = allData[key];
            const hasValue = value && value !== "" && !value.includes("⛔️") && value !== "nothing";
            console.log(`🔍 Variable check for ${play.name}: ${key} = "${value?.substring(0, 50)}..." (hasValue: ${hasValue})`);
            return hasValue;
        });
        
        const canRun = hasProfile && !isLoading && batchesAvailable && linkedInBatchReady && allRequiredVarsAvailable;
        
        // DEBUG: Log detailed execution decision
        const accountIntelVarsInRequired = requiredVars.filter(k => accountIntelVars.includes(k));
        const accountIntelVarsInAllData = accountIntelVars.filter(k => allData[k]);
        
        console.log(`🎯 ${play.name} execution check:`, {
            hasProfile,
            isLoading,
            requiredBatches,
            batchesAvailable,
            linkedInBatchReady,
            requiredVars,
            allRequiredVarsAvailable,
            canRun,
            accountIntelVarsInRequired,
            accountIntelVarsInAllData,
            hasAccountIntel: !!allData.account_intel,
            accountIntelLength: allData.account_intel?.length || 0,
            guaranteedVars: Object.keys(allData).filter(k => k.includes('guaranteed')).map(k => [k, allData[k]])
        });
        
        return canRun;
    };

    // This effect monitors URL changes and handles profile navigation
    useEffect(() => {
        const processUrl = async () => {
            if (!url) return;

            const host = new URL(url).host;
            if (!host.includes("linkedin.com") && !host.includes("hubspot.com"))
                return;

            const processUsername = (username: string | undefined, metadata?: any) => {
                if (username && username !== currentUsername) {
                    // COMPLETELY reset all state
                    client.clear();

                    // Reset state variables
                    setCurrentUsername(username);
                    setSelectedPlay(undefined);
                    setSmartVariablesData({});
                    setPlayResponses({});
                    attemptsRef.current = {};

                    // IMPORTANT: Reset manual research flag when navigating to a new profile
                    setHasManuallyResearched(false);
                    setExecutionCount(0); // Reset circuit breaker
                    client.setQueryData(["linkedin-profiles/", "POST"], null);

                    setPendingTasks([]);
                    setTotalTasksInitiated(0);
                    
                    // Reset extracted email from HubSpot
                    setExtractedEmailFromHubSpot(undefined);

                    // Reset API completion states and locks when new LinkedIn profile is detected
                    apiCompletionLocksRef.current = {
                        companyEnrichment: false,
                        hubspot: false,
                        apifyContent: false,
                        accountIntel: false
                    };
                    setApiCompletionStates({
                        companyEnrichment: false,
                        hubspot: false,
                        apifyContent: false,
                        accountIntel: false
                    });

                    // Store the LinkedIn URL if it came from email lookup
                    if (metadata?.linkedInUrl && metadata?.fromEmail) {
                        setLinkedInProfileFromEmail(metadata.linkedInUrl);
                    } else {
                        setLinkedInProfileFromEmail(null);
                    }

                    // Force reload by creating a slight delay - but only if auto-run is true
                    if (autoRun) {
                        setTimeout(() => {
                            // Reset API completion locks before automatic research
                            apiCompletionLocksRef.current = {
                                companyEnrichment: false,
                                hubspot: false,
                                apifyContent: false,
                                accountIntel: false
                            };
                            fetchLinkedInProfileDataWithTracking({profile_id: username});
                        }, 100);
                    }
                }
            };

            if (isSalesNavigatorProfile(url)) {
                await handleProfileExtraction(
                    extractLinkedInProfileFromSalesNav,
                    setIsScrapingProfile,
                    processUsername,
                );
                return;
            }

            if (isHubSpotContactPage(url)) {
                await handleHubSpotProfileExtraction(
                    setIsScrapingProfile,
                    processUsername,
                    setLinkedInProfileFromEmail,
                    setExtractedEmailFromHubSpot,
                );
                return;
            }

            // Handle regular LinkedIn profile pages
            const username = getLinkedInUsernameFromUrl(url);
            processUsername(username);
        };

        processUrl();
    }, [url, currentUsername]); // Only depend on URL and currentUsername to avoid infinite loops

    // (Auto-run disabled: research is only started by user action or autoRun)

    // This effect refetches Hubspot when LinkedIn profile changes
    useEffect(() => {
        if (linkedInProfile && linkedInProfile.profile_id === currentUsername) {
            console.log("LinkedIn profile updated - refetching Hubspot data", {
                profile_id: linkedInProfile.profile_id,
                name: linkedin?.first_name,
                auto_run: autoRun,
                has_manually_researched: hasManuallyResearched
            });

            // Only refetch if we have explicitly requested research
            if (shouldFetchData) {
                refetchHubspotContactData();
            }
        }
    }, [linkedInProfile?.profile_id, shouldFetchData, currentUsername]);

    // Endpoint timing stamps (mark when each finishes)
    useEffect(() => { markEndpoint('linkedin_profile', !isLinkedinProfileDataLoading); }, [isLinkedinProfileDataLoading]);
    useEffect(() => { markEndpoint('company_enrichment', !isLoadingCompanyEnrichment); }, [isLoadingCompanyEnrichment]);
    useEffect(() => { markEndpoint('hubspot_contact', !isPendingHubspotContactData); }, [isPendingHubspotContactData]);
    useEffect(() => { markEndpoint('hubspot_company', !isPendingHubspotCompanyData); }, [isPendingHubspotCompanyData]);
    useEffect(() => { markEndpoint('hubspot_deal', !isPendingHubspotDealData); }, [isPendingHubspotDealData]);
    useEffect(() => { markEndpoint('hubspot_employees', !isPendingHubspotEmployeesData); }, [isPendingHubspotEmployeesData]);
    useEffect(() => { markEndpoint('linkedin_posts', !isLoadingLinkedInPosts); }, [isLoadingLinkedInPosts]);
    useEffect(() => { markEndpoint('linkedin_jobs', !isLoadingLinkedInJobs); }, [isLoadingLinkedInJobs]);

    // Run the selected play when it changes
    useEffect(() => {
        if (selectedPlay) {
            // Add the selected play to pending tasks
            if (!pendingTasks.includes(selectedPlay.name)) {
                setPendingTasks((prev: string[]) => [...prev, selectedPlay.name]);
                // Increment the total count if we're adding a new task
                setTotalTasksInitiated((current: number) => current + 1);
            }
            runPlay();
        }
    }, [selectedPlay]);

    useEffect(() => {
        // If no pending tasks, nothing to do
        if (pendingTasks.length === 0) return;

        // Set a timeout to clear any task that stays pending too long
        const timeoutId = setTimeout(() => {
            console.log("Some tasks were pending too long, forcing cleanup:", pendingTasks);
            // Force clear all pending tasks after timeout
            setPendingTasks([]);
        }, 10000); // 10 seconds timeout

        // Clean up timeout if component unmounts or pendingTasks changes
        return () => clearTimeout(timeoutId);
    }, [pendingTasks]);

    // Helper function to extract variable names from a template string (same as analytics)
    const extractVariables = (template?: string): string[] => {
        if (!template) return [];
        const variableRegex = /\{([^{}]+)\}/g;
        const matches = template.match(variableRegex) || [];
        return matches
            .map(match => match.slice(1, -1)) // Remove { and }
            .filter(variable => !variable.endsWith('?')) // Ignore optional variables like {foo?}
            .map(variable => variable.replace(/\?$/, '')) // Strip any trailing ? if present
            .filter(variable =>
                !variable.startsWith('prompt_') &&
                variable !== 'linkedin' &&
                variable !== 'hubspot'
            );
    };

    // Check if research play has all its required variables available (turns "green")
    const isResearchPlayReadyToRun = (play: Play): boolean => {
        // Must have basic LinkedIn profile data at minimum
        const hasProfile = !!linkedInProfile;
        const isLoading = isLinkedinProfileDataLoading;
        
        if (!hasProfile || isLoading) {
            return false;
        }

        // Gate solely on required batches being available
        const requiredBatches = getRequiredBatchesForPlay(play);
        const batchesAvailable = areBatchesAvailable(requiredBatches);
        if (!batchesAvailable) return false;

        // Additional minimal gating: ensure required batch content is present
        const contentReady = hasContentForRequiredBatches(requiredBatches);
        return contentReady;
    };

    // This effect executes research plays as batches complete
    useEffect(() => {
        // Log only when a batch flag changes
        const sig = [
            allData.linkedin_profile_guaranteed,
            allData.company_enrichment_guaranteed,
            allData.hubspot_guaranteed,
            allData.linkedin_posts_guaranteed,
            allData.linkedin_jobs_guaranteed,
        ].join('|');
        if (sig !== lastBatchLoggedSigRef.current) {
            originalConsoleLogRef.current('🔥 BATCH COMPLETION CHECK:', { 
                shouldFetchData, 
                researchPlaysCount: smartVariablesDataInitial.length, 
                executionCount,
                batchStatus: {
                    linkedin: allData.linkedin_profile_guaranteed,
                    company: allData.company_enrichment_guaranteed,
                    hubspot: allData.hubspot_guaranteed,
                    posts: allData.linkedin_posts_guaranteed,
                    jobs: allData.linkedin_jobs_guaranteed
                }
            });
        }
        
        // Circuit breaker - prevent infinite executions
        if (executionCount >= maxExecutions) {
            console.log('🚨 Circuit breaker activated - too many executions, stopping to prevent infinite loops');
            // Reset circuit breaker after 5 seconds to allow retry
            setTimeout(() => {
                console.log('🔄 Resetting circuit breaker');
                setExecutionCount(0);
            }, 5000);
            return;
        }
        
        // Skip if research is not enabled
        if (!shouldFetchData) {
            console.log('❌ Skipping research execution - shouldFetchData is false');
            return;
        }
        
        // Skip if research has been stopped
        if (isResearchStopped) {
            console.log('🛑 Skipping research execution - research has been stopped');
            return;
        }
        
        console.log('✅ Checking which research plays are now ready to run...');
        setExecutionCount((prev: number) => prev + 1);

        // Here we do a one-time count of plays with values
        // This happens only once when the effect first runs
        if (totalTasksInitiated === 0) {
            // Count plays with non-empty values
            const completedPlayCount = smartVariablesDataInitial.filter(
                play => play.visible &&
                    play.value !== null &&
                    play.value !== undefined &&
                    play.value !== "nothing"
            ).length;

            // Set the initial count
            if (completedPlayCount > 0) {
                setTotalTasksInitiated(completedPlayCount);
                console.log(`Adding ${completedPlayCount} pre-existing values to total count`);
            }
        }

        // Filter ONLY research plays that need execution (NO messaging plays)
        console.log('🎯 Starting research play filtering with', smartVariablesDataInitial.length, 'total research plays');
        
        // SPECIFIC DEBUG: Check Sports play (should only need "summary")
        const sportsPlay = smartVariablesDataInitial.find(p => p.name === 'Sports');
        if (sportsPlay) {
            console.log('🏈 SPORTS PLAY DEBUG:', {
                name: sportsPlay.name,
                visible: sportsPlay.visible,
                output_type: sportsPlay.output_type,
                isReadyToRun: isResearchPlayReadyToRun(sportsPlay),
                hasSummary: !!allData.summary,
                summaryValue: allData.summary ? allData.summary.slice(0, 50) + '...' : 'MISSING'
            });
        }
        
        const dataToFetch = smartVariablesDataInitial.filter(
            (play) => {
                // CRITICAL: Only process research plays, never messaging plays
                if (play.output_type !== 'variable') {
                    console.log(`❌ Skipping ${play.name} - not a research play (output_type: ${play.output_type})`);
                    return false;
                }

                // Get current value first before using it
                const currentValue = smartVariablesData[play.name];

                // IMPLEMENT COUNTER TO DETECT HOW MANY TIMES WE TRIED A PLAY
                // RESET COUNTER FOR ERROR VALUES TO ALLOW RETRY
                if (currentValue === "⛔️ error") {
                    attemptsRef.current[play.name] = 0;
                }
                if ((attemptsRef.current[play.name] || 0) >= 3) {
                    console.log(`❌ Skipping ${play.name} - too many attempts`);
                    return false; // Skip if we've tried too many times
                }

                // Skip if this play is already pending execution
                if (pendingTasks.includes(play.name)) {
                    console.log(`❌ Skipping ${play.name} - already pending`);
                    return false;
                }

                // Skip if we already have valid research results
                const alreadyHasResearch = isValidSmartVariableValue(currentValue) && currentValue !== "⛔️ error";
                if (alreadyHasResearch) {
                    console.log(`❌ Skipping ${play.name} - already has results`);
                    return false;
                }
                
                // Check if this research play is ready to run (has all required variables)
                const canRun = play.visible && isResearchPlayReadyToRun(play);

                console.log(`${canRun ? '✅' : '❌'} ${play.name}: ${canRun ? 'READY TO RUN' : 'WAITING FOR DATA'}`);

                // If we're going to run it, increment the counter
                if (canRun) {
                    attemptsRef.current[play.name] = (attemptsRef.current[play.name] || 0) + 1;
                    console.log(`🚀 WILL EXECUTE ${play.name} (attempt ${attemptsRef.current[play.name]})`);
                }

                return canRun;
            }
        );

        console.log('🎯 Research filtering complete:', {
            totalPlays: smartVariablesDataInitial.length,
            playsToFetch: dataToFetch.length,
            playNames: dataToFetch.map(play => play.name)
        });

        if (dataToFetch.length > 0) {
            console.log('Adding the following tasks to PendingTasks:', dataToFetch.map(play => play.name));
            setPendingTasks((current: string[]) => [...current, ...dataToFetch.map(play => play.name)]);
            setTotalTasksInitiated((current: number) => current + dataToFetch.length);
        } else {
            console.log('❌ No research plays to execute - all plays were filtered out');
            console.log('🔍 First few plays and their statuses:');
            smartVariablesDataInitial.slice(0, 5).forEach((play, i) => {
                console.log(`  ${i+1}. ${play.name}: visible=${play.visible}, value="${play.value}", hasValue=${!!play.value && play.value !== "nothing"}`);
            });
        }

        // Execute plays in parallel with in-flight dedupe
        if (dataToFetch.length > 0) {
            setIsLoadingSmartVariablesFinal(true);
            
            // ✅ OPTIMIZATION: Process data ONCE before the loop instead of for every play
            console.log(`🔄 Processing data for ${dataToFetch.length} plays...`);
            const cleanedResearchData = cleanDataForLLM(allData);
            console.log('🎯 RESEARCH PLAYS DATA - Before processing:', {
                allDataKeys: Object.keys(allData),
                cleanedDataKeys: Object.keys(cleanedResearchData),
                hasAccountIntel: !!cleanedResearchData.account_intel,
                accountIntelValue: cleanedResearchData.account_intel?.substring(0, 200) + '...',
                accountIntelLength: cleanedResearchData.account_intel?.length || 0,
                accountIntelVariables: Object.keys(cleanedResearchData).filter(k => k.includes('account_intel') || k.includes('org_chart'))
            });
            
            const processedResearchData = prepareDataForPlay(cleanedResearchData);
            const processedPersonaData = cleanPersonaData(personaData as any);
            
            console.log('🎯 RESEARCH PLAYS DATA - After processing:', {
                processedDataKeys: Object.keys(processedResearchData),
                hasAccountIntel: !!processedResearchData.account_intel,
                accountIntelValue: processedResearchData.account_intel?.substring(0, 200) + '...',
                accountIntelLength: processedResearchData.account_intel?.length || 0,
                accountIntelVariables: Object.keys(processedResearchData).filter(k => k.includes('account_intel') || k.includes('org_chart'))
            });
            
            console.log(`✅ Data processing complete - ${Object.keys(processedResearchData).length} research keys, ${Object.keys(processedPersonaData).length} persona keys`);
            
            // ✅ OPTIMIZATION: Calculate payload statistics ONCE instead of for every play
            const keys = Object.keys(processedResearchData);
            const count = (fn: (k: string) => boolean) => keys.filter(fn).length;
            const payloadStats = {
                totalKeys: keys.length,
                linkedin_profile_keys: count(k => k.startsWith('linkedin_') && !k.includes('_guaranteed')),
                company_enrichment_keys: count(k => k.startsWith('company_enrichment_')),
                hubspot_keys: count(k => k.startsWith('hubspot_')),
                hubspot_contact_keys: count(k => k.startsWith('hubspot_contact_')),
                hubspot_company_keys: count(k => k.startsWith('hubspot_company_')),
                hubspot_deal_keys: count(k => k.startsWith('hubspot_deal_')),
                linkedin_posts_keys: count(k => k.includes('linkedin_post_') || k.startsWith('linkedin_posts_')),
                linkedin_jobs_keys: count(k => k.includes('linkedin_jobs_') || k.startsWith('linkedin_job_')),
                sample_first_15_keys: keys.slice(0, 15)
            };
            console.log(`📦 Payload stats calculated for all plays:`, payloadStats);
            
            const scheduled: Promise<void>[] = [];
            for (const play of dataToFetch) {
                if (isResearchStopped) {
                    console.log(`🛑 Stopping execution due to research stop flag`);
                    break;
                }
                if (inFlightRef.current.has(play.name)) continue;
                inFlightRef.current.add(play.name);

                const task = (async () => {
                    console.log(`🚀 Executing research play: ${play.name}`);
                    setIsLoadingSmartVariablesFinal(true);
                    
                    // Add timeout for individual task
                    const taskTimeout = setTimeout(() => {
                        console.error(`⏰ Task timeout for ${play.name} - removing from pending`);
                        setPendingTasks((current: string[]) => current.filter((task: string) => task !== play.name));
                        inFlightRef.current.delete(play.name);
                        setSmartVariablesData((current: SmartVariablesData) => ({
                            ...current, 
                            [play.name]: "⛔️ Task timeout"
                        }));
                    }, 30000); // 30 second timeout per task
                    
                    try {
                        // ✅ OPTIMIZATION: Use pre-processed data instead of processing again

                        // ✅ OPTIMIZATION: Only run expensive debug operations in development
                        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PLAYS === 'true') {
                            // Pre-flight: detect missing variables for this play's templates using processed data
                            const missingVars = new Set<string>();
                            play.play_steps?.forEach(step => {
                                const templates = [step.system_instructions_template || '', step.user_instructions_template || ''];
                                templates.forEach(t => {
                                    const { replacedVariables } = formatString(t, processedResearchData);
                                    replacedVariables.forEach(rv => {
                                        if (rv.isOptional) return;
                                        const name = rv.name;
                                        if (name.startsWith('prompt_') || name === 'linkedin' || name === 'hubspot' || name.includes('_guaranteed')) return;
                                        const val = processedResearchData[name];
                                        const invalid = val === undefined || val === '' || val === 'nothing' || (typeof val === 'string' && val.includes('⛔️'));
                                        if (invalid) missingVars.add(name);
                                    });
                                });
                            });

                            if (missingVars.size > 0) {
                                const availableKeys = Object.keys(processedResearchData);
                                const suggestClosest = (target: string): string[] => {
                                    return availableKeys
                                        .map(k => [k, levenshteinDistance(target.toLowerCase(), k.toLowerCase())] as [string, number])
                                        .sort((a, b) => a[1] - b[1])
                                        .slice(0, 3)
                                        .map(([k]) => k);
                                };
                                const suggestions: Record<string, string[]> = {};
                                Array.from(missingVars).forEach(name => {
                                    suggestions[name] = suggestClosest(name);
                                });
                                console.log(`🔎 Pre-flight variable check for ${play.name}:`, {
                                    requiredBatches: getRequiredBatchesForPlay(play),
                                    missingVariables: Array.from(missingVars),
                                    suggestions,
                                    availableKeysSample: availableKeys.slice(0, 20),
                                    totalAvailableKeys: availableKeys.length
                                });
                            }
                        }

                        // ✅ OPTIMIZATION: Use pre-calculated payload stats instead of recalculating
                        console.log(`📦 Payload stats for ${play.name}:`, payloadStats);

                        // ✅ OPTIMIZATION: Only run expensive prompt hydration in development
                        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PLAYS === 'true') {
                            // Hydrated prompt snippets (first 200 chars) for verification
                            const hydratedSnippets: Array<{step: string; system?: string; user?: string}> = [];
                            play.play_steps?.forEach((step, idx) => {
                                const sys = step.system_instructions_template || '';
                                const usr = step.user_instructions_template || '';
                                const sysH = formatString(sys, processedResearchData).formattedString;
                                const usrH = formatString(usr, processedResearchData).formattedString;
                                hydratedSnippets.push({
                                    step: step.name || `step_${idx+1}`,
                                    system: sysH.slice(0, 200),
                                    user: usrH.slice(0, 200)
                                });
                            });
                            console.log(`🧪 Hydrated prompt check for ${play.name}:`, hydratedSnippets);
                        }

                        const res = await runSmartPlay({
                            external_data: processedResearchData,
                            persona_data: processedPersonaData,
                playId: play.id,
                        });
                        
                        // DEBUG: Log the actual API response structure
                        console.log(`🔍 API RESPONSE DEBUG for ${play.name}:`, res);
                        console.log(`🔍 Response type:`, typeof res);
                        console.log(`🔍 Response structure:`, Object.keys(res || {}));
                        
                        // Extract the actual response value (handle different response structures)
                        const pickFirstString = (arr: any[]): string | undefined => {
                            for (const v of arr) {
                                if (typeof v === 'string' && v.trim() !== '') return v;
                            }
                            return undefined;
                        };
                        
                        let responseValue: string;
                        if (Array.isArray(res)) {
                            responseValue = pickFirstString(res) ?? 'nothing';
                        } else if (res && typeof res === 'object' && 'response' in (res as any)) {
                            const v = (res as any).response;
                            responseValue = (typeof v === 'string' && v.trim() !== '') ? v : 'nothing';
                        } else if (res && typeof res === 'object' && 'value' in (res as any)) {
                            const v = (res as any).value;
                            responseValue = (typeof v === 'string' && v.trim() !== '') ? v : 'nothing';
                        } else if (typeof res === 'string') {
                            responseValue = res.trim() !== '' ? res : 'nothing';
                        } else {
                            responseValue = 'nothing';
                        }
                        
                        const next = {[play.name]: responseValue};
                        setSmartVariablesData((current: SmartVariablesData) => ({...current, ...next}));

                        // Trigger re-render for ResearchPlaysTiming component
                        setApiTimingVersion((v: number) => v + 1);

                        console.log(`✅ Research play completed: ${play.name} = ${responseValue?.slice(0, 100)}...`);
                    } catch (error) {
                console.error(`Error running play ${play.name}:`, error);
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        if (errorMessage.includes('CONNECTION_REFUSED') || 
                            errorMessage.includes('fetch') ||
                            errorMessage.includes('WebSocket')) {
                            setSmartVariablesData((current: SmartVariablesData) => ({
                                ...current, 
                                [play.name]: "⛔️ Backend connection error"
                            }));
                            
                            // Trigger re-render for ResearchPlaysTiming component
                            setApiTimingVersion((v: number) => v + 1);
                        } else {
                            setSmartVariablesData((current: SmartVariablesData) => ({
                                ...current, 
                                [play.name]: "⛔️ error"
                            }));
                        }
                        
                        // Trigger re-render for ResearchPlaysTiming component
                        setApiTimingVersion((v: number) => v + 1);
                    } finally {
                        clearTimeout(taskTimeout);
                        setPendingTasks((current: string[]) => current.filter((task: string) => task !== play.name));
                        inFlightRef.current.delete(play.name);
                    }
                })();

                scheduled.push(task);
            }

            Promise.allSettled(scheduled).finally(() => {
                setIsLoadingSmartVariablesFinal(false);
            });
        }
    }, [
        // Trigger whenever any batch completes (guaranteed variables change)
        shouldFetchData,
        isResearchStopped,                        // Stop research when stopped
        smartVariablesDataInitial.length,
        allData.linkedin_profile_guaranteed,      // Batch 1 complete
        allData.company_enrichment_guaranteed,    // Batch 2 complete  
        allData.hubspot_guaranteed,               // Batch 3 complete
        allData.linkedin_posts_guaranteed,        // Batch 4 complete
        allData.linkedin_jobs_guaranteed,         // Batch 5 complete
        // Removed Object.keys(smartVariablesData).join(',') to prevent infinite loops
        // Note: Each time a batch completes, we check ALL research plays to see which ones are now ready
    ]);



    // Actions
    const runPlay = async (numOutputsOverride?: number) => {
        console.log('🎯 runPlay called with numOutputsOverride:', numOutputsOverride);
        if (
            !selectedPlay ||
            !currentUsername ||
            !isPlayAbleToRunWithoutCustomVars(selectedPlay)
        )
            return;

        try {
            // Process all data to resolve nested variables
            const cleanedData = cleanDataForLLM(allData);
            
            // Ensure account_intel is preserved even if very long
            // Account intel can be 45,000+ characters, so we need to ensure it's not filtered out
            if (allData.account_intel && !cleanedData.account_intel) {
                // Account intel was filtered out - add it back
                cleanedData.account_intel = String(allData.account_intel);
            }
            
            const processedData = prepareDataForPlay(cleanedData);
            
            // Double-check account_intel is in processed data before sending
            if (allData.account_intel && !processedData.account_intel) {
                processedData.account_intel = String(allData.account_intel);
            }
            
            // 🎯 ENSURE MULTIPLE OUTPUTS: Add array variables to persona if not present
            // This creates multiple datasets in the backend, resulting in 3 output variations
            let enhancedPersonaData = { ...personaData };
            
            // DEBUG: Log play info first
            console.log('🔍 PLAY INFO:', {
                playName: selectedPlay.name,
                playId: selectedPlay.id,
                outputType: selectedPlay.output_type,
                playNameLower: selectedPlay.name.toLowerCase()
            });
            
            // Special handling for Account_Intel_Test - force 3 outputs by removing all other arrays
            // Check multiple variations of the name
            const playNameLower = selectedPlay.name.toLowerCase();
            const isAccountIntelTest = playNameLower.includes('account_intel_test') || 
                                      playNameLower.includes('account intel test') ||
                                      playNameLower.includes('accountinteltest') ||
                                      playNameLower === 'account intel test' ||
                                      playNameLower === 'account_intel_test';
            
            console.log('🔍 ACCOUNT INTEL TEST DETECTION:', {
                playName: selectedPlay.name,
                playNameLower: playNameLower,
                isAccountIntelTest: isAccountIntelTest,
                outputType: selectedPlay.output_type,
                isFinal: selectedPlay.output_type === 'final'
            });
            
            // Only manipulate persona_data if no override is provided (default behavior)
            // When override is provided, let the backend handle dataset count via num_outputs_override
            if (numOutputsOverride === undefined) {
                if (isAccountIntelTest && selectedPlay.output_type === 'final') {
                    console.log(`🎯🎯🎯 Account_Intel_Test detected - FORCING 3 outputs (Play: ${selectedPlay.name}, ID: ${selectedPlay.id})`);
                    console.log('🔍 Original personaData:', personaData);
                    console.log('🔍 Original personaData arrays:', Object.entries(personaData).filter(([_, v]) => Array.isArray(v)));
                    
                    // Convert ALL values to arrays with 3 identical values for proper dataset creation
                    // This ensures the backend creates exactly 3 datasets
                    const arrayPersonaData: any = {};
                    for (const [key, value] of Object.entries(enhancedPersonaData)) {
                        if (Array.isArray(value)) {
                            // Skip existing arrays - we'll override them
                            console.log(`🗑️ Removing existing array: ${key} with ${value.length} values`);
                        } else {
                            // Convert single values to arrays with 3 identical values
                            arrayPersonaData[key] = [value, value, value];
                        }
                    }
                    // Force tone array with exactly 3 DIFFERENT values - this creates variation
                    arrayPersonaData.tone = ["professional", "casual", "friendly"];
                    enhancedPersonaData = arrayPersonaData;
                    
                    console.log(`✅✅✅ Account_Intel_Test: Converted all values to arrays with 3 elements`);
                    console.log('🔍 Final enhancedPersonaData keys:', Object.keys(enhancedPersonaData));
                    console.log('🔍 Final enhancedPersonaData arrays:', Object.entries(enhancedPersonaData)
                        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : 'NOT ARRAY'}`));
                    console.log('🔍 Final tone array:', enhancedPersonaData.tone);
                } else if (selectedPlay.output_type === 'final') {
                    // For ALL other final plays, ensure tone array with 3 values (same as Cold Email)
                    const hasArrayVariables = Object.values(enhancedPersonaData).some(v => Array.isArray(v));
                    const arrayLengths = Object.values(enhancedPersonaData)
                        .filter(v => Array.isArray(v))
                        .map(v => (v as any[]).length);
                    const maxLength = arrayLengths.length > 0 ? Math.max(...arrayLengths) : 0;
                    
                    // Always ensure tone array has 3 values (this determines dataset count)
                    if (maxLength < 3 || !hasArrayVariables) {
                        console.log(`🎯 Adding tone array for 3 outputs (Play: ${selectedPlay.name}, maxLength: ${maxLength})`);
                        enhancedPersonaData.tone = ["professional", "casual", "friendly"];
                    } else {
                        console.log(`✅ Play "${selectedPlay.name}" already has array variables with ${maxLength} values - will generate multiple outputs`);
                    }
                } else {
                    console.log(`ℹ️ Play "${selectedPlay.name}" is output_type="${selectedPlay.output_type}" - will generate single output`);
                }
            } else {
                // When override is provided, flatten all arrays in persona_data to single values
                // This prevents "dead" arrays (like tone) from interfering with num_outputs_override
                console.log(`🎯 Output override provided (${numOutputsOverride}) - flattening arrays in persona_data to prevent interference`);
                
                const flattenedPersonaData: any = {};
                const arraysRemoved: string[] = [];
                
                for (const [key, value] of Object.entries(enhancedPersonaData)) {
                    if (Array.isArray(value)) {
                        // Flatten array to first element (or empty string if array is empty)
                        flattenedPersonaData[key] = value.length > 0 ? value[0] : '';
                        arraysRemoved.push(`${key} (${value.length} → 1)`);
                        console.log(`  🔧 Flattened ${key}: [${value.join(', ')}] → ${flattenedPersonaData[key]}`);
                    } else {
                        // Keep non-array values as-is
                        flattenedPersonaData[key] = value;
                    }
                }
                
                enhancedPersonaData = flattenedPersonaData;
                
                console.log(`✅ Flattened ${arraysRemoved.length} array(s) in persona_data:`, arraysRemoved);
                console.log(`📊 Backend will use num_outputs_override=${numOutputsOverride} without array interference`);
            }
            
            console.log('🎭 PERSONA DATA FOR PLAY:', {
                playName: selectedPlay.name,
                outputType: selectedPlay.output_type,
                isAccountIntelTest: isAccountIntelTest,
                hasArrays: Object.values(enhancedPersonaData).some(v => Array.isArray(v)),
                arrayVariables: Object.entries(enhancedPersonaData)
                    .filter(([_, v]) => Array.isArray(v))
                    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : 0} values`),
                willGenerate3Outputs: Object.values(enhancedPersonaData).some(v => Array.isArray(v)),
                toneArray: enhancedPersonaData.tone,
                toneArrayLength: Array.isArray(enhancedPersonaData.tone) ? enhancedPersonaData.tone.length : 0
            });
            
            // Log what we're sending to backend
            console.log('📤 SENDING TO BACKEND:', {
                playId: selectedPlay.id,
                playName: selectedPlay.name,
                numOutputsOverride: numOutputsOverride,
                personaDataKeys: Object.keys(enhancedPersonaData),
                personaDataArrays: Object.entries(enhancedPersonaData)
                    .filter(([_, v]) => Array.isArray(v))
                    .reduce((acc, [k, v]) => ({ ...acc, [k]: Array.isArray(v) ? v.length : 0 }), {}),
                expectedDatasets: numOutputsOverride !== undefined 
                    ? numOutputsOverride 
                    : Math.max(...Object.values(enhancedPersonaData)
                        .filter(v => Array.isArray(v))
                        .map(v => (v as any[]).length), 1)
            });
            
            const data = await _runPlay({
                external_data: processedData,
                persona_data: enhancedPersonaData,
                playId: selectedPlay.id,
                ...(numOutputsOverride !== undefined && { num_outputs: numOutputsOverride }),
            });

            setPlayResponses((r: PlayResponse) => ({...r, [selectedPlay.id]: data}));

            // Remove from pending tasks after successful completion
            setPendingTasks((current: string[]) => current.filter((task: string) => task !== selectedPlay.name));
        } catch (error) {
            console.error("Error running play:", error);
            // Remove from pending tasks even on error
            setPendingTasks((current: string[]) => current.filter((task: string) => task !== selectedPlay.name));
        }
    };

    const setCustomVariable = (key: string, value: string) => {
        console.log(`🔧 Setting custom variable: ${key} = "${value}"`);
        setCustomVariables((prev: CustomVariables) => {
            const newVars = {
            ...prev,
            [key]: value,
            };
            console.log(`🔧 Updated custom variables:`, newVars);
            return newVars;
        });
    };

    const refreshCRMData = () => {
        client.clear();
        attemptsRef.current = {};

        smartVariablesDataInitial
        .filter((play) => {
            return (
                !isPlayAbleToRunWithoutCustomVars(play) ||
                keysForPlay(play).some((key) => key.startsWith("hubspot_"))
            );
        })
        .forEach((k) =>
            setSmartVariablesData((data: SmartVariablesData) => {
                const copy = {...data};
                delete copy[k.name];
                return copy;
            }),
        );
    };

    // NEW: Stop research function
    const stopResearch = () => {
        console.log("🛑 STOP RESEARCH BUTTON CLICKED!");
        console.log("🛑 Current state before stop:", {
            pendingTasks: pendingTasks.length,
            isLoadingSmartVariablesFinal,
            isResearchStopped,
            executionCount: executionCount
        });
        
        setIsResearchStopped(true);
        setPendingTasks([]);
        setIsLoadingSmartVariablesFinal(false);
        attemptsRef.current = {};
        setExecutionCount(0); // Reset execution count
        inFlightRef.current.clear(); // Clear any in-flight tasks
        
        console.log("🛑 Stop research actions completed");
        
        // Reset after a short delay to allow new research to start if needed
        setTimeout(() => {
            console.log("🔄 Resetting research stop flag");
            setIsResearchStopped(false);
        }, 2000); // Increased delay to ensure complete stop
    };

    const loading =
        loadingContact ||
        loadingDeal ||
        loadingEmployees ||
        isFetchingHubspotEmployeesData ||
        loadingHubspotCompany ||
        isLinkedinProfileDataLoading ||
        isLoadingVariables ||
        isLoadingSmartVariables ||
        isLoadingResearchPlays ||
        isLoadingPlays ||
        isFetchingHubspotContactData ||
        isFetchingHubspotDealData ||
        isFetchingHubspotCompanyData ||
        // NEW: Add loading states for new data sources
        isLoadingCompanyEnrichment ||
        isLoadingLinkedInPosts ||
        isLoadingLinkedInJobs;

    const loadingUI =
        loading || isLoadingSmartVariablesFinal || isScrapingProfile || pendingTasks.length > 0;
    console.log('🔍 LoadingUI state:', {
        loading,
        isLoadingSmartVariablesFinal,
        isScrapingProfile,
        pendingTasksLength: pendingTasks.length,
        pendingTasks,
        loadingUI,
        isResearchStopped
    });
    
    // Debug: Log when tasks are stuck for too long
    useEffect(() => {
        if (pendingTasks.length > 0) {
            const stuckTimeout = setTimeout(() => {
                console.warn('⚠️ Tasks have been pending for 15+ seconds:', pendingTasks);
                console.warn('⚠️ This might indicate stuck tasks or API issues');
            }, 15000);
            
            return () => clearTimeout(stuckTimeout);
        }
    }, [pendingTasks]);

    const error =
        linkedinProfileDataError ||
        errorSmartVariables ||
        errorResearchPlays ||
        errorVariables ||
        errorPlays;

    // Filter smart variables
    const initial: Record<string, string> = {};
    smartVariablesDataInitial.forEach((play) => {
        if (play.visible) {
            initial[play.name] = play.value || ""; // Convert null to empty string
        }
    });
    const combined = {...initial, ...smartVariablesData};
    // Include ALL research plays (even empty ones) so they show in UI and can be populated
    const filteredSmartVariables = combined;

    // Debug: Log smart variables filtering
    console.log('🔍 Smart Variables Filtering Debug:', {
        initial: Object.keys(initial).length,
        smartVariablesData: Object.keys(smartVariablesData).length,
        combined: Object.keys({...initial, ...smartVariablesData}).length,
        filteredSmartVariables: Object.keys(filteredSmartVariables).length,
        smartVariablesDataEntries: Object.entries(smartVariablesData),
        filteredEntries: Object.entries(filteredSmartVariables)
    });

    // DEBUG: Show actual research data values
    console.log('🎯 ACTUAL RESEARCH DATA:', smartVariablesData);
    console.log('🎯 RESEARCH DATA KEYS:', Object.keys(smartVariablesData));
    Object.entries(smartVariablesData).forEach(([name, value]) => {
        console.log(`🎯 ${name}:`, String(value || '').slice(0, 100) + '...');
    });

    const totalResearchPlays = smartVariablesDataInitial.filter(play => play.visible && play.output_type === 'variable').length;
    const completedResearchPlays = Object.keys(smartVariablesData).filter(key => {
        const value = smartVariablesData[key];
        return value && value !== "" && value !== "nothing" && !value.includes("⛔️");
    }).length;

    // Dynamic completable research plays count - only count plays that can actually run
    const completableResearchPlays = useMemo(() => {
        return smartVariablesDataInitial.filter(play => 
            play.visible && 
            play.output_type === 'variable' && 
            isPlayAbleToRunWithoutCustomVars(play)
        ).length;
    }, [smartVariablesDataInitial, isPlayAbleToRunWithoutCustomVars]);

    return {
        selectedPlay,
        setSelectedPlay,
        playResponses,
        autoRun,
        setAutoRun,
        currentUsername,
        showCopiedOnIndex,
        setShowCopiedOnIndex,
        linkedInProfile,
        didDoResearch: !isLinkedinProfileDataLoading,
        fetchLinkedInProfileData,
        plays,
        detectedPersonaName,
        allData,
        personaData,
        isPlayAbleToRunWithoutCustomVars,
        keysForPlay,
        runPlay,
        setCustomVariable,
        refreshCRMData,
        stopResearch,
        loading,
        loadingUI,
        error,
        runError,
        isLoadingRun,
        filteredSmartVariables,
        rawResearchPlays: smartVariablesDataInitial.map(play => {
            const currentValue = smartVariablesData[play.name] || "";
            const isPending = pendingTasks.includes(play.name);
            
            // Check for any error indicators (more comprehensive)
            const hasError = currentValue === "⛔️ error" || 
                           currentValue === "⛔️ Backend connection error" ||
                           currentValue === "⛔️ Task timeout" ||
                           currentValue.includes("⛔️") ||
                           currentValue.toLowerCase() === "nothing";
            
            const isComplete = currentValue && currentValue !== "" && !hasError;
            
            let status: 'ready' | 'loading' | 'complete' | 'error' = 'ready';
            if (isPending) status = 'loading';
            else if (hasError) status = 'error';
            else if (isComplete) status = 'complete';
            
            return {
                name: play.name,
                value: currentValue,
                status,
                requiredVariables: play.play_steps ? keysForPlay(play) : []
            };
        }),
        profile,
        isScrapingProfile,
        linkedInProfileFromEmail,
        hasManuallyResearched,
        setHasManuallyResearched,
        pendingTasks,
        totalTasksInitiated,
        totalResearchPlays,
        completedResearchPlays,
        completableResearchPlays,
        apiCompletionStates,
        dataLoadingStates,
        extractedEmailFromHubSpot,
        // Debug modal state
        showDebugModal,
        setShowDebugModal,
        // Streaming states
        isPlayStreaming,
        playStreamingError,
        isSmartVariablesStreaming,
        smartVariablesStreamingError,
        // First run state for API completion bubbles
        isFirstRun,
        // Account intel data
        accountIntel: allData.account_intel,
        accountIntelAttemptedNoData: !!orgChartMatch && !orgChartMatch.accountIntel, // True if match exists but no account intel
        companyName: allData.org_chart_company_name || companyName,
        orgChartMatchType: allData.org_chart_match_type,
        orgChartMatchConfidence: allData.org_chart_confidence ? parseFloat(allData.org_chart_confidence) : undefined,
        // Persona prompts for debug modal
        personaPrompts,
    };
}