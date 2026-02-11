import { Contact, Company, Deal } from "@/types/hubspot";

export const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
};

export const formatCurrency = (amount: number | string) => {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(numAmount);
};

/** Converts hubspot data to flattened object. */
export const flattenHubspotData = <T extends Company | Contact | Deal>(
  type: "Contact" | "Company" | "Deal",
  data: T | null,
) => {
  if (!data) return {};
  let formatted: Record<string, string> = {};
  const prefix = `hubspot_${type.toLowerCase()}_`;
  let k: keyof T;
  for (k in data) {
    if (k !== "_nango_metadata" && k !== "properties") {
      formatted[prefix + String(k)] = String(data[k]);
    }
  }
  let p: keyof Contact["properties"];
  for (p in data.properties) {
    formatted[prefix + p] = String(data.properties[p].value);
  }
  return formatted;
};

export const formatHubspotEmployees = (
  employees: Contact[],
): { hubspot_coworkers: string; hubspot_coworkers_names: string } => {
  const data = employees.map((e) => {
    const flattenedProps: Record<string, any> = {};
    if (e?.properties) {
      Object.entries(e.properties).forEach(([k, v]: any) => {
        flattenedProps[k] = v?.value;
      });
    }
    return {
      id: (e as any).id,
      first_name: (e as any).firstname,
      last_name: (e as any).lastname,
      email: (e as any).email ?? flattenedProps.email ?? '',
      properties: flattenedProps,
    };
  });
  
  // Format: "first name last name - job title" (one per line)
  const hubspotCoworkers = data
    .map((e) => {
      const firstName = e.first_name || '';
      const lastName = e.last_name || '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
      const jobTitle = e.properties?.jobtitle || e.properties?.job_title || e.properties?.Job_Title || '';
      
      if (!fullName) return '';
      
      // Format: "first name last name - job title"
      return jobTitle ? `${fullName} - ${jobTitle}` : fullName;
    })
    .filter(Boolean)
    .join('\n');
  
  // Keep the old format for backward compatibility
  const names = data
    .map((e) => {
      const fullName = [e.first_name, e.last_name].filter(Boolean).join(' ').trim();
      const title = e.properties?.jobtitle || e.properties?.job_title || '';
      const email = e.email || '';
      return [fullName, title ? `— ${title}` : '', email ? ` <${email}>` : '']
        .join('')
        .trim();
    })
    .filter(Boolean)
    .join('\n');
    
  return {
    hubspot_coworkers: hubspotCoworkers, // New format: "first name last name - job title"
    hubspot_coworkers_names: names, // Keep old format for backward compatibility
  };
};
