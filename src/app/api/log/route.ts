import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        // Check if request has a body before trying to parse
        const contentType = request.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            return NextResponse.json({ success: false, error: 'Invalid content type' }, { status: 400 });
        }

        // Safely parse JSON - handle empty body
        let body;
        try {
            const text = await request.text();
            if (!text || text.trim() === '') {
                return NextResponse.json({ success: false, error: 'Empty request body' }, { status: 400 });
            }
            body = JSON.parse(text);
        } catch (parseError) {
            return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
        }

        const { message, data } = body;
        
        // Log to server console (terminal)
        // Add a marker to identify these logs
        if (data) {
            console.log('[TERMINAL LOG]', message, JSON.stringify(data, null, 2));
        } else {
            console.log('[TERMINAL LOG]', message);
        }
        
        return NextResponse.json({ success: true });
    } catch (error) {
        // Even if logging fails, don't break the app
        console.error('Logging endpoint error:', error);
        return NextResponse.json({ success: false, error: 'Logging failed' }, { status: 500 });
    }
}

