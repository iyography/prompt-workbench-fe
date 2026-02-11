import { useState, useCallback, useRef, useEffect } from 'react';

export interface SSEStreamingOptions<T> {
  onResult: (data: T) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  onStart?: () => void;
}

export interface SSEStreamingState {
  isStreaming: boolean;
  error: Error | null;
  isConnected: boolean;
}

export function useSSEStreaming<T = any>(
  baseUrl: string,
  options: SSEStreamingOptions<T>
) {
  const [state, setState] = useState<SSEStreamingState>({
    isStreaming: false,
    error: null,
    isConnected: false,
  });
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  const reconnectDelay = 1000; // 1 second

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const startStream = useCallback((dynamicUrl?: string) => {
    // Use dynamic URL if provided, otherwise fall back to baseUrl
    const urlToUse = dynamicUrl || baseUrl;
    
    if (!urlToUse) {
      console.error('No URL provided for SSE streaming');
      return;
    }
    
    // Clean up any existing connection
    cleanup();
    
    // Reset state
    setState({
      isStreaming: true,
      error: null,
      isConnected: false,
    });
    
    reconnectAttempts.current = 0;
    
    try {
      const eventSource = new EventSource(urlToUse);
      eventSourceRef.current = eventSource;
      
      // Connection opened
      eventSource.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        options.onStart?.();
      };
      
      // Handle messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          options.onResult(data);
        } catch (err) {
          console.error('Error parsing SSE data:', err);
          options.onError(err as Error);
        }
      };
      
      // Handle custom events
      eventSource.addEventListener('result', (event) => {
        try {
          const data = JSON.parse(event.data);
          options.onResult(data);
        } catch (err) {
          console.error('Error parsing SSE result data:', err);
          options.onError(err as Error);
        }
      });
      
      eventSource.addEventListener('done', () => {
        options.onComplete();
        cleanup();
        setState(prev => ({ ...prev, isStreaming: false, isConnected: false }));
      });
      
      // Handle errors
      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        
        if (reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            startStream();
          }, reconnectDelay * reconnectAttempts.current);
        } else {
          const error = new Error('SSE connection failed after multiple attempts');
          setState(prev => ({ ...prev, error, isStreaming: false, isConnected: false }));
          options.onError(error);
          cleanup();
        }
      };
      
    } catch (err) {
      const error = new Error(`Failed to create SSE connection: ${err}`);
      setState(prev => ({ ...prev, error, isStreaming: false, isConnected: false }));
      options.onError(error);
    }
  }, [baseUrl, options, cleanup]);

  const stopStream = useCallback(() => {
    cleanup();
    setState({
      isStreaming: false,
      error: null,
      isConnected: false,
    });
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return {
    startStream,
    stopStream,
    ...state,
  };
}
