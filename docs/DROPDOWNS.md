# Dropdowns, comboboxes and typeaheads

Three widgets, one decision rule, and a migration recipe for the next picker
that outgrows its list.

## Which widget

| The options are... | Use | Why |
| --- | --- | --- |
| a fixed enum the code owns (sort order, image status, label format) | `components/ui/select.tsx` | Every option fits on screen; a search box would be noise. |
| a small vocabulary the user may extend (item categories) | `components/ui/combobox.tsx` | Client-side filtering over a preloaded array, plus `allowCreate` for minting a new value. |
| a collection that grows with the user's inventory (items, containers, images) | `components/ui/async-combobox.tsx` | Server-side LIKE search, one page at a time, so the widget never depends on how much the user owns. |

The dividing line is **unbounded vs bounded**, not "how many are there right
now". A vocabulary of 40 categories in a preloaded array is fine. A list of
items is not, at any size, because nothing stops it growing.

## Audit

As of this document, 20 pickers exist across the webapp. Exactly one was backed
by an unbounded collection, and it has been migrated.

| Picker | File | Kind | Options source | Search? | Verdict |
| --- | --- | --- | --- | --- | --- |
| Add item to container | `app/inventory/containers/[id]/page.tsx` | `AsyncCombobox` | `ItemMutator.search` | server LIKE | **Migrated** (was a `Select` over every item) |
| Sort (items, containers) | `components/inventory/sort-select.tsx:36` | `Select` ×2 usages | static enum (4) | no | Keep |
| Image type / status filter | `app/inventory/images/page.tsx:262,274` | `Select` ×2 | static enum | no | Keep |
| Label format | `components/inventory/label-generator-dialog.tsx:144` | `Select` | static enum (3) | no | Keep |
| Cleanup action (per row) | `components/inventory/cleanup-prompt-dialog.tsx:211` | `Select` ×N | static enum (3) | no | Keep |
| Category filters ×3 | `components/inventory/search-filter.tsx:103,114,125` | `Combobox` | `getDistinctCategories()` | client | Keep the widget; the *source* is the problem (below) |
| Category fields ×3 | `components/inventory/item-create-form.tsx:165,189,213` | `Combobox` | same | client | Keep |
| Category fields ×3 | `components/inventory/item-update-form.tsx:233,257,281` | `Combobox` | same | client | Keep |
| Bulk-edit categories ×3 | `components/inventory/bulk-edit-dialog.tsx:80,98,114` | `Combobox` | same | client | Keep |
| *(does not exist)* assign a container from the item edit form | — | — | `Containers` | — | Gap — the obvious next `AsyncCombobox` consumer |

### Why the category comboboxes stay client-side

They hold a three-tier vocabulary of roughly 30-90 values, and their
`allowCreate` path lets a user type a value that does not exist yet. Under
server search that free-text path gets worse, not better: every keystroke
becomes a request whose only purpose is to confirm the value is absent. The
widget is not what limits them.

## Known problems found during the audit (not fixed here)

Each of these is a candidate follow-up:

- **`getDistinctCategories` reads the whole collection.** `shared/src/mutators/item.ts:177`
  pulls up to 5000 *full* item records to derive three string arrays, and five
  independent call sites do it: `contexts/inventory-context.tsx`,
  `app/inventory/items/page.tsx`, `app/inventory/items/new/page.tsx`,
  `app/inventory/items/[id]/edit/page.tsx`, `app/inventory/images/[id]/wizard/page.tsx`
  (plus `services/inventory.ts` twice and the CLI). Cheap fix: add `fields` and
  `skipTotal` to `ListQuery`, and consolidate the webapp onto the categories the
  inventory context has already loaded.
- **Other silent 100-row truncations**, the same class of bug the container
  picker had: `app/inventory/containers/[id]/page.tsx` (the container's own item
  list), `app/inventory/items/page.tsx` (client-side paging over a 100-row cap),
  `contexts/inventory-context.tsx` (`getList(1, 500)`). Each looks complete and
  is not.
- **Curated vs raw category split.** The AI prompt sees the curated first 30
  from `getCategoryLibrary()` (`services/inventory.ts:907-926`); the forms see
  the raw unsliced DB values with no fallback. On a fresh install the forms
  offer nothing at all.
- **`search-filter.tsx`'s `__all__` sentinel is unsearchable.** cmdk matches on
  an item's `value`, not its label, so typing "all" hides the "All Categories"
  row.
- **Stale index declaration.** `shared/src/schema/item.ts:142` still declares
  `idx_container_items` on a `container` column; the live schema renamed it to
  `ContainerRef` in `pocketbase/pb_migrations/1769302504_updated_Items.js`.
  Regenerating from this mirror would recreate the wrong index.
- **No boolean filter flags in the CLI.** `FilterFlag` in `cli/src/query/spec.ts`
  is string-valued, so `iw item list --unassigned` cannot be declared without
  extending the spec — the new `hasContainer` filter is webapp-only for now.

## Adding an `AsyncCombobox`

```tsx
const fetchItemPage = useCallback(
  (query: string, page: number) =>
    itemMutator.search(query, {
      page,
      perPage: 25,
      sort: 'itemLabel',
      filters: { hasContainer: false },
    }),
  [itemMutator]
);

<AsyncCombobox<Item>
  value={selected?.id}
  selectedLabel={selected?.itemLabel}
  onChange={(_value, item) => setSelected(item)}
  fetchPage={fetchItemPage}
  queryKey={showAssigned ? 'all' : 'unassigned'}
  resetToken={addNonce}
  getOptionValue={(item) => item.id}
  getOptionLabel={(item) => item.itemLabel}
/>;
```

Four things are easy to get wrong:

1. **`sort` is mandatory.** No mutator overrides `setDefaults()`, so a query
   without `sort` sends none, PocketBase emits no `ORDER BY`, and rows arrive in
   an unspecified order — paging then skips and repeats records as the offset
   moves.
2. **`queryKey` is the refetch signal, not `fetchPage`.** `fetchPage` is read
   from a ref and is deliberately never an effect dependency, so an inline arrow
   is safe. The flip side is that changing the filters it captures does *not*
   refetch on its own: give `queryKey` a different string when they change.
3. **`resetToken` after a mutation.** Adding or removing a record shifts the
   offsets of every page after it. Bumping `resetToken` reloads from page 1,
   which is correct where patching the loaded pages is guesswork.
4. **`selectedLabel` is caller-owned.** The selected record may not be in any
   page the component has loaded, so it cannot look the label up itself.

There is no `allowCreate` and no `perPage`, by design: a free-typed value in a
relation picker is a dangling foreign key, and page size belongs with the
filters and sort inside `fetchPage`.

### cmdk footnotes

Non-obvious behaviours the component works around, recorded so the next change
does not reintroduce them:

- `shouldFilter={false}` is required — filtering already happened on the server.
  It also makes cmdk skip its sort routine, so appended pages keep server order.
- **Do not use `CommandEmpty`.** On that same code path it renders whenever zero
  items are mounted, so it flashes "No results" during every load. The component
  renders explicit status rows instead.
- The **"Load more" footer stays mounted** even on the last page (as a disabled
  "End of results"). cmdk re-selects the first item when the highlighted one
  unmounts and scrolls it into view, so removing the footer would yank the list
  back to the top. `disabled` also keeps it out of arrow navigation until it is
  actually actionable.
- The **IntersectionObserver sentinel is a plain `<div>`**, not a `CommandItem`,
  which would otherwise join arrow navigation. `IntersectionObserver` is read
  inside the effect so a test mock applies, and when it is missing (happy-dom)
  the footer button carries the load.

## Server-side filters

Filters are built in the mutator layer, never in component code — see the
"Filters are built in the mutator layer" section of `CLAUDE.md` and
`docs/PB_FILTERS.md`. `ItemSearchFilters` gained two entries for this picker:

- `hasContainer?: boolean` — `true` emits `ContainerRef!=""`, `false` emits
  `ContainerRef=""`. Gated on `!== undefined`, so `false` is a real filter.
  PocketBase stores a cleared single relation as `""`, not null.
- `excludeContainer?: string` — emits `ContainerRef!="<id>"`, for "move it here"
  pickers that should not offer the container's own contents.

Clauses AND together, so a contradictory pair legitimately matches nothing
rather than being reconciled in the mutator.
