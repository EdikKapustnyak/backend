export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginationData extends PaginationParams {
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const MAX_PER_PAGE = 100;

function parsePositiveInt(value: unknown, defaultValue: number): number {
  if (typeof value !== 'string') return defaultValue;
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return defaultValue;
  return parsed;
}

/**
 * Parses page/perPage from a (loosely typed) query object. perPage is
 * hard-capped at 100 to prevent unbounded queries against MongoDB.
 */
export function parsePaginationParams(query: Record<string, unknown>): PaginationParams {
  const page = parsePositiveInt(query['page'], 1);
  const perPage = Math.min(parsePositiveInt(query['perPage'], 10), MAX_PER_PAGE);
  return { page, perPage };
}

export function calculatePaginationData(
  totalItems: number,
  page: number,
  perPage: number,
): PaginationData {
  const totalPages = Math.ceil(totalItems / perPage);
  return {
    page,
    perPage,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}
