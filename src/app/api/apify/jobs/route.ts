import { NextRequest, NextResponse } from 'next/server';
import { cacheKeyFromParts, getCache, setCache } from '../cache';

// Apify configuration - use environment variable only
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_JOBS_ACTOR_ID = 'RIGGeqD6RqKmlVoQU'; // Correct actor ID from actId field
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;

// CORS headers helper
function getCorsHeaders(origin?: string | null) {
    return {
        'Access-Control-Allow-Origin': origin || '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
    };
}

// Handle preflight OPTIONS requests
export async function OPTIONS(request: NextRequest) {
    const origin = request.headers.get('origin');
    return NextResponse.json({}, { headers: getCorsHeaders(origin) });
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { searchQuery, location, verifiedCompanyName, linkedInCompanyId } = body;

        console.log('🔍 LinkedIn Jobs API called with NEW ACTOR:', {
            actor: APIFY_JOBS_ACTOR_ID,
            searchQuery,
            location,
            verifiedCompanyName,
            linkedInCompanyId
        });

        // Prefer LinkedIn company ID for accurate filtering, but allow fallback to name
        if (!linkedInCompanyId && !verifiedCompanyName) {
            const origin = request.headers.get('origin');
            return NextResponse.json(
                { 
                    success: false, 
                    error: 'Either linkedInCompanyId or verifiedCompanyName is required',
                    message: 'Need company information for job filtering.',
                    searchQuery
                },
                { status: 400, headers: getCorsHeaders(origin) }
            );
        }

        console.log('✅ Using verified company name from Company Enrichment:', verifiedCompanyName);
        if (linkedInCompanyId) {
            console.log('✅ Using LinkedIn company ID for more accurate filtering:', linkedInCompanyId);
        }

        // Parse job titles from search query if it contains "at" pattern
        let jobTitles = '';
        const atPattern = /^(.+?)\s+at\s+(.+)$/i;
        const atMatch = searchQuery?.match(atPattern);
        
        if (atMatch) {
            jobTitles = atMatch[1].trim();
            console.log('🎯 Parsed job titles from search query:', jobTitles);
        } else if (searchQuery) {
            jobTitles = searchQuery.trim();
            console.log('🎯 Using full search query as job titles:', jobTitles);
        }
        
        // Cache key
        const cacheKey = cacheKeyFromParts({ 
            type: 'jobs', 
            actor: APIFY_JOBS_ACTOR_ID,
            searchQuery, 
            linkedInCompanyId,
            location: location || 'united states'
        });
        
        const cached = getCache<{ success: boolean; data: any[]; runId?: string; actor?: string }>(cacheKey);
        if (cached) {
            console.log('🚀 Returning cached result');
            const origin = request.headers.get('origin');
            return NextResponse.json(cached, { headers: getCorsHeaders(origin) });
        }

        // Prepare the Actor input for new actor (XxYw8aWQ8Kq0dvFb6)
        // Format: { "companyName": ["Google"], "limit": 5, "location": "united states", "title": "software engineer" }
        const targetLocation = (location || 'united states').toLowerCase();
        
        const runInput: any = {
            companyName: [verifiedCompanyName], // Array format required by new actor
            limit: 5, // Max 5 jobs
            location: targetLocation,
        };
        
        // Add title if we have job titles from user settings
        // Extract FIRST job title only (actor expects single title, not comma-separated list)
        if (jobTitles) {
            const firstJobTitle = jobTitles.split(',')[0].trim();
            runInput.title = firstJobTitle;
            console.log('🎯 Using FIRST job title from user settings:', firstJobTitle, '(from:', jobTitles, ')');
        }

        console.log('🎯 NEW ACTOR Input:', {
            actor: APIFY_JOBS_ACTOR_ID,
            companyName: runInput.companyName,
            title: runInput.title || '(all jobs at company)',
            location: runInput.location,
            limit: runInput.limit
        });

        let datasetId: string;
        let runId: string;
        
        try {
            console.log('🚀 Starting Apify run with NEW ACTOR...');
            
            const response = await fetch(`https://api.apify.com/v2/acts/${APIFY_JOBS_ACTOR_ID}/runs?token=${APIFY_API_TOKEN}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(runInput)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Apify API error:', errorText);
                throw new Error(`Apify API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            console.log('✅ Apify run started:', data.data?.id);
            
            datasetId = data.data.defaultDatasetId;
            runId = data.data.id;
            
            // Wait for completion
            let attempts = 0;
            const maxAttempts = 25; // 50 seconds max (before Vercel timeout)
            const checkInterval = 2000; // 2 seconds
            
            let runStatus = data.data;
            
            while (attempts < maxAttempts) {
                attempts++;
                console.log(`🔍 Check ${attempts}/${maxAttempts}: ${runStatus.status}`);
                
                if (runStatus.status === 'SUCCEEDED') {
                    console.log('✅ Run completed successfully');
                    break;
                } else if (runStatus.status === 'FAILED' || runStatus.status === 'ABORTED') {
                    throw new Error(`Run ${runStatus.status.toLowerCase()}`);
                }
                
                // Wait before next check
                await new Promise(resolve => setTimeout(resolve, checkInterval));
                
                // Get updated status
                const statusResponse = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${APIFY_API_TOKEN}`);
                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    runStatus = statusData.data;
                }
            }

            if (runStatus.status !== 'SUCCEEDED') {
                throw new Error('Run timed out');
            }

        } catch (error) {
            console.error('❌ Error running Apify actor:', error);
            const origin = request.headers.get('origin');
            return NextResponse.json(
                { 
                    success: false,
                    error: 'Failed to run LinkedIn jobs scraper', 
                    details: (error as Error).message 
                },
                { status: 500, headers: getCorsHeaders(origin) }
            );
        }
        
        // Get results from dataset
        console.log('📊 Fetching results from dataset...');
        const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`);
        
        if (!resultsResponse.ok) {
            throw new Error(`Failed to fetch results: ${resultsResponse.status}`);
        }

        const allResults = await resultsResponse.json();
        console.log(`📊 Retrieved ${allResults.length} jobs from Apify for "${verifiedCompanyName}"`);
        
        // Debug: Log first job structure to see actual field names
        if (allResults.length > 0) {
            console.log('🔍 DEBUG: First job structure:', allResults[0]);
        }
        
        // The new actor already filters by company, so we just need to map the results
        const mappedResults = allResults.map((job: any) => ({
            title: job.title || job.jobTitle,
            company: job.company || job.companyName || verifiedCompanyName,
            companyUrl: job.companyUrl || job.company_url,
            location: job.location || job.jobLocation,
            url: job.url || job.jobUrl || job.link,
            linkedinUrl: job.url || job.jobUrl || job.link,
            postedTime: job.postedTime || job.posted_time || job.postedDate,
            publishedAt: job.publishedAt || job.published_at,
            salary: job.salary,
            applicantCount: job.applicantCount || job.applicant_count,
            contractType: job.contractType || job.contract_type || job.employmentType,
            workType: job.workType || job.work_type,
            experienceLevel: job.experienceLevel || job.experience_level || job.seniorityLevel,
            sector: job.sector || job.industry,
            description: job.description || job.jobDescription,
            descriptionText: job.description || job.jobDescription
        }));
        
        console.log(`✅ Returning ${mappedResults.length} jobs`);

        const resultData = {
            success: true,
            data: mappedResults,
            total: allResults.length,
            returned: mappedResults.length,
            actor: APIFY_JOBS_ACTOR_ID,
            runId,
            searchParams: {
                jobTitles,
                company: verifiedCompanyName,
                location: targetLocation
            }
        };
        
        // Cache successful results
        if (mappedResults.length > 0) {
            setCache(cacheKey, resultData, TWO_DAYS_MS);
        }
        
        // Add CORS headers
        const origin = request.headers.get('origin');
        return NextResponse.json(resultData, { headers: getCorsHeaders(origin) });

    } catch (error) {
        console.error('❌ LinkedIn Jobs API error:', error);
        const origin = request.headers.get('origin');
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { headers: getCorsHeaders(origin) });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'LinkedIn Jobs API - Using new actor (RIGGeqD6RqKmlVoQU)',
        usage: 'POST with searchQuery, location, verifiedCompanyName',
        actor: APIFY_JOBS_ACTOR_ID
    });
}
