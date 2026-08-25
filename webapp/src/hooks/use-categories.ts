'use client';

/**
 * TanStack Query binding for the category library.
 *
 * The library is the set of distinct `categoryFunctional` / `categorySpecific`
 * / `itemType` values already in use, and it backs every category control in
 * the app: the items page filter selects and the combobox suggestions on the
 * create and edit forms. It is deliberately one query for all of them — the
 * values are the same everywhere, so sharing `qk.categories(userId)` means
 * moving between those screens reuses the cached answer instead of rescanning
 * the collection each time.
 *
 * Note this is the *uncapped* list, from `ItemMutator.getDistinctCategories()`.
 * `inventoryService.getCategoryLibrary()` is a different thing that happens to
 * share the type: it trims to `MAX_CATEGORY_EXAMPLES` and substitutes the
 * curated vocabulary for an empty tier, because it feeds a prompt rather than a
 * dropdown. A dropdown wants every value the user has actually used and nothing
 * they have not, so the UI reads the raw distinct values.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ItemMutator } from '@project/shared';
import type { CategoryLibrary } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import { qk } from '@/lib/query';

const EMPTY_CATEGORIES: CategoryLibrary = {
  functional: [],
  specific: [],
  itemType: [],
};

/**
 * The distinct category values, for filter selects and combobox suggestions.
 *
 * Scanning the collection is the expensive part, and the answer only moves when
 * an item is created, edited or deleted — none of which happen while a dropdown
 * is open — so this holds a longer `staleTime` than the client default. Writes
 * invalidate `qk.categoriesPrefix()` rather than waiting it out.
 */
export function useCategoryLibrary(userId: string | null) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const query = useQuery({
    queryKey: qk.categories(userId ?? ''),
    queryFn: () => itemMutator.getDistinctCategories(),
    enabled: !!userId,
    staleTime: 60_000,
  });

  return {
    categories: query.data ?? EMPTY_CATEGORIES,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    isError: query.isError,
  };
}
