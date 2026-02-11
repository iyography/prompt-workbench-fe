import React from "react";
import { useCompanyEnrichment } from "@/hooks/useCompanyEnrichment";
import { DictionaryTable } from "../common/DictionaryTable";

interface CompanyEnrichmentProps {
  companyId?: string;
  enabled?: boolean;
  onDataUpdate?: (data: Record<string, string>) => void;
}

export const CompanyEnrichment: React.FC<CompanyEnrichmentProps> = ({
  companyId,
  enabled = true,
  onDataUpdate
}) => {
  // Debug component rendering
  const {
    data: companyData,
    isLoading,
    error,
    refetch
  } = useCompanyEnrichment(companyId, enabled);

  // Helper: convert a string to snake_case
  const toSnakeCase = (input: string): string => {
    return input
      .replace(/[^a-zA-Z0-9]+/g, '_') // non-alphanumeric to underscores
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2') // camelCase to snake_case
      .replace(/_+/g, '_') // collapse multiple underscores
      .replace(/^_+|_+$/g, '') // trim leading/trailing underscores
      .toLowerCase();
  };

  // Helper: stringify values safely for variables
  const valueToString = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      // If array of primitives, join; otherwise JSON stringify items and join
      const isPrimitiveArray = value.every(v => ['string', 'number', 'boolean'].includes(typeof v));
      return isPrimitiveArray ? value.join(', ') : value.map(v => JSON.stringify(v)).join(' | ');
    }
    // Object fallback
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  // Helper: flatten nested objects into company_* variables
  const flattenObject = (obj: Record<string, any>, prefix = 'company'): Record<string, string> => {
    const out: Record<string, string> = {};

    const recurse = (current: any, currentPrefix: string) => {
      if (current === null || current === undefined) return;

      if (typeof current !== 'object' || Array.isArray(current)) {
        // Leaf value
        out[currentPrefix] = valueToString(current);
        return;
      }

      for (const [k, v] of Object.entries(current)) {
        const nextKey = `${currentPrefix}_${toSnakeCase(k)}`;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
          recurse(v, nextKey);
        } else {
          out[nextKey] = valueToString(v);
        }
      }
    };

    recurse(obj, prefix);
    return out;
  };

  // Update parent component with ALL company data for plays as underscore_case variables
  React.useEffect(() => {
    if (onDataUpdate && companyData?.data) {
      const raw = companyData.data as Record<string, any>;

      // Ensure top-level known conveniences remain (backwards compatible)
      const convenienceVars: Record<string, string> = {
        company_name: valueToString(raw.company_name || raw.name || 'Unknown'),
        company_industry: valueToString(raw.company_industry || raw.industry || 'Unknown'),
        company_size: valueToString(raw.company_size || raw.company_size_range || raw.size || 'Unknown'),
        company_location: valueToString(
          raw.company_hq_full_address || raw.location || raw.headquarters || 'Unknown'
        ),
        company_website: valueToString(raw.company_website || raw.website || 'Unknown'),
        company_job_postings: valueToString(raw.active_job_postings_count ?? '0'),
        company_description: valueToString((raw as any).company_description || (raw as any).description || '')
      };

      // Flatten entire payload with company_ prefix
      const flattened = flattenObject(raw, 'company');

      // Passthrough raw top-level fields as-is so existing company_* keys are preserved
      const rawPassthrough: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v === null || v === undefined) continue;
        rawPassthrough[k] = valueToString(v);
      }

      // Merge, with flattened providing full coverage and convenience keys ensuring the common ones exist
      const variableMap = {
        ...rawPassthrough,
        ...flattened,
        ...convenienceVars
      };

      onDataUpdate(variableMap);
    }
  }, [companyData, onDataUpdate]);

  if (!enabled || !companyId) return null;

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <p className="text-red-600">{error.message}</p>
        <button 
          onClick={() => refetch()}
          className="mt-2 px-3 py-1 bg-red-100 text-red-800 rounded text-sm hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!companyData?.data) {
    return (
      <p className="text-yellow-600">No company data found for company ID: {companyId}</p>
    );
  }

  // Convert company data to table format showing exact variable keys
  const companyTableData = (() => {
    const raw = companyData.data as Record<string, any>;
    // Show underscore_case keys directly for copy/paste into plays
    const table: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value === null || value === undefined) continue;
      table[key] = typeof value === 'string'
        ? value
        : Array.isArray(value)
          ? (value.every(v => ['string','number','boolean'].includes(typeof v)) ? value.join(', ') : JSON.stringify(value))
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);
    }
    return table;
  })();

  return (
    <>
      <DictionaryTable data={companyTableData} />
      <p className="text-xs text-gray-500 mt-2">
        Source: {companyData.source} | Company ID: {companyData.company_id}
      </p>
    </>
  );
}; 