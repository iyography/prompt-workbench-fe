type Optional<T> = T | null | undefined
type ConnectionId = Optional<string | number>;

const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
// ENVIRONMENT DETECTION
const isDev = process.env.NODE_ENV !== 'production';
// FRONTEND URLS
const LOCAL_FRONTEND_URL = "http://localhost:3000";
const PROD_FRONTEND_URL = "https://prompt-workbench-fe.vercel.app";

const ATWOOD_URL = process.env.ATWOOD_URL ?? 'https://atwood.home.all-dressed-programming.com';

function getHubspotBaseUrl(): string {
    if (isExtension) {
        return isDev ? LOCAL_FRONTEND_URL : PROD_FRONTEND_URL;
    }
    return '';
}

export class HubspotApiUrlService {
    private readonly root: string;

    constructor(root: string) {
        this.root = root.endsWith("/") ? root.substring(0, root.length - 1) : root;
    }

    private getRoot(): string {
        return window.localStorage.getItem("HUBSPOT_URL") ?? this.root;
    }

    private buildApiURL(path: string, params: Record<string, string>): string {
        const paramString = new URLSearchParams(params).toString();
        return `${this.getRoot()}${path}?${paramString}`;
    }

    connection(connectionId: ConnectionId): string {
        return this.buildApiURL('/api/hubspot/connections', {connectionId: connectionId?.toString() ?? ''})
    }

    delete(connectionId: ConnectionId): string {
        return this.buildApiURL('/api/hubspot/delete', {connectionId: connectionId?.toString() ?? ''})
    }

    companies(connectionId: ConnectionId): string {
        return this.buildApiURL('/api/hubspot/companies', {id: connectionId?.toString() ?? ''})
    }

    company(connectionId: ConnectionId, companyId: string | undefined): string {
        return this.buildApiURL('/api/hubspot/companies', {
            id: connectionId?.toString() ?? '',
            companyId: companyId ?? ''
        })
    }

    companyEmployees(connectionId: ConnectionId, companyId: string | undefined, fetchAll?: boolean, cursor?: string): string {
        const params: Record<string, string> = {
            id: connectionId?.toString() ?? '',
        };
        if (fetchAll !== undefined) {
            params.fetchAll = fetchAll.toString();
        }
        if (cursor && cursor.trim() !== '') {
            params.cursor = cursor.trim();
        }
        return this.buildApiURL(`/api/hubspot/companies/${companyId}/employees`, params);
    }

    deals(connectionId: ConnectionId): string {
        return this.buildApiURL('/api/hubspot/deals', {
            id: connectionId?.toString() ?? ''
        })
    }

    deal(connectionId: ConnectionId, contactId: Optional<string>, companyId?: string, companyName?: string): string {
        const params: Record<string, string> = {
            id: connectionId?.toString() ?? '',
        }
        
        if (companyName && companyName.trim() !== '') {
            params.companyName = companyName.trim();
        } else if (companyId && companyId.trim() !== '') {
            params.companyId = companyId.trim();
        } else if (contactId && contactId.trim() !== '') {
            params.contactId = contactId.trim();
        }

        return this.buildApiURL('/api/hubspot/deals', params)
    }

    contacts(connectionId: ConnectionId, linkedInUrl?: string, email?: string, firstName?: string, lastName?: string, companyName?: string, fetchAll?: boolean, cursor?: string): string {
        const params: Record<string, string> = {id: connectionId?.toString() ?? ''}
        // Priority 1: LinkedIn URL (fastest and most accurate)
        if (linkedInUrl && linkedInUrl.trim() !== '') {
            params.linkedInUrl = linkedInUrl.trim();
        }
        // Priority 2: Email
        if (email && email.trim() !== '') {
            params.email = email.trim();
        }
        // Priority 3: Name + Company (fallback)
        if (firstName && firstName.trim() !== '') {
            params.firstName = firstName.trim();
        }
        if (lastName && lastName.trim() !== '') {
            params.lastName = lastName.trim();
        }
        if (companyName && companyName.trim() !== '') {
            params.companyName = companyName.trim();
        }
        if (fetchAll !== undefined) {
            params.fetchAll = fetchAll.toString();
        }
        if (cursor && cursor.trim() !== '') {
            params.cursor = cursor.trim();
        }

        return this.buildApiURL('/api/hubspot/contacts', params)

    }

    fullHubspotVariables(connectionId: ConnectionId, email?: string, firstName?: string, lastName?: string): string {
        const params: Record<string, string> = {id: connectionId?.toString() ?? ''}
        if (email && email.trim() !== '') {
            params.email = email.trim();
        }
        if (firstName && firstName.trim() !== '') {
            params.firstName = firstName.trim();
        }
        if (lastName && lastName.trim() !== '') {
            params.lastName = lastName.trim();
        }

        const queryString = new URLSearchParams(params).toString();
        // todo: this should be set via the .env file.
        return `${ATWOOD_URL}/api/hubspot/prompt-benchmark-variables?${queryString}`

    }

    public static create(): HubspotApiUrlService {
        return new HubspotApiUrlService(getHubspotBaseUrl());
    }
}