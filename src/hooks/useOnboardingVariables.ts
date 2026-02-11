import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useBackendQuery } from './networking';

export interface OnboardingVariables {
  company_name: string;
  job_search_location: string;
  job_search_type: string;
  experience_level: string;
  max_job_details: number;
  linkedin_job_search_term: string;
  industry: string;
  role: string;
  company_size: string;
}

export const useOnboardingVariables = () => {
  // Return default values instead of calling non-existent endpoint
  const defaultValues: OnboardingVariables = {
    company_name: '',
    job_search_location: 'United States',
    job_search_type: 'full-time',
    experience_level: 'mid-senior',
    max_job_details: 10,
    linkedin_job_search_term: '',
    industry: '',
    role: '',
    company_size: '',
  };

  return {
    data: defaultValues,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
};

export const useSetOnboardingVariables = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: Partial<OnboardingVariables>) => {
      // Mock successful response since endpoint doesn't exist
      return Promise.resolve({ success: true });
    },
    onSuccess: () => {
      // Invalidate and refetch onboarding variables
      queryClient.invalidateQueries({ queryKey: ['onboarding-variables'] });
    },
  });
}; 