import React, { useEffect } from 'react';
import { useLinkedInJobs } from '../../hooks/useApify';
import { DictionaryTable } from '../common/DictionaryTable';

interface LinkedInJobsProps {
    searchQuery: string;
    location?: string;
    jobType?: string;
    experienceLevel?: string;
    maxJobs?: number;
    enabled?: boolean;
    verifiedCompanyName?: string; // REQUIRED: Verified company name from Company Enrichment
    linkedInCompanyId?: string; // REQUIRED: LinkedIn company ID for accurate filtering
    onDataUpdate?: (data: Record<string, string>) => void;
}

export const LinkedInJobs: React.FC<LinkedInJobsProps> = ({
    searchQuery,
    location = 'United States',
    jobType = 'full-time',
    experienceLevel = 'mid-senior',
    maxJobs = 5, // Default to 5 jobs for faster performance
    enabled = true,
    verifiedCompanyName,
    linkedInCompanyId,
    onDataUpdate
}) => {
    // Debug: Log component props and state
    // Disable if no verifiedCompanyName is provided
    const isEnabled = enabled && !!verifiedCompanyName;

    const {
        data,
        isLoading,
        error,
        refetch
    } = useLinkedInJobs({
        searchQuery,
        location,
        jobType,
        experienceLevel,
        verifiedCompanyName,
        linkedInCompanyId
    }, { enabled: isEnabled });

    // Update parent component with jobs data for plays
    useEffect(() => {
        if (onDataUpdate && data?.data) {
            const displayedJobs = Math.min(maxJobs, data.data.length);
            const vars: Record<string, string> = {
                linkedin_jobs_count: displayedJobs.toString(),
                linkedin_jobs_company: searchQuery,
                linkedin_jobs_search_query: searchQuery
            };
            const titles: string[] = [];
            const titleDetails: string[] = [];
            const postingsAll: string[] = [];
            for (let i = 0; i < displayedJobs; i++) {
                const job = data.data[i];
                const idx = i + 1;
                vars[`linkedin_jobs_${idx}_title`] = job.title || '';
                vars[`linkedin_jobs_${idx}_company`] = (job as any).company?.name || (job as any).company || '';
                vars[`linkedin_jobs_${idx}_location`] = (job as any).location?.linkedinText || (job as any).location?.parsed?.text || (job as any).location || '';
                vars[`linkedin_jobs_${idx}_url`] = (job as any).linkedinUrl || (job as any).url || '';
                vars[`linkedin_jobs_${idx}_posted_date`] = (job as any).postedDate ? new Date((job as any).postedDate).toLocaleDateString() : '';
                vars[`linkedin_jobs_${idx}_employment_type`] = (job as any).employmentType || '';
                vars[`linkedin_jobs_${idx}_experience_level`] = (job as any).experienceLevel || '';
                vars[`linkedin_jobs_${idx}_description`] = (job as any).description || '';
                if (job.title) titles.push(job.title);
                const detail = `${job.title || ''}${(job as any).description ? ' - ' + (job as any).description : ''}`.trim();
                if (detail) titleDetails.push(detail);
                const posting = [
                    `Title: ${job.title || ''}`,
                    `Company: ${(job as any).company?.name || (job as any).company || ''}`,
                    `Location: ${(job as any).location?.linkedinText || (job as any).location?.parsed?.text || (job as any).location || ''}`,
                    `URL: ${(job as any).linkedinUrl || (job as any).url || ''}`,
                    `Description: ${(job as any).description || ''}`
                ].join("\n");
                postingsAll.push(posting.trim());
            }
            if (displayedJobs > 0) {
                vars[`linkedin_jobs_latest_title`] = vars[`linkedin_jobs_1_title`];
                vars[`linkedin_jobs_latest_company`] = vars[`linkedin_jobs_1_company`];
                vars[`linkedin_jobs_latest_location`] = vars[`linkedin_jobs_1_location`];
                vars[`linkedin_jobs_latest_url`] = vars[`linkedin_jobs_1_url`];
            }
            // Aggregated variables
            vars["all_job_titles"] = titles.join("\n");
            vars["all_job_title_details"] = titleDetails.join("\n\n");
            vars["job_postings_all"] = postingsAll.join("\n\n");
            onDataUpdate(vars);
        }
    }, [data, onDataUpdate, searchQuery, maxJobs]);

    if (!enabled || !searchQuery) return null;

    // Show error if no verifiedCompanyName is provided
    if (!verifiedCompanyName) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium text-orange-600">
                    💼 LinkedIn Jobs (Company Name Required)
                </summary>
                <div className="mt-2">
                    <p className="text-orange-600">
                        Verified company name is required for job search. Please ensure Company Enrichment data is available first.
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                        Search Query: "{searchQuery}"
                    </p>
                </div>
            </details>
        );
    }

    if (isLoading) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium">
                    💼 LinkedIn Jobs (Loading...)
                </summary>
                <div className="mt-2">
                    <div className="animate-pulse">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                </div>
            </details>
        );
    }

    if (error) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium text-red-600">
                    💼 LinkedIn Jobs (Error)
                </summary>
                <div className="mt-2">
                    <p className="text-red-600">{error.message}</p>
                    <button 
                        onClick={() => refetch()}
                        className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
                    >
                        Retry
                    </button>
                </div>
            </details>
        );
    }

    if (!data?.data || data.data.length === 0) {
        return (
            <details className="mt-4">
                <summary className="cursor-pointer font-medium text-yellow-600">
                    💼 LinkedIn Jobs (No jobs found)
                </summary>
                <div className="mt-2">
                    <p className="text-yellow-600">No jobs found for "{searchQuery}" in {location}</p>
                </div>
            </details>
        );
    }

    // Convert jobs data to table format using underscore_case variable keys
    const jobsTableData = (() => {
        const displayedJobs = Math.min(maxJobs, data.data.length);
        const vars: Record<string, string> = {
            linkedin_jobs_count: displayedJobs.toString(),
            linkedin_jobs_company: searchQuery,
            linkedin_jobs_search_query: searchQuery
        };
        const titles: string[] = [];
        const titleDetails: string[] = [];
        const postingsAll: string[] = [];
        for (let i = 0; i < displayedJobs; i++) {
            const job = data.data[i];
            const idx = i + 1;
            vars[`linkedin_jobs_${idx}_title`] = job.title || '';
            vars[`linkedin_jobs_${idx}_company`] = (job as any).company?.name || (job as any).company || '';
            vars[`linkedin_jobs_${idx}_location`] = (job as any).location?.linkedinText || (job as any).location?.parsed?.text || (job as any).location || '';
            vars[`linkedin_jobs_${idx}_url`] = (job as any).linkedinUrl || (job as any).url || '';
            vars[`linkedin_jobs_${idx}_posted_date`] = (job as any).postedDate ? new Date((job as any).postedDate).toLocaleDateString() : '';
            vars[`linkedin_jobs_${idx}_employment_type`] = (job as any).employmentType || '';
            vars[`linkedin_jobs_${idx}_experience_level`] = (job as any).experienceLevel || '';
            vars[`linkedin_jobs_${idx}_description`] = (job as any).description || '';
            if (job.title) titles.push(job.title);
            const detail = `${job.title || ''}${(job as any).description ? ' - ' + (job as any).description : ''}`.trim();
            if (detail) titleDetails.push(detail);
            const posting = [
                `Title: ${job.title || ''}`,
                `Company: ${(job as any).company?.name || (job as any).company || ''}`,
                `Location: ${(job as any).location?.linkedinText || (job as any).location?.parsed?.text || (job as any).location || ''}`,
                `URL: ${(job as any).linkedinUrl || (job as any).url || ''}`,
                `Description: ${(job as any).description || ''}`
            ].join("\n");
            postingsAll.push(posting.trim());
        }
        if (displayedJobs > 0) {
            vars[`linkedin_jobs_latest_title`] = vars[`linkedin_jobs_1_title`];
            vars[`linkedin_jobs_latest_company`] = vars[`linkedin_jobs_1_company`];
            vars[`linkedin_jobs_latest_location`] = vars[`linkedin_jobs_1_location`];
            vars[`linkedin_jobs_latest_url`] = vars[`linkedin_jobs_1_url`];
        }
        vars["all_job_titles"] = titles.join("\n");
        vars["all_job_title_details"] = titleDetails.join("\n\n");
        vars["job_postings_all"] = postingsAll.join("\n\n");
        return vars;
    })();

    // Get total count from API response or use data length
    const totalJobsFound = data.total || data.data.length;
    const displayedJobs = Math.min(maxJobs, data.data.length);
    
    return (
        <details className="mt-4">
            <summary className="cursor-pointer font-medium">
                💼 LinkedIn Jobs ({displayedJobs} found for "{searchQuery}")
            </summary>
            <div className="mt-2">
                <DictionaryTable data={jobsTableData} />
                {totalJobsFound > displayedJobs && (
                    <p className="text-xs text-gray-500 mt-2">
                        Showing most recent {displayedJobs} of {totalJobsFound} jobs
                    </p>
                )}
            </div>
        </details>
    );
}; 