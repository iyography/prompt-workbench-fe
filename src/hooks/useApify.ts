import { useQuery, useMutation } from '@tanstack/react-query';

// Get the frontend API URL for extension context
const FRONTEND_API_URL = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.PLASMO_PUBLIC_FRONTEND_URL || 'http://localhost:3000';

// Types for Apify data
export interface LinkedInJob {
    id: string;
    title: string;
    company: string;
    location: string;
    description: string;
    url: string;
    postedDate?: string;
    jobType?: string;
    experienceLevel?: string;
}

export interface LinkedInPost {
    urn: string;
    full_urn: string;
    posted_at: {
        date: string;
        relative: string;
        timestamp: number;
    };
    text: string;
    url: string;
    post_type: string;
    author: {
        first_name: string;
        last_name: string;
        headline: string;
        username: string;
        profile_url: string;
        profile_picture?: string;
    };
    stats: {
        total_reactions: number;
        like: number;
        support: number;
        love: number;
        insight: number;
        celebrate: number;
        comments: number;
        reposts: number;
    };
    job_data?: {
        id: string;
        title: string;
        company: string;
        location: string;
        url: string;
        company_logo: string;
    };
    media?: {
        type: string;
        url: string;
        thumbnail: string;
    };
    pagination_token: string;
}

// Hook for LinkedIn Jobs Scraper
export const useLinkedInJobs = (
    searchParams: {
        searchQuery?: string;
        location?: string;
        jobType?: string;
        experienceLevel?: string;
        verifiedCompanyName?: string; // REQUIRED: Verified company name from Company Enrichment
        linkedInCompanyId?: string; // Optional: LinkedIn company ID for more accurate filtering
    },
    options?: {
        enabled?: boolean;
    }
) => {
    return useQuery({
        queryKey: ['apify', 'jobs', searchParams],
        queryFn: async () => {
            const response = await fetch(`${FRONTEND_API_URL}/api/apify/jobs`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(searchParams),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch LinkedIn jobs');
            }

            const data = await response.json();
            return data;
        },
        enabled: options?.enabled ?? true,
    });
};

// Hook for LinkedIn Profile Posts Scraper
export const useLinkedInPosts = (
    profileUrl: string,
    maxPosts: number = 10,
    options?: {
        enabled?: boolean;
    }
) => {
    return useQuery({
        queryKey: ['apify', 'posts', profileUrl, maxPosts],
        queryFn: async () => {
            const response = await fetch(`${FRONTEND_API_URL}/api/apify/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    profileUrl,
                    maxPosts,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch LinkedIn posts');
            }

            const data = await response.json();
            return data;
        },
        enabled: options?.enabled ?? !!profileUrl,
    });
};

// // Mutation hook for triggering job searches
// export const useSearchLinkedInJobs = () => {
//     return useMutation({
//         mutationFn: async (searchParams: {
//             searchQuery: string;
//             location?: string;
//             jobType?: string;
//             experienceLevel?: string;
//         }) => {
//             const response = await fetch(`${FRONTEND_API_URL}/api/apify/jobs`, {
//                 method: 'POST',
//                 headers: {
//                     'Content-Type': 'application/json',
//                 },
//                 body: JSON.stringify(searchParams),
//             });

//             if (!response.ok) {
//                 throw new Error('Failed to search LinkedIn jobs');
//             }

//             return response.json();
//         },
//     });
// };

// Mutation hook for triggering post scraping
export const useScrapeLinkedInPosts = () => {
    return useMutation({
        mutationFn: async (params: {
            profileUrl: string;
            maxPosts?: number;
        }) => {
            const response = await fetch(`${FRONTEND_API_URL}/api/apify/posts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params),
            });

            if (!response.ok) {
                throw new Error('Failed to scrape LinkedIn posts');
            }

            return response.json();
        },
    });
}; 