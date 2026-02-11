import { useBackendMutation } from "@/hooks/networking";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { BaseModal } from "@/components/modals/BaseModal";

interface OrgChartAPI {
  id: number;
  company: number;
  name: string;
  website?: string;
  account_intel?: string; // Account intel is at the top level, not in metadata
  narrative?: string; // Narrative field acts as a title
  chart_data?: {
    version?: string;
    metadata?: {
      name?: string;
      created_at?: string;
      last_modified?: string;
    };
    root_node?: any;
    ai_metadata?: any;
  };
  created_at: string;
  updated_at: string;
}

interface EditOrgChartModalProps {
  orgChart: OrgChartAPI | null;
  open: boolean;
  onClose: () => void;
  onSave: (updatedOrgChart: OrgChartAPI) => void;
}

export function EditOrgChartModal({
  orgChart,
  open,
  onClose,
  onSave,
}: EditOrgChartModalProps) {
  const [name, setName] = useState<string>("");
  const [accountIntel, setAccountIntel] = useState<string>("");
  const [website, setWebsite] = useState<string>("");
  const [narrative, setNarrative] = useState<string>("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const { mutate, isPending, error } = useBackendMutation<any, OrgChartAPI>(
    `org-charts/${orgChart?.id}/`,
    "PUT",
    {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ["org-charts/"] });
        onSave(data);
        onClose();
        // Reset form
        setName("");
        setAccountIntel("");
        setWebsite("");
        setNarrative("");
        setErrors({});
      },
    },
  );

  // Initialize form data when modal opens or orgChart changes
  useEffect(() => {
    if (orgChart) {
      setName(orgChart.name || "");
      setAccountIntel(orgChart.account_intel || "");
      setWebsite(orgChart.website || "");
      setNarrative(orgChart.narrative || "");
      setErrors({});
    }
  }, [orgChart, open]);

  // Website validation helper function - matches Django URLValidator
  const validateWebsiteUrl = (website: string): string | null => {
    if (!website.trim()) {
      return null; // Website is optional in edit mode
    }

    const trimmedUrl = website.trim();

    // Django URLValidator regex pattern (simplified for JavaScript)
    // Allows http, https, ftp, ftps schemes like Django's URLValidator
    const urlPattern = /^(?:http|https|ftp|ftps):\/\/(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?::\d{1,5})?(?:\/[^\s]*)?$/i;
    
    // Additional validation using URL constructor for more thorough checking
    try {
      const url = new URL(trimmedUrl);
      
      // Check allowed schemes (same as Django URLValidator default)
      const allowedSchemes = ['http:', 'https:', 'ftp:', 'ftps:'];
      if (!allowedSchemes.includes(url.protocol)) {
        return 'Enter a valid URL.';
      }

      // Check hostname exists and is valid
      if (!url.hostname || url.hostname.length < 1) {
        return 'Enter a valid URL.';
      }

      // Additional pattern check for Django compatibility
      if (!urlPattern.test(trimmedUrl)) {
        return 'Enter a valid URL.';
      }

    } catch {
      return 'Enter a valid URL.';
    }

    return null; // No error
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Chart name is required";
    }

    // Account intel is now optional, no validation needed

    // Website validation using helper function
    if (website && website.trim()) {
      const websiteError = validateWebsiteUrl(website);
      if (websiteError) {
        newErrors.website = websiteError;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!orgChart || !validateForm()) return;

    // Use website as-is since validation already ensures it's properly formatted
    const normalizedWebsite = website.trim() || undefined;

    const updatedChartData = {
      ...orgChart.chart_data,
      metadata: {
        ...orgChart.chart_data?.metadata,
        account_intel: accountIntel.trim() || "",
        last_modified: new Date().toISOString(),
      }
    };

    mutate({
      id: orgChart.id,
      name: name.trim(),
      chart_data: updatedChartData,
      website: normalizedWebsite,
      account_intel: accountIntel.trim() || "",
      narrative: narrative.trim()
    });
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  const isReady = Boolean(name.trim());

  return (
    <BaseModal show={open} onClose={handleClose}>
      <div className="px-4 py-5 sm:p-6 w-full flex flex-col gap-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-gray-900">Edit Org Chart Details</h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Chart Name */}
        <div>
          <label htmlFor="chart-name" className="block text-sm font-medium text-gray-700 mb-1">
            Chart Name <span className="text-red-500">*</span>
          </label>
          <input
            id="chart-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Q1 2024 Org Chart"
            className={`block w-full primary-input ${
              errors.name ? 'border-red-500 focus:ring-red-500' : ''
            }`}
          />
          {errors.name && (
            <p className="text-red-500 text-xs mt-1">{errors.name}</p>
          )}
        </div>

        {/* Narrative */}
        <div>
          <label htmlFor="narrative" className="block text-sm font-medium text-gray-700 mb-1">
            Narrative
          </label>
          <input
            id="narrative"
            type="text"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Enter a narrative title..."
            className="block w-full primary-input"
          />
          <p className="text-gray-500 text-xs mt-1">This will appear as a title above the org chart editor</p>
        </div>

        {/* Account Intel */}
        <div>
          <label htmlFor="account-intel" className="block text-sm font-medium text-gray-700 mb-1">
            Account Intel
          </label>
          <textarea
            id="account-intel"
            value={accountIntel}
            onChange={(e) => setAccountIntel(e.target.value)}
            placeholder="Enter account intelligence information..."
            rows={3}
            className={`block w-full primary-input resize-none ${
              errors.account_intel ? 'border-red-500 focus:ring-red-500' : ''
            }`}
          />
          {errors.account_intel && (
            <p className="text-red-500 text-xs mt-1">{errors.account_intel}</p>
          )}
        </div>

        {/* Website */}
        <div>
          <label htmlFor="website" className="block text-sm font-medium text-gray-700 mb-1">
            Website
          </label>
          <input
            id="website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://company.com or http://company.com"
            className={`block w-full primary-input ${
              errors.website ? 'border-red-500 focus:ring-red-500' : ''
            }`}
          />
          {errors.website && (
            <p className="text-red-500 text-xs mt-1">{errors.website}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isReady || isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-600 text-sm">⛔️ {error.message}</p>
          </div>
        )}
      </div>
    </BaseModal>
  );
}
