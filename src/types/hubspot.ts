export interface NangoMetadata {
  first_seen_at: string;
  last_modified_at: string;
  last_action: string;
  deleted_at: string | null;
  cursor: string;
}

export interface PropertyValue {
  value: string | number | boolean | null;
  label: string;
}

export interface BaseHubspotRecord {
  id: string;
  created_at: string;
  updated_at: string;
  _nango_metadata: NangoMetadata;
  properties: Record<string, PropertyValue>;
}

export interface Deal extends BaseHubspotRecord {
  amount: string;
  close_date: string;
  name: string;
  pipeline: string;
  stage: string;
}

export interface Company extends BaseHubspotRecord {
  name: string;
  domain: string;
}

export interface Contact extends BaseHubspotRecord {
  email: string;
  firstname: string;
  lastname: string;
}

export interface HubspotResponse<T> {
  results: {
    data: T[];
    status: number;
    statusText: string;
  };
  pagination?: {
    nextCursor?: string;
    hasMore: boolean;
  };
}
