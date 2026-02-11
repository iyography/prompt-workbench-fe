import { Company } from "@/models/company";
import { Profile } from "@/models/profile";
import { useBackendQuery } from "./networking";
import { merge } from "lodash";

export function useCompanyAndProfileVariables() {
  const {
    data: companies,
    error: errorComapnies,
    isFetching: isLoadingCompanies,
  } = useBackendQuery<Company[]>("companies/");
  const company = companies?.[0]; // Right now, users will only have one company, so we'll just take the first object

  const {
    data: profile,
    error: errorProfile,
    isFetching: isLoadingProfile,
  } = useBackendQuery<Profile>("profile/");

  const data = merge(
    company?.company_variables || {},
    profile?.variables || {},
  );

  return {
    profile,
    company, // Add company to return value for accessing company settings
    data,
    error: errorComapnies || errorProfile,
    isFetching: isLoadingCompanies || isLoadingProfile,
  };
}
