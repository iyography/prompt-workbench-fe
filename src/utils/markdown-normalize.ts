/**
 * Normalizes markdown to plain text format with bold headers
 * Converts all headers to bold text (**Header**), removes list formatting,
 * and strips markdown syntax for consistent display
 * 
 * @param text - The markdown text to normalize
 * @returns The normalized text with headers as bold and all other content as plain text
 */
export function normalizeMarkdownHeaders(text: string): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let normalized = text;

  // Step 1: Convert markdown headers (### Title) to bold text (**Title**)
  // Also handles malformed headers like "### 1. ###" by cleaning trailing hashes and numbers
  const headerPattern = /^(#{1,6})\s+(.+)$/gm;
  normalized = normalized.replace(headerPattern, (match, hashes, headerText) => {
    let cleanText = headerText.trim();
    // Remove existing bold markers if present
    cleanText = cleanText.replace(/^\*\*(.+?)\*\*$/, '$1');
    // Clean up malformed headers like "1. ###" - remove trailing hashes and numbers
    cleanText = cleanText.replace(/\s*#+\s*$/, ''); // Remove trailing hashes
    cleanText = cleanText.replace(/^\d+\.\s*/, ''); // Remove leading number like "1. "
    cleanText = cleanText.trim();
    return `**${cleanText}**`;
  });

  // Step 2: Convert bulleted headers with numbers (* **1. Title:**) to bold text (**Title:**)
  // Pattern matches: * **1. Title:** or - **1. Title:** or * **Title:** (without number)
  const bulletedHeaderPattern = /^[\s]*[-*]\s+\*\*(\d+\.\s*)?(.+?)\*\*:?/gm;
  normalized = normalized.replace(bulletedHeaderPattern, (match, number, headerText) => {
    const cleanText = headerText.trim();
    return `**${cleanText}**`;
  });

  // Step 3: Convert numbered headers (1. **Title:**) to bold text (**Title:**)
  const numberedHeaderPattern = /^[\s]*\d+\.\s+\*\*(.+?)\*\*:?/gm;
  normalized = normalized.replace(numberedHeaderPattern, (match, headerText) => {
    const cleanText = headerText.trim();
    return `**${cleanText}**`;
  });

  // Step 4: Remove all bullet points from content lines (but preserve the text)
  // Match lines that start with * or - (with optional indentation)
  normalized = normalized.replace(/^[\s]*[-*]\s+(.+)$/gm, (match, content) => {
    return content.trim();
  });

  // Step 5: Remove numbered list markers from content lines (1., 2., etc.)
  // Only match if it's at the start of a line and followed by a space
  normalized = normalized.replace(/^[\s]*\d+\.\s+(.+)$/gm, (match, content) => {
    return content.trim();
  });

  // Step 6: Clean up extra blank lines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  // Step 7: Trim each line to remove leading/trailing whitespace
  normalized = normalized.split('\n').map(line => line.trim()).join('\n');

  return normalized;
}

