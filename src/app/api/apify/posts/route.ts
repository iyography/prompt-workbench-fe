import { NextRequest, NextResponse } from 'next/server';
import { cacheKeyFromParts, getCache, setCache } from '../cache';

// Apify configuration - use environment variable only
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_POSTS_ACTOR = 'apimaestro~linkedin-profile-posts';
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
        const { profileUrl, maxPosts } = body;

        console.log('🔍 LinkedIn Profile Posts Scraper API called with:', {
            profileUrl,
            maxPosts
        });

        if (!profileUrl) {
            const origin = request.headers.get('origin');
            return NextResponse.json(
                { success: false, error: 'profileUrl is required' },
                { status: 400, headers: getCorsHeaders(origin) }
            );
        }

        // Extract username from profile URL
        const usernameMatch = profileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
        if (!usernameMatch) {
            const origin = request.headers.get('origin');
            return NextResponse.json(
                { success: false, error: 'Invalid LinkedIn profile URL' },
                { status: 400, headers: getCorsHeaders(origin) }
            );
        }

        const username = usernameMatch[1];

        // Cache: return cached result if present
        const cacheKey = cacheKeyFromParts({ type: 'posts', profileUrl, maxPosts: maxPosts || 5 });
        const cached = getCache<{ success: boolean; data: any[]; runId?: string; profileUrl: string }>(cacheKey);
        if (cached) {
            const origin = request.headers.get('origin');
            return NextResponse.json(cached, { headers: getCorsHeaders(origin) });
        }

        // Prepare the Actor input based on documentation
        const runInput = {
            username: username,
            page_number: 1,
            limit: maxPosts || 5
        };

        console.log('📝 Using input:', runInput);

        // First, let's check if the actor exists
        const actorCheckResponse = await fetch(`https://api.apify.com/v2/acts/${APIFY_POSTS_ACTOR}?token=${APIFY_API_TOKEN}`);
        
        if (!actorCheckResponse.ok) {
            console.warn(`⚠️ Actor ${APIFY_POSTS_ACTOR} not found.`);
            return NextResponse.json(
                { success: false, error: `Actor ${APIFY_POSTS_ACTOR} not found` },
                { status: 404 }
            );
        }

        // Run the Actor asynchronously
        const runResponse = await fetch(`https://api.apify.com/v2/acts/${APIFY_POSTS_ACTOR}/runs?token=${APIFY_API_TOKEN}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(runInput),
        });

        console.log('🔍 Apify response status:', runResponse.status);

        if (!runResponse.ok) {
            const errorText = await runResponse.text();
            console.warn(`⚠️ Apify Posts API failed: ${runResponse.statusText}. Error: ${errorText}.`);
            return NextResponse.json(
                { success: false, error: `Apify Posts API failed: ${runResponse.statusText}. Error: ${errorText}.` },
                { status: 500 }
            );
        }

        const runData = await runResponse.json();
        console.log('✅ Apify posts run started:', runData);

        // Wait for the run to complete and get results
        const datasetId = runData.data.defaultDatasetId;
        const runId = runData.data.id;
        
        // Wait for the run to complete (max 120 seconds)
        let attempts = 0;
        const maxAttempts = 24; // 24 attempts * 5 seconds = 120 seconds
        
        while (attempts < maxAttempts) {
            // Check run status
            const statusResponse = await fetch(`https://api.apify.com/v2/acts/${APIFY_POSTS_ACTOR}/runs/${runId}?token=${APIFY_API_TOKEN}`);
            
            if (!statusResponse.ok) {
                throw new Error(`Failed to check run status: ${statusResponse.statusText}`);
            }
            
            const statusData = await statusResponse.json();
            console.log(`🔄 Run status (attempt ${attempts + 1}):`, statusData.data.status);
            
            if (statusData.data.status === 'SUCCEEDED') {
                break;
            } else if (statusData.data.status === 'FAILED' || statusData.data.status === 'ABORTED') {
                throw new Error(`Run failed with status: ${statusData.data.status}`);
            }
            
            // Wait 5 seconds before next check
            await new Promise(resolve => setTimeout(resolve, 5000));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            throw new Error('Run timed out after 120 seconds');
        }
        
        // Get the results from the dataset
        const resultsResponse = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_API_TOKEN}`);
        
        if (!resultsResponse.ok) {
            throw new Error(`Failed to fetch results: ${resultsResponse.statusText}`);
        }

        const results = await resultsResponse.json();
        
        console.log(`📊 Found ${results.length} posts for profile`);

        const payload = {
            success: true,
            data: results,
            runId: runData.data?.id || 'sync-run',
            profileUrl: profileUrl
        };
        setCache(cacheKey, payload, TWO_DAYS_MS);
        return NextResponse.json(payload);

    } catch (error) {
        console.error('❌ LinkedIn Profile Posts Scraper API error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
}

export async function GET() {
    return NextResponse.json({
        message: 'LinkedIn Profile Posts Scraper API endpoint',
        usage: 'POST with profileUrl and optional maxPosts'
    });
} 