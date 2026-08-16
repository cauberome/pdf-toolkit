import { SplitParseResult } from './types';

/**
 * Parses user split expression (1-based page numbers) into zero-based index groups.
 * Syntax: Semicolons separate files; commas and hyphens specify pages and ranges.
 * Example: "1-3; 4,6; 7-9"
 */
export function parseSplitExpression(
  expression: string,
  totalPages: number
): SplitParseResult {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      isValid: false,
      error: 'Split expression cannot be empty.',
      groups: [],
      userGroups: [],
    };
  }

  // Split by semicolon for each output document
  const rawGroups = trimmed.split(';');
  const userGroups: number[][] = [];
  const engineGroups: number[][] = [];

  for (let gIdx = 0; gIdx < rawGroups.length; gIdx++) {
    const rawGroup = rawGroups[gIdx].trim();
    if (!rawGroup) {
      return {
        isValid: false,
        error: `Group ${gIdx + 1} is empty. Remove trailing or consecutive semicolons.`,
        groups: [],
        userGroups: [],
      };
    }

    const pageTokens = rawGroup.split(',');
    const groupPages: number[] = [];
    const seenInGroup = new Set<number>();

    for (const rawToken of pageTokens) {
      const token = rawToken.trim();
      if (!token) {
        return {
          isValid: false,
          error: `Empty page entry in group ${gIdx + 1}.`,
          groups: [],
          userGroups: [],
        };
      }

      // Check if it's a range like "1-3"
      if (token.includes('-')) {
        const parts = token.split('-');
        if (parts.length !== 2) {
          return {
            isValid: false,
            error: `Invalid range format "${token}" in group ${gIdx + 1}.`,
            groups: [],
            userGroups: [],
          };
        }

        const startStr = parts[0].trim();
        const endStr = parts[1].trim();

        if (!/^\d+$/.test(startStr) || !/^\d+$/.test(endStr)) {
          return {
            isValid: false,
            error: `Range "${token}" in group ${gIdx + 1} must contain positive integers.`,
            groups: [],
            userGroups: [],
          };
        }

        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);

        if (start === 0 || end === 0) {
          return {
            isValid: false,
            error: `Page numbers are 1-based. Page 0 is invalid (found in "${token}").`,
            groups: [],
            userGroups: [],
          };
        }

        if (start > end) {
          return {
            isValid: false,
            error: `Reversed range "${token}" in group ${gIdx + 1}. Start page (${start}) must be <= end page (${end}).`,
            groups: [],
            userGroups: [],
          };
        }

        if (start > totalPages || end > totalPages) {
          return {
            isValid: false,
            error: `Range "${token}" exceeds document total pages (${totalPages}).`,
            groups: [],
            userGroups: [],
          };
        }

        for (let p = start; p <= end; p++) {
          if (seenInGroup.has(p)) {
            return {
              isValid: false,
              error: `Duplicate page ${p} in group ${gIdx + 1}.`,
              groups: [],
              userGroups: [],
            };
          }
          seenInGroup.add(p);
          groupPages.push(p);
        }
      } else {
        // Single page
        if (!/^\d+$/.test(token)) {
          return {
            isValid: false,
            error: `Invalid page number "${token}" in group ${gIdx + 1}.`,
            groups: [],
            userGroups: [],
          };
        }

        const page = parseInt(token, 10);
        if (page === 0) {
          return {
            isValid: false,
            error: `Page numbers are 1-based. Page 0 is invalid in group ${gIdx + 1}.`,
            groups: [],
            userGroups: [],
          };
        }

        if (page > totalPages) {
          return {
            isValid: false,
            error: `Page ${page} in group ${gIdx + 1} exceeds document total pages (${totalPages}).`,
            groups: [],
            userGroups: [],
          };
        }

        if (seenInGroup.has(page)) {
          return {
            isValid: false,
            error: `Duplicate page ${page} in group ${gIdx + 1}.`,
            groups: [],
            userGroups: [],
          };
        }

        seenInGroup.add(page);
        groupPages.push(page);
      }
    }

    if (groupPages.length === 0) {
      return {
        isValid: false,
        error: `Group ${gIdx + 1} does not specify any pages.`,
        groups: [],
        userGroups: [],
      };
    }

    userGroups.push(groupPages);
    // Convert 1-based page numbers to 0-based page indexes
    engineGroups.push(groupPages.map(p => p - 1));
  }

  return {
    isValid: true,
    groups: engineGroups,
    userGroups,
  };
}

/**
 * Helper to generate "Every Page" split groups
 */
export function generateEveryPageGroups(totalPages: number): SplitParseResult {
  const engineGroups: number[][] = [];
  const userGroups: number[][] = [];

  for (let i = 0; i < totalPages; i++) {
    engineGroups.push([i]);
    userGroups.push([i + 1]);
  }

  return {
    isValid: true,
    groups: engineGroups,
    userGroups,
  };
}
