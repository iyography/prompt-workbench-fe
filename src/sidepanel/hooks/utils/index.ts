/**
 * Utility functions for useExecuteView hook.
 * Extracted for maintainability and reusability.
 */

// Data extraction utilities
export {
    extractCompanyName,
    extractCompanyIdFromProfile,
    flattenCompanyEnrichmentData,
    flattenLinkedInPostsData,
    flattenLinkedInJobsData,
} from './dataExtraction';

// Data validation utilities
export {
    isValidProfileData,
    isValidCompanyData,
    isValidHubspotData,
    isValidApifyData,
    isValidAccountIntelData,
    normalizeCompanyName,
    isFuzzyMatch,
    cleanDataForLLM,
    cleanPersonaData,
} from './dataValidation';
