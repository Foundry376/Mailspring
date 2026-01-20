const { shell } = require('electron');

/**
 * Represents a parsed unsubscribe option from the List-Unsubscribe header.
 */
export interface UnsubscribeOption {
  type: 'https' | 'http' | 'mailto';
  uri: string;
}

/**
 * Result of an unsubscribe attempt.
 */
export interface UnsubscribeResult {
  success: boolean;
  error?: string;
}

/**
 * Parses the List-Unsubscribe header value according to RFC 2369.
 *
 * The header format is: <uri1>, <uri2>, ...
 * Where each URI is enclosed in angle brackets and separated by commas.
 *
 * Example: "<mailto:unsubscribe@example.com>, <https://example.com/unsub>"
 *
 * @param header - The raw List-Unsubscribe header value
 * @returns An array of parsed unsubscribe options
 */
export function parseListUnsubscribeHeader(header: string): UnsubscribeOption[] {
  if (!header || typeof header !== 'string') {
    return [];
  }

  const options: UnsubscribeOption[] = [];

  // Match URIs enclosed in angle brackets: <...>
  const uriRegex = /<([^>]+)>/g;
  let match: RegExpExecArray | null;

  while ((match = uriRegex.exec(header)) !== null) {
    const uri = match[1].trim();

    if (uri.toLowerCase().startsWith('https://')) {
      options.push({ type: 'https', uri });
    } else if (uri.toLowerCase().startsWith('http://')) {
      options.push({ type: 'http', uri });
    } else if (uri.toLowerCase().startsWith('mailto:')) {
      options.push({ type: 'mailto', uri });
    }
  }

  return options;
}

/**
 * Checks if the List-Unsubscribe-Post header indicates one-click support (RFC 8058).
 *
 * @param listUnsubscribePost - The List-Unsubscribe-Post header value
 * @returns True if one-click unsubscribe is supported
 */
export function supportsOneClick(listUnsubscribePost: string | undefined): boolean {
  if (!listUnsubscribePost) {
    return false;
  }
  // RFC 8058 requires the exact value "List-Unsubscribe=One-Click"
  return listUnsubscribePost.trim() === 'List-Unsubscribe=One-Click';
}

/**
 * Performs a one-click unsubscribe via HTTP POST according to RFC 8058.
 *
 * The request:
 * - Uses POST method
 * - Sends "List-Unsubscribe=One-Click" as the body
 * - Uses application/x-www-form-urlencoded content type
 * - Does not include credentials/cookies
 *
 * @param url - The HTTPS URL to POST to
 * @returns A promise resolving to the result of the unsubscribe attempt
 */
export async function performOneClickUnsubscribe(url: string): Promise<UnsubscribeResult> {
  // RFC 8058 requires HTTPS
  if (!url.toLowerCase().startsWith('https://')) {
    return {
      success: false,
      error: 'One-click unsubscribe requires HTTPS URL',
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'List-Unsubscribe=One-Click',
      // Don't send credentials per RFC 8058
      credentials: 'omit',
      // Don't follow redirects per RFC 8058 recommendation
      redirect: 'error',
    });

    // 2xx responses indicate success
    if (response.ok) {
      return { success: true };
    }

    return {
      success: false,
      error: `Server returned ${response.status}: ${response.statusText}`,
    };
  } catch (err) {
    // Handle redirect errors specifically
    if (err instanceof TypeError && err.message.includes('redirect')) {
      return {
        success: false,
        error: 'Server attempted redirect, which is not allowed for one-click unsubscribe',
      };
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error occurred',
    };
  }
}

/**
 * Opens the composer with a pre-filled unsubscribe email for mailto: links.
 *
 * This allows the user to review the email before sending, as recommended
 * for transparency.
 *
 * @param mailtoUri - The mailto: URI from the List-Unsubscribe header
 */
export function performMailtoUnsubscribe(mailtoUri: string): void {
  if (!mailtoUri.toLowerCase().startsWith('mailto:')) {
    throw new Error('Invalid mailto URI');
  }

  // Use the application's openUrl handler which routes to DraftStore._onHandleMailtoLink
  // This creates a draft and opens it in the composer for user review
  const sanitizedUri = encodeURI(decodeURI(mailtoUri));
  require('@electron/remote').getGlobal('application').openUrl(sanitizedUri);
}

/**
 * Opens the unsubscribe URL in the user's default browser.
 *
 * This is used as a fallback when one-click is not available.
 *
 * @param url - The HTTP/HTTPS URL to open
 */
export function performWebUnsubscribe(url: string): void {
  if (!/^https?:\/\/.+/i.test(url)) {
    throw new Error('Invalid URL');
  }
  shell.openExternal(url);
}

/**
 * Determines the best unsubscribe method based on available options.
 *
 * Priority order:
 * 1. One-click HTTPS (if List-Unsubscribe-Post header present) - instant, no user interaction
 * 2. Mailto - opens composer for user review
 * 3. Regular HTTPS/HTTP - opens in browser
 *
 * @param options - Parsed unsubscribe options from the header
 * @param hasOneClickSupport - Whether List-Unsubscribe-Post header indicates one-click support
 * @returns The best unsubscribe option, or null if none available
 */
export function getBestUnsubscribeOption(
  options: UnsubscribeOption[],
  hasOneClickSupport: boolean
): { option: UnsubscribeOption; method: 'one-click' | 'mailto' | 'web' } | null {
  if (options.length === 0) {
    return null;
  }

  // If one-click is supported, prefer HTTPS URL
  if (hasOneClickSupport) {
    const httpsOption = options.find(o => o.type === 'https');
    if (httpsOption) {
      return { option: httpsOption, method: 'one-click' };
    }
  }

  // Otherwise, prefer mailto (opens composer for user review)
  const mailtoOption = options.find(o => o.type === 'mailto');
  if (mailtoOption) {
    return { option: mailtoOption, method: 'mailto' };
  }

  // Fall back to web (opens in browser)
  const webOption = options.find(o => o.type === 'https' || o.type === 'http');
  if (webOption) {
    return { option: webOption, method: 'web' };
  }

  return null;
}
