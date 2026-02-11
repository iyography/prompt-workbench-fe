/**
 * Terminal logging utility
 * Sends logs to the server-side /api/log endpoint so they appear in the Next.js dev server terminal
 * Fire-and-forget: doesn't block execution or return promises
 */

export function terminalLog(message: string, data?: any): void {
    // Only run in browser environment (not SSR)
    if (typeof window === 'undefined') {
        // During SSR, just use console.log which will go to server terminal
        console.log('[TERMINAL LOG SSR]', message, data || '');
        return;
    }

    // Note: console.log is silenced in useExecuteView, so browser console logs won't appear
    // The important part is the fetch request to /api/log which will show in terminal

    // Fire and forget - don't await or return promise
    // Wrap in try-catch to prevent any errors from bubbling up
    try {
        // Create abort controller for timeout (more compatible than AbortSignal.timeout)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

        fetch('/api/log', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message, data }),
            signal: controller.signal,
        })
        .then((response) => {
            clearTimeout(timeoutId);
            if (!response.ok) {
                // Use console.error which might not be silenced
                console.error('[TERMINAL LOG] API returned error:', response.status, response.statusText);
            }
        })
        .catch((error) => {
            clearTimeout(timeoutId);
            // Log errors - use console.error which might not be silenced
            if (error.name !== 'AbortError') {
                console.error('[TERMINAL LOG] Fetch failed:', error.message || error);
            }
        });
    } catch (error) {
        // If fetch itself fails (e.g., network error), log it
        console.warn('[TERMINAL LOG] Error in terminalLog:', error);
    }
}

