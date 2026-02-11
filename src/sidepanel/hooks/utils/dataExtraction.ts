/**
 * Data extraction utilities for useExecuteView hook.
 * Extracted for maintainability and reusability.
 */

/**
 * Extract company name from LinkedIn profile data.
 * Priority order:
 * 1. active_experience_company_name
 * 2. Experience array (current job)
 * 3. Headline parsing ("Role at Company")
 * 4. Generic company fields
 */
export function extractCompanyName(profileData: any): string | undefined {
    if (!profileData) return undefined;

    // PRIORITY 1: active_experience_company_name (most reliable for current company)
    if (profileData.active_experience_company_name) {
        return String(profileData.active_experience_company_name);
    }

    // PRIORITY 2: Experience array - find current job
    let experienceArray = profileData.experience;

    if (experienceArray && typeof experienceArray === 'string') {
        try {
            experienceArray = JSON.parse(experienceArray);
        } catch (e) {
            // Failed to parse experience array
        }
    }

    if (Array.isArray(experienceArray) && experienceArray.length > 0) {
        const currentExp = experienceArray.find((e: any) => e?.is_current === true || e?.current === true);

        if (currentExp) {
            const currentCompanyName = currentExp.company_name || currentExp.company || currentExp.companyName;
            if (currentCompanyName) {
                return String(currentCompanyName);
            }
        }

        // Fallback to first experience (most recent)
        const firstExp = experienceArray[experienceArray.length - 1];
        const firstCompanyName = firstExp?.company_name || firstExp?.company || firstExp?.companyName;
        if (firstCompanyName) {
            return String(firstCompanyName);
        }
    }

    // PRIORITY 3: Headline parsing "Role at Company"
    if (profileData.headline && typeof profileData.headline === 'string') {
        const headline = profileData.headline;
        const atIndex = headline.indexOf(' at ');
        if (atIndex !== -1) {
            return headline.substring(atIndex + 4).trim();
        }
    }

    // PRIORITY 4: Fallback to generic company fields
    const fallbackCandidates = [
        profileData.company,
        profileData.companyName,
        profileData.company_name,
    ].filter(Boolean);

    if (fallbackCandidates.length > 0) {
        return String(fallbackCandidates[0]);
    }

    return undefined;
}

/**
 * Extract company ID from LinkedIn profile data for Company Enrichment.
 */
export function extractCompanyIdFromProfile(profileData: any): string | undefined {
    if (!profileData) return undefined;

    // PRIORITY 1: active_experience_company_id
    if (profileData.active_experience_company_id) {
        return String(profileData.active_experience_company_id);
    }

    // PRIORITY 2: Experience array - find current job's company ID
    let experienceArray = profileData.experience;

    if (experienceArray && typeof experienceArray === 'string') {
        try {
            experienceArray = JSON.parse(experienceArray);
        } catch (e) {
            // Failed to parse experience array
        }
    }

    if (Array.isArray(experienceArray) && experienceArray.length > 0) {
        const currentExp = experienceArray.find((e: any) => e?.is_current === true || e?.current === true);

        if (currentExp && currentExp.company_id) {
            return String(currentExp.company_id);
        }

        // Fallback to first experience (most recent)
        const firstExp = experienceArray[experienceArray.length - 1];
        if (firstExp && firstExp.company_id) {
            return String(firstExp.company_id);
        }
    }

    return undefined;
}

/**
 * Flatten Company Enrichment data for variable interpolation.
 */
export function flattenCompanyEnrichmentData(enrichmentData: any): Record<string, string> {
    const flattened: Record<string, string> = {};

    if (!enrichmentData?.data) return flattened;

    const data = enrichmentData.data;

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

/**
 * Flatten LinkedIn Posts data for variable interpolation.
 */
export function flattenLinkedInPostsData(postsData: any): Record<string, string> {
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

/**
 * Flatten LinkedIn Jobs data for variable interpolation.
 */
export function flattenLinkedInJobsData(jobsData: any): Record<string, string> {
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
