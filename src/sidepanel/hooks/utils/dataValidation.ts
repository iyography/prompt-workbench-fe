/**
 * Data validation utilities for useExecuteView hook.
 * Used to check if data sources have valid, usable data.
 */

/**
 * Check if LinkedIn profile data is valid.
 */
export function isValidProfileData(profile: any): boolean {
    return !!(profile?.profile_data && Object.keys(profile.profile_data).length > 0);
}

/**
 * Check if company enrichment data contains valid values.
 */
export function isValidCompanyData(data: Record<string, string>): boolean {
    const companyKeys = Object.keys(data).filter(k => k.startsWith('company_enrichment_'));
    return companyKeys.some(key =>
        data[key] &&
        data[key] !== 'loading' &&
        data[key] !== 'no_data' &&
        data[key].trim() !== ''
    );
}

/**
 * Check if HubSpot data contains valid values.
 */
export function isValidHubspotData(data: Record<string, string>): boolean {
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

/**
 * Check if Apify (LinkedIn posts/jobs) data contains valid values.
 */
export function isValidApifyData(data: Record<string, string>): boolean {
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

/**
 * Check if account intel data contains valid values.
 */
export function isValidAccountIntelData(data: Record<string, string>): boolean {
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

/**
 * Normalize company name for comparison (lowercase, trim, remove common suffixes).
 */
export function normalizeCompanyName(name?: string): string {
    if (!name) return '';
    return name
        .toLowerCase()
        .trim()
        .replace(/,?\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|limited|company|co\.?)$/i, '')
        .trim();
}

/**
 * Check if two company names are a fuzzy match (within edit distance of 3).
 */
export function isFuzzyMatch(a?: string, b?: string): boolean {
    if (!a || !b) return false;
    const normalizedA = normalizeCompanyName(a);
    const normalizedB = normalizeCompanyName(b);
    if (normalizedA === normalizedB) return true;
    if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) return true;
    // Dynamic import would be needed for levenshteinDistance
    // For now, just do substring matching
    return false;
}

/**
 * Clean data object for LLM consumption - removes null/empty values.
 */
export function cleanDataForLLM(data: Record<string, any>): Record<string, string> {
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
}

/**
 * Clean persona data for LLM consumption.
 */
export function cleanPersonaData(data: Record<string, any>): Record<string, string> {
    if (!data || typeof data !== 'object') return {};
    const result: Record<string, string> = {};
    Object.entries(data).forEach(([key, val]) => {
        if (val == null) return;
        if (typeof val === 'string') {
            const s = val.trim();
            if (s && s !== 'nothing' && !s.includes('⛔️')) result[key] = s;
        }
    });
    return result;
}
