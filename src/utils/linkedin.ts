const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PLASMO_PUBLIC_BACKEND_URL;

// Returns undefined if the URL is not a valid linkedin URL
export const getLinkedInUsernameFromUrl = (
  linkedInProfileURL: string,
): string | undefined => {
  try {
    // Handle regular LinkedIn profile URLs
    const indexOfIn = linkedInProfileURL.indexOf("linkedin.com/in/");
    if (indexOfIn !== -1) {
      const username = linkedInProfileURL.slice(indexOfIn + 16).split("/")[0];
      // Remove query parameters (e.g., ?trk=public_profile_browsemap-profile)
      return username.split("?")[0];
    }

    // For Sales Navigator URLs, we don't extract a username
    // This allows the calling code to handle these URLs differently
    if (linkedInProfileURL.includes("linkedin.com/sales/lead/")) {
      return undefined;
    }

    throw new Error("Invalid URL");
  } catch (e) {
    return undefined;
  }
};

// Function to check if URL is a Sales Navigator profile page
export const isSalesNavigatorProfile = (url: string): boolean => {
  try {
    return url.includes("linkedin.com/sales/lead/");
  } catch {
    return false;
  }
};

// Function to check if URL is a HubSpot contact page
export const isHubSpotContactPage = (url: string): boolean => {
  try {
    return (
      url.includes("app.hubspot.com/contacts/") && url.includes("/record/")
    );
  } catch {
    return false;
  }
};

// Helper function to get active tab
const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (!tab?.id) {
    return undefined;
  }
  return tab;
};

// Helper function to execute script in tab context
const executeScriptInTab = async <T>(
  tabId: number,
  func: () => Promise<T>,
): Promise<T | undefined> => {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func,
    });
    return result?.result;
  } catch (e) {
    console.error("Error executing script:", e);
    return undefined;
  }
};

// Function to extract LinkedIn profile URL from Sales Navigator page
export const extractLinkedInProfileFromSalesNav = async (): Promise<
  string | undefined
> => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return undefined;

    return executeScriptInTab(tab.id, async () => {
      try {
        // Helper function to wait for element to be visible
        const waitForElement = async (
          selector: string,
          timeout = 5000,
        ): Promise<Element | null> => {
          const startTime = Date.now();

          while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
              // Check if element is visible
              const rect = element.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return element;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return null;
        };

        // Wait for menu button to be visible
        const menuButton = await waitForElement(
          '[aria-label="Open actions overflow menu"]',
        );

        if (menuButton instanceof HTMLElement) {
          menuButton.click();

          // Wait for menu to appear
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Find and click the "Copy LinkedIn.com URL" button
          const copyButtons = document.querySelectorAll<HTMLAnchorElement>(
            'a[href*="linkedin.com/in"]',
          );
          const button = Array.from(copyButtons).find((a) =>
            a.textContent?.includes("View LinkedIn profile"),
          );
          const link = button?.href;
          menuButton.click();
          return link;
        }
        return undefined;
      } catch (e) {
        console.error("Error in extraction script:", e);
        return undefined;
      }
    });
  } catch (e) {
    console.error("Error extracting LinkedIn profile URL:", e);
    return undefined;
  }
};

// Function to extract LinkedIn profile URL from HubSpot contact page
export const extractLinkedInProfileFromHubSpot = async (): Promise<
  string | undefined
> => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return undefined;

    return executeScriptInTab(tab.id, async () => {
      try {
        // Helper function to wait for element to be visible
        const waitForElement = async (
          selector: string,
          timeout = 5000,
        ): Promise<Element | null> => {
          const startTime = Date.now();

          while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
              // Check if element is visible
              const rect = element.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return element;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return null;
        };

        // Wait for LinkedIn profile element to be visible
        const linkedinElement = (
          await waitForElement('[data-test-id="linkedin_profile"]')
        )?.querySelector("textarea");
        if (linkedinElement) {
          // Extract the LinkedIn URL from the element
          const linkedinUrl = linkedinElement.textContent?.trim();
          if (linkedinUrl && linkedinUrl.includes("linkedin.com/in/")) {
            return linkedinUrl;
          }
        }

        // Fallback 1: Look for an explicit anchor tag containing linkedin.com/in
        const anchor = document.querySelector('a[href*="linkedin.com/in/"]') as HTMLAnchorElement | null;
        if (anchor) {
          const href = anchor.getAttribute('href') || anchor.textContent?.trim() || '';
          if (href.includes('linkedin.com/in/')) {
            return href;
          }
        }

        // Fallback 2: Look for any input/textarea with a linkedin value
        const inputLike = document.querySelector('input[name*="linkedin" i], textarea[name*="linkedin" i]') as HTMLInputElement | HTMLTextAreaElement | null;
        if (inputLike) {
          const val = (inputLike as HTMLInputElement).value || inputLike.textContent || '';
          if (val.includes('linkedin.com/in/')) {
            return val.trim();
          }
        }

        // Fallback 3: Scan common elements for any linkedin.com/in text
        const nodes = Array.from(document.querySelectorAll('a, span, div, p')); 
        for (const n of nodes) {
          const text = (n as HTMLElement).innerText || (n as HTMLElement).textContent || '';
          if (text && text.includes('linkedin.com/in/')) {
            return text.trim();
          }
          const href = (n as HTMLAnchorElement).getAttribute?.('href') || '';
          if (href && href.includes('linkedin.com/in/')) {
            return href.trim();
          }
        }

        return undefined;
      } catch (e) {
        console.error("Error in extraction script:", e);
        return undefined;
      }
    });
  } catch (e) {
    console.error("Error extracting LinkedIn profile URL:", e);
    return undefined;
  }
};

// Function to extract email address from HubSpot contact page
export const extractEmailFromHubSpot = async (): Promise<string | undefined> => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return undefined;

    return executeScriptInTab(tab.id, async () => {
      try {
        // Helper function to wait for element to be visible
        const waitForElement = async (
          selector: string,
          timeout = 5000,
        ): Promise<Element | null> => {
          const startTime = Date.now();

          while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
              // Check if element is visible
              const rect = element.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return element;
              }
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return null;
        };

        // First approach: Try to find email in data-test-id fields
        const emailElement = await waitForElement('[data-test-id="email"]');
        if (emailElement) {
          const textarea = emailElement.querySelector("textarea");
          if (textarea) {
            const email = textarea.textContent?.trim();
            if (email && email.includes('@')) {
              return email;
            }
          }
        }

        // Second approach: Try to find mailto links which typically contain email addresses
        const emailElements = document.querySelectorAll('a[href^="mailto:"]');
        // Convert NodeList to array to use for...of or use traditional for loop
        for (let i = 0; i < emailElements.length; i++) {
          const element = emailElements[i];
          const email = element.getAttribute('href')?.replace('mailto:', '').trim();
          if (email && email.includes('@')) {
            return email;
          }
        }

        // Third approach: Look for elements with email-related labels
        const propertyLabels = document.querySelectorAll('.property-label, .private-truncated-string');
        for (let i = 0; i < propertyLabels.length; i++) {
          const label = propertyLabels[i];
          if (label.textContent?.toLowerCase().includes('email')) {
            // Try to find the value near this label
            const valueEl = label.closest('.property-wrapper')?.querySelector('.property-value') ||
                          label.closest('tr')?.querySelector('td:nth-child(2)') ||
                          label.nextElementSibling;

            if (valueEl) {
              const value = valueEl.textContent?.trim();
              if (value && value.includes('@')) {
                return value;
              }
            }
          }
        }

        // Fourth approach: Look for input fields with email
        const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email"]');
        for (let i = 0; i < emailInputs.length; i++) {
          const input = emailInputs[i];
          if (input instanceof HTMLInputElement) {
            const value = input.value.trim();
            if (value && value.includes('@')) {
              return value;
            }
          }
        }

        // Fifth approach: Look for spans or divs containing text that looks like an email
        const allElements = document.querySelectorAll('span, div, p, td');
        for (let i = 0; i < allElements.length; i++) {
          const el = allElements[i];
          const text = el.textContent?.trim() || '';
          // Simple regex to identify potential email addresses
          const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
          if (emailMatch) {
            return emailMatch[0];
          }
        }
        return undefined;
      } catch (e) {
        console.error("Error in email extraction script:", e);
        return undefined;
      }
    });
  } catch (e) {
    console.error("Error extracting email from HubSpot:", e);
    return undefined;
  }
};

// Function to call the backend to resolve an email to a LinkedIn profile URL
export const getLinkedInProfileFromEmail = async (
  email: string
): Promise<{url: string, fromEmail: boolean} | undefined> => {
  if (!email) return undefined;

  try {
    const response = await fetch(`${API_URL}/linkedin-profile-from-email/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return undefined;
    }

    const data = await response.json();
    const url = data.linkedin_profile_url || data.linkedin_url;
    if (url) {
      return {
        url,
        fromEmail: true
      };
    }

    return undefined;
  } catch (error) {
    console.error('Error resolving email to LinkedIn profile:', error);
    return undefined;
  }
};

// Function that handles profile extraction from HubSpot with email fallback
export const handleHubSpotProfileExtraction = async (
  setIsScrapingProfile: (isScrapingProfile: boolean) => void,
  processUsername: (username: string | undefined, metadata?: any) => void,
  setLinkedInProfileFromEmail: (value: string | null | false) => void,
  setExtractedEmail?: (email: string | undefined) => void
): Promise<void> => {
  setIsScrapingProfile(true);
  try {
    // Step 1: First try to extract LinkedIn profile URL from HubSpot page
    const profileUrl = await extractLinkedInProfileFromHubSpot();

    if (profileUrl) {
      const username = getLinkedInUsernameFromUrl(profileUrl);
      processUsername(username);
      return;
    }

    // Step 2: If no LinkedIn profile, try email extraction and ProxyCurl lookup
    const email = await extractEmailFromHubSpot();
    if (email) {
      // Store the extracted email for HubSpot contact matching
      if (setExtractedEmail) {
        setExtractedEmail(email);
      }
      
      const result = await getLinkedInProfileFromEmail(email);

      if (result) {
        const username = getLinkedInUsernameFromUrl(result.url);
        processUsername(username, {
          linkedInUrl: result.url,
          fromEmail: true
        });
        return;
      } else {
      }
    }

    // Step 3: If no email or no LinkedIn profile found via email, try name and company extraction
    const nameAndCompany = await extractNameAndCompanyFromHubSpot();
    
    if (nameAndCompany && (nameAndCompany.first_name || nameAndCompany.last_name)) {
      const result = await getLinkedInProfileFromNameAndCompany(
        nameAndCompany.first_name || '',
        nameAndCompany.last_name || '',
        nameAndCompany.company_name
      );

      if (result) {
        const username = getLinkedInUsernameFromUrl(result.url);
        processUsername(username, {
          linkedInUrl: result.url,
          fromName: true,
          nameData: nameAndCompany
        });
        return;
      } else {
      }
    }

    // Step 4: If all methods failed, mark as not found
    setLinkedInProfileFromEmail(false);
    
  } catch (error) {
    console.error('Error in HubSpot profile extraction with email fallback:', error);
  } finally {
    setIsScrapingProfile(false);
  }
};

// Function to extract first_name, last_name, and company_name from HubSpot page
export const extractNameAndCompanyFromHubSpot = async (): Promise<{
  first_name?: string;
  last_name?: string;
  company_name?: string;
} | undefined> => {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) {
      console.error('No active tab found');
      return undefined;
    }

    const result = await executeScriptInTab(tab.id, async () => {
      const waitForElement = async (
        selector: string,
        timeout = 5000,
      ): Promise<Element | null> => {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
          const element = document.querySelector(selector);
          if (element) return element;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        return null;
      };

      // Try to extract first name
      const firstNameElement = await waitForElement('[data-test-id="first-name"]') || 
                              await waitForElement('[data-field="firstname"]') ||
                              await waitForElement('.first-name') ||
                              await waitForElement('[name="firstname"]');
      
      // Try to extract last name
      const lastNameElement = await waitForElement('[data-test-id="last-name"]') || 
                             await waitForElement('[data-field="lastname"]') ||
                             await waitForElement('.last-name') ||
                             await waitForElement('[name="lastname"]');
      
      // Try to extract company name
      const companyElement = await waitForElement('[data-test-id="company"]') || 
                            await waitForElement('[data-field="company"]') ||
                            await waitForElement('.company') ||
                            await waitForElement('[name="company"]') ||
                            await waitForElement('[data-test-id="associated-company-name"]');

      const first_name = firstNameElement?.textContent?.trim() || 
                        (firstNameElement as HTMLInputElement)?.value?.trim();
      const last_name = lastNameElement?.textContent?.trim() || 
                       (lastNameElement as HTMLInputElement)?.value?.trim();
      const company_name = companyElement?.textContent?.trim() || 
                          (companyElement as HTMLInputElement)?.value?.trim();
      if (first_name || last_name || company_name) {
        return { first_name, last_name, company_name };
      }

      return undefined;
    });

    return result;
  } catch (e) {
    console.error("Error extracting name and company from HubSpot:", e);
    return undefined;
  }
};

// Function to call the backend to resolve name and company to a LinkedIn profile URL
export const getLinkedInProfileFromNameAndCompany = async (
  first_name: string,
  last_name: string,
  company_name?: string
): Promise<{url: string, fromName: boolean} | undefined> => {
  if (!first_name && !last_name) return undefined;

  try {
    const response = await fetch(`${API_URL}/linkedin-profile-from-email/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        first_name, 
        last_name, 
        company_name 
      })
    });

    if (!response.ok) {
      console.error(`API error: ${response.status}`);
      return undefined;
    }

    const data = await response.json();
    const url = data.linkedin_profile_url || data.linkedin_url;
    if (url) {
      return {
        url,
        fromName: true
      };
    }

    return undefined;
  } catch (error) {
    console.error('Error resolving name to LinkedIn profile:', error);
    return undefined;
  }
};