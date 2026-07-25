"use client";

export const isPositionsListValid = (positionsList: any[] | null | undefined): boolean => {
  return !!(positionsList && positionsList.length > 0 && positionsList.some(item => item.locations?.position));
};

// CLAUDE-ADDED: Gate for the exact page-count system (useExactPageCount) -- it's only populated for reflowable, non-scroll content, so this returns false (falling back to isPositionsListValid) for FXL/scroll books or while the scan is still running.
export const isExactPageCountValid = (totalPages: number | null | undefined): boolean => {
  return totalPages !== null && totalPages !== undefined && totalPages > 0;
};
