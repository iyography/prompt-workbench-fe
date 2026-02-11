import React, { useState, useEffect } from 'react';
import { isUserAuthenticated } from "@/utils/auth";
import { LoginForm } from "@/app/login/LoginForm";
import SidePanelExecuteView from './index';

function AuthWrapper() {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Check authentication on mount and when auth:expired event is fired
    useEffect(() => {
        const checkAuth = () => {
            try {
                const authenticated = isUserAuthenticated();
                setIsAuthenticated(authenticated);
            } catch (error) {
                console.error('Error checking authentication:', error);
                setIsAuthenticated(false);
            }
        };

        // Initial check
        checkAuth();

        // Listen for auth:expired event
        const handleAuthExpired = (event: Event) => {
            setIsAuthenticated(false);

            // Get error message if available
            const customEvent = event as CustomEvent;
            if (customEvent.detail?.reason) {
                setErrorMessage(customEvent.detail.reason);
            } else {
                setErrorMessage('Your session has expired. Please log in again.');
            }
        };

        window.addEventListener('auth:expired', handleAuthExpired);

        // Cleanup
        return () => {
            window.removeEventListener('auth:expired', handleAuthExpired);
        };
    }, []);

    const handleLoginSuccess = () => {
        setIsAuthenticated(true);
        setErrorMessage(null);
    };

    // Show loading state while checking authentication
    if (isAuthenticated === null) {
        return (
            <div className="flex items-center justify-center min-h-screen p-4 bg-gray-50">
                <div className="p-6 bg-white rounded-lg shadow-md max-w-md w-full text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500 mx-auto"></div>
                    <p className="mt-4 text-gray-600">Checking authentication status...</p>
                </div>
            </div>
        );
    }

    // Show login form if not authenticated
    if (!isAuthenticated) {
        return (
            <div className="min-h-screen p-4 bg-gray-50">
                <div className="max-w-md mx-auto">
                    {errorMessage && (
                        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                            <p>{errorMessage}</p>
                        </div>
                    )}
                    <LoginForm
                        onSuccess={handleLoginSuccess}
                        queryError={errorMessage ? 'timeout' : null}
                        setQueryError={setErrorMessage}
                    />
                </div>
            </div>
        );
    }

    // Show main component if authenticated
    return <SidePanelExecuteView />;
}

export default AuthWrapper;