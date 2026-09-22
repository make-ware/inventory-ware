'use client';

/**
 * The print dialog: options on the left, a live preview of the first page or
 * label on the right, in the spirit of a system print dialog.
 *
 * It prints either a full-page summary (the item PDF export) or QR labels, for
 * either the current selection or the grid's whole filtered set. Every fetch
 * and every window goes through `useItemPdfExport`, so the Print click opens
 * its window before anything is awaited, just like the direct print buttons.
 *
 * Items only for now. `entity` is a prop so containers can follow: labels
 * would pass the containers page's `selectedContainers` and use
 * `targetType: 'container'` (the generate route already accepts it), while
 * Summary would be disabled, since summaries only exist for items.
 */
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useItemPdfExport,
  useItemPrintPreview,
} from '@/hooks/use-item-pdf-export';
import type {
  ExportFilteredOptions,
  PrintScope,
} from '@/hooks/use-item-pdf-export';
import { DEFAULT_LABEL_FORMAT, LABEL_FORMATS } from '@/services/label-print';
import type { LabelFormat } from '@/services/label-print';

type PrintWhat = 'summary' | 'labels';
type PrintApplies = 'selected' | 'filtered';

export interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: 'items';
  /** The current selection, in selection order. */
  selectedIds: string[];
  /** The grid's own query — the same object the list export takes. */
  filteredQuery: ExportFilteredOptions;
}

/** A4 at 96dpi, and the scale it is drawn at in the preview pane. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PAGE_SCALE = 0.42;

function moreCaption(total: number, noun: string): string | null {
  const more = total - 1;
  return more > 0 ? `+${more} more ${noun}${more === 1 ? '' : 's'}` : null;
}

export function PrintDialog({
  open,
  onOpenChange,
  selectedIds,
  filteredQuery,
}: PrintDialogProps) {
  const selectedCount = selectedIds.length;
  const [what, setWhat] = useState<PrintWhat>('summary');
  const [format, setFormat] = useState<LabelFormat>(DEFAULT_LABEL_FORMAT);
  const [applies, setApplies] = useState<PrintApplies>(
    selectedCount > 0 ? 'selected' : 'filtered'
  );
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  // Each opening starts from the selection if there is one. Deliberately
  // keyed on `open` only: a selection change while open is the user's call.
  useEffect(() => {
    if (!open) return;
    setWhat('summary');
    setApplies(selectedCount > 0 ? 'selected' : 'filtered');
    setProgress(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scope = useMemo<PrintScope>(
    () =>
      applies === 'selected'
        ? { kind: 'selected', ids: selectedIds }
        : { kind: 'filtered', query: filteredQuery },
    [applies, selectedIds, filteredQuery]
  );

  const { isExporting, exportSelected, exportFiltered, printLabels } =
    useItemPdfExport();
  const preview = useItemPrintPreview({
    scope,
    what,
    format,
    enabled: open,
  });

  const needsSelection = applies === 'selected' && selectedCount === 0;

  const handlePrint = async () => {
    // Each call opens its window synchronously, before its first `await`.
    let ok: boolean;
    if (what === 'summary') {
      ok =
        scope.kind === 'selected'
          ? await exportSelected(scope.ids)
          : await exportFiltered(scope.query);
    } else {
      ok = await printLabels(scope, format, {
        onProgress: (current, total) => setProgress({ current, total }),
      });
      setProgress(null);
    }
    if (ok) onOpenChange(false);
  };

  const printLabel = !isExporting
    ? 'Print'
    : progress
      ? `Printing label ${progress.current} of ${progress.total}…`
      : 'Printing…';

  const renderPreview = () => {
    if (needsSelection) {
      return <p className="text-sm text-muted-foreground">Nothing selected</p>;
    }
    if (preview.isLoading) {
      return what === 'summary' ? (
        <Skeleton
          className="rounded-sm"
          style={{
            width: PAGE_WIDTH * PAGE_SCALE,
            height: PAGE_HEIGHT * PAGE_SCALE,
          }}
          data-testid="print-preview-loading"
        />
      ) : (
        <Loader2
          className="h-8 w-8 animate-spin text-muted-foreground"
          data-testid="print-preview-loading"
        />
      );
    }
    if (preview.isError) {
      return <p className="text-sm text-destructive">Preview unavailable</p>;
    }
    if (!preview.first) {
      return <p className="text-sm text-muted-foreground">Nothing to print</p>;
    }

    if (what === 'summary') {
      return (
        <div className="flex flex-col items-center gap-2">
          <div
            className="overflow-hidden rounded-sm bg-white shadow-lg"
            style={{
              width: PAGE_WIDTH * PAGE_SCALE,
              height: PAGE_HEIGHT * PAGE_SCALE,
            }}
          >
            <iframe
              title="Summary preview"
              sandbox=""
              srcDoc={preview.previewHtml ?? ''}
              className="pointer-events-none origin-top-left border-0"
              style={{
                width: PAGE_WIDTH,
                height: PAGE_HEIGHT,
                transform: `scale(${PAGE_SCALE})`,
              }}
            />
          </div>
          <Caption text={moreCaption(preview.total, 'page')} />
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center gap-2">
        {preview.svg ? (
          <div
            data-testid="label-preview"
            dangerouslySetInnerHTML={{ __html: preview.svg }}
            className="h-[320px] w-full bg-white shadow-lg [&>svg]:h-full [&>svg]:w-full"
          />
        ) : null}
        <Caption text={moreCaption(preview.total, 'label')} />
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Print</DialogTitle>
          <DialogDescription>
            Print a full-page summary or QR labels.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-4">
            <div className="grid gap-2">
              <label htmlFor="print-what" className="text-sm font-medium">
                What
              </label>
              <Select
                value={what}
                onValueChange={(value) => setWhat(value as PrintWhat)}
              >
                <SelectTrigger id="print-what" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">Summary (full page)</SelectItem>
                  <SelectItem value="labels">Labels</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {what === 'labels' && (
              <div className="grid gap-2">
                <label htmlFor="print-format" className="text-sm font-medium">
                  Format
                </label>
                <Select
                  value={format}
                  onValueChange={(value) => setFormat(value as LabelFormat)}
                >
                  <SelectTrigger id="print-format" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LABEL_FORMATS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <label htmlFor="print-applies" className="text-sm font-medium">
                Applies to
              </label>
              <Select
                value={applies}
                onValueChange={(value) => setApplies(value as PrintApplies)}
              >
                <SelectTrigger id="print-applies" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selected" disabled={selectedCount === 0}>
                    Selected ({selectedCount})
                  </SelectItem>
                  <SelectItem value="filtered">Filtered set</SelectItem>
                </SelectContent>
              </Select>
              {needsSelection && (
                <p className="text-sm text-muted-foreground">
                  Select items first
                </p>
              )}
            </div>
          </div>

          <div
            aria-label="Print preview"
            className="flex min-h-[320px] items-center justify-center overflow-hidden rounded border bg-muted/40 p-4"
          >
            {renderPreview()}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handlePrint}
            disabled={needsSelection || isExporting}
          >
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Printer className="mr-2 h-4 w-4" />
            )}
            <span aria-live="polite">{printLabel}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Caption({ text }: { text: string | null }) {
  return text ? <p className="text-sm text-muted-foreground">{text}</p> : null;
}
