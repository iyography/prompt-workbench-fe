import {
  getToken,
  isUserAuthenticated,
  removeTokens,
  storeToken,
} from "@/utils/auth";
import {
  UndefinedInitialDataOptions,
  UseMutationOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import axios, { AxiosRequestConfig } from "axios";
import { useSSEStreaming, SSEStreamingOptions } from "./useSSEStreaming";
import { useState, useCallback } from "react";
import { UserPlayPreference } from "@/models/play";

// TODO: Refactor to use fetch instead of axios as NextJS has built-in support for de-duping fetch
export async function callBackend<RequestBodyDataType, ResponseType>(
  key: string,
  config: AxiosRequestConfig<RequestBodyDataType> = {},
) {
  type PromiseResponseType = Promise<ResponseType> & { abort?: () => void };

  const controller = new AbortController();
  const url = `${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PLASMO_PUBLIC_BACKEND_URL}/${key}`;
  config.url = url;
  config.signal = controller.signal;

  if (isUserAuthenticated()) {
    config.headers = { Authorization: `Bearer ${getToken("access")}` };
  }

  // Timeout configuration - ensure it's properly set
  if (config.timeout) {
    console.log(`🕒 Setting request timeout to ${config.timeout}ms for ${key}`);
  }

  const promise: PromiseResponseType = axios
    .request<ResponseType>(config)
    .then((res) => res.data)
    .catch(async (err) => {
      // On 401, attempt to refresh the token and replay the request, if failure redirect to login
      if (err.response?.status === 401) {
        if (key === "auth/jwt/refresh") {
          // Prevent infinite recursion, since we alsop use callBackend to refresh the token.
          throw err;
        } else {
          try {
            // Attempt to refresh the JWT token.
            const refresh = getToken("refresh");
            if (!refresh) {
              throw new Error("No refresh token found");
            }
            const { access } = await callBackend<
              { refresh: string },
              { access: string }
            >("auth/jwt/refresh", {
              method: "POST",
              data: { refresh },
            });

            // Store the new access token.
            storeToken(access, "access");

            // Replay the original request with the new access token.
            config.headers = { Authorization: `Bearer ${access}` };
            return axios.request<ResponseType>(config).then((res) => res.data);
          } catch (err) {
            // FIXME: I don't think this is SSR compatible (but we're not doing SSR yet)
            if (process.env.PLASMO_PUBLIC_IS_CHROME_EXTENSION != undefined) {
              removeTokens();
              window.location.reload();
            } else {
              throw new Error("Invalid username or password. Please try again.");
            }
          }
        }
      }
      // Extract the most useful error message from the response
      let message = "An unexpected error occurred";

      if (err?.response?.data) {
        const data = err.response.data;
        // Try different common error message formats
        if (data.message) {
          message = data.message;
        } else if (data.detail) {
          message = data.detail;
        } else if (data.error) {
          message = data.error;
        } else if (data.non_field_errors && Array.isArray(data.non_field_errors)) {
          message = data.non_field_errors.join(", ");
        } else if (typeof data === "string") {
          message = data;
        }
      } else if (err?.message) {
        message = err.message;
      }

      // Add status code context for debugging
      const status = err?.response?.status;
      if (status === 400) {
        message = `Bad request: ${message}`;
      } else if (status === 403) {
        message = `Access denied: ${message}`;
      } else if (status === 404) {
        message = `Not found: ${message}`;
      } else if (status === 500) {
        message = `Server error: ${message}`;
      } else if (status === 502 || status === 503 || status === 504) {
        message = `Service unavailable. Please try again later.`;
      } else if (err?.code === "ECONNABORTED") {
        console.error(`🕒 Request timeout for ${key}:`, err);
        message = "Request timed out. The operation took longer than expected.";
      } else if (err?.code === "ERR_NETWORK") {
        message = "Network error. Please check your connection.";
      }

      throw Error(message);
    });
  promise.abort = () => {
    controller.abort();
  };
  return promise;
}

export function useBackendQuery<ResponseType>(
  key: string,
  methodOrOptions?: string | (Omit<
    UndefinedInitialDataOptions<ResponseType>,
    "queryKey" | "queryFn"
  > & {
    streaming?: boolean;
    onStreamResult?: (data: Partial<ResponseType>) => void;
    shouldCacheResponse?: boolean;
  }),
  options?: Omit<
    UndefinedInitialDataOptions<ResponseType>,
    "queryKey" | "queryFn"
  > & {
    streaming?: boolean;
    onStreamResult?: (data: Partial<ResponseType>) => void;
    shouldCacheResponse?: boolean;
  }
) {
  // Handle backward compatibility - if second parameter is a string, it's the old signature
  let finalOptions: Omit<
    UndefinedInitialDataOptions<ResponseType>,
    "queryKey" | "queryFn"
  > & {
    streaming?: boolean;
    onStreamResult?: (data: Partial<ResponseType>) => void;
    shouldCacheResponse?: boolean;
  };
  
  if (typeof methodOrOptions === 'string') {
    // Old signature: useBackendQuery(key, method, options)
    finalOptions = options || {};
  } else {
    // New signature: useBackendQuery(key, options)
    finalOptions = methodOrOptions || {};
  }
  
  const { streaming, onStreamResult, shouldCacheResponse, ...restOptions } = finalOptions;
  const queryKey = key.split("?");
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingError, setStreamingError] = useState<Error | null>(null);

  // Create SSE streaming options if streaming is enabled
  const sseOptions: SSEStreamingOptions<Partial<ResponseType>> = {
    onResult: (data) => {
      onStreamResult?.(data);
    },
    onComplete: () => {
      setIsStreaming(false);
    },
    onError: (error) => {
      setStreamingError(error);
      setIsStreaming(false);
    },
    onStart: () => {
      setIsStreaming(true);
      setStreamingError(null);
    },
  };

  const { startStream, stopStream, isConnected } = useSSEStreaming<Partial<ResponseType>>(
    streaming ? `${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PLASMO_PUBLIC_BACKEND_URL}/${key}${key.includes('?') ? '&' : '?'}stream=true` : "",
    sseOptions
  );

  const queryClient = useQueryClient();
  
  const query = useQuery({
    ...restOptions,
    queryKey,
    queryFn: () => {
      if (streaming) {
        // Start the SSE stream for incremental updates
        startStream();
      }
      return callBackend<undefined, ResponseType>(key);
    },
  });

  // Handle caching if shouldCacheResponse is true
  if (shouldCacheResponse && query.data && queryClient) {
    queryClient.setQueryData(queryKey, query.data);
  }

  return {
    ...query,
    isStreaming,
    streamingError,
    isConnected,
    stopStream,
  };
}

export function useBackendMutation<RequestBodyDataType, ResponseType>(
  path: string | ((data: RequestBodyDataType) => string),
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  options: UseMutationOptions<ResponseType, Error, RequestBodyDataType> & {
    shouldCacheResponse?: boolean;
    streaming?: boolean;
    onStreamResult?: (data: Partial<ResponseType>) => void;
    timeout?: number; // Timeout in milliseconds for the request
  } = {},
) {
  let { onSuccess, shouldCacheResponse, streaming, onStreamResult, timeout, ...restOptions } = options;

  // Default to caching responses for PUT and PATCH requests if not specified
  if (shouldCacheResponse === undefined) {
    shouldCacheResponse = method === "PUT" || method === "PATCH";
  }

  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingError, setStreamingError] = useState<Error | null>(null);

  // Create SSE streaming options if streaming is enabled
  const sseOptions: SSEStreamingOptions<Partial<ResponseType>> = {
    onResult: (data) => {
      onStreamResult?.(data);
    },
    onComplete: () => {
      setIsStreaming(false);
    },
    onError: (error) => {
      setStreamingError(error);
      setIsStreaming(false);
    },
    onStart: () => {
      setIsStreaming(true);
      setStreamingError(null);
    },
  };

  const { startStream, stopStream, isConnected } = useSSEStreaming<Partial<ResponseType>>(
    streaming ? `${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PLASMO_PUBLIC_BACKEND_URL}/${typeof path === "string" ? path : ""}` : "",
    sseOptions
  );

  const mutation = useMutation<ResponseType, Error, RequestBodyDataType>({
    mutationFn: async (data) => {
      const key = typeof path === "string" ? path : path(data);
      
      if (streaming) {
        // For streaming requests, we still make the regular request for the final response
        // but also start the SSE stream for incremental updates
        const streamUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PLASMO_PUBLIC_BACKEND_URL}/${key}${key.includes('?') ? '&' : '?'}stream=true`;
        
        // Start the SSE stream with the dynamic URL specific to this play
        startStream(streamUrl);
        
        // Also make the regular request to get the final response
        return callBackend<RequestBodyDataType, ResponseType>(key, {
          method,
          data,
          timeout: timeout,
        });
      } else {
        // Regular non-streaming behavior
        return callBackend<RequestBodyDataType, ResponseType>(key, {
          method,
          data,
          timeout: timeout,
        });
      }
    },
    ...restOptions,
    onSuccess: (data, variables, context, meta) => {
      if (queryClient && shouldCacheResponse) {
        const key = typeof path === "string" ? path : path(variables);
        queryClient.setQueryData([key], data);
      }
      if (onSuccess) {
        onSuccess(data, variables, context, meta);
      }
    },
  });

  return {
    ...mutation,
    isStreaming,
    streamingError,
    isConnected,
    stopStream,
  };
}

export function useUserPlayPreference(playId: number | undefined) {
  const enabled = typeof playId === "number" && !Number.isNaN(playId);

  return useBackendQuery<UserPlayPreference>(
    enabled ? `user-play-preferences/?play_id=${playId}` : `user-play-preferences/`,
    {
      enabled,
      staleTime: 60 * 1000,
    },
  );
}

export function useUpdateUserPlayPreference(
  options?: UseMutationOptions<UserPlayPreference, Error, { play: number; num_outputs: number }>
) {
  return useBackendMutation<{ play: number; num_outputs: number }, UserPlayPreference>(
    "user-play-preferences/",
    "POST",
    options ?? {},
  );
}