'use client';

/**
 * The print dialog: what to print, a checklist of the records on offer, and
 * a live preview of the first checked one, in the spirit of a system print
 * dialog.
 *
 * It prints either a full-page summary or QR labels for items, containers
 * or images. It is handed a `PrintSource` — an entity and a `load()` — and
 * that is all it knows: whether the records are a selection, a filtered grid
 * or the one record a detail page shows is the caller's business, which is
 * what lets every Print button in the app open this one dialog.
 *
 * The source runs once per opening (the body is remounted with a fresh
 * `session`, which also resets every choice made last time) and every record
 * starts checked. Both jobs go through `usePrint`, so the Print click opens
 * its window before anything is awaited.
 */
import { useMemo, useState } from 'react';
import { ImageOff, Loader2, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  formatPrintLabel,
  usePrint,
  usePrintCandidates,
  usePrintPreview,
} from '@/hooks/use-print';
import { describePrintRecord } from '@/lib/print-sources';
import type { PrintSelection, PrintSource } from '@/lib/print-sources';
import { PRINT_ENTITY_NOUNS } from '@/services/print-summary';
import { DEFAULT_LABEL_FORMAT, LABEL_FORMATS } from '@/services/label-print';
import type { LabelFormat } from '@/services/label-print';

type PrintWhat = 'summary' | 'labels';

export interface PrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: PrintSource;
}

/** A4 at 96dpi, and the width it is drawn at in the preview pane. */
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;
const PREVIEW_WIDTH = 272;
const PAGE_SCALE = PREVIEW_WIDTH / PAGE_WIDTH;

function moreCaption(total: number, noun: string): string | null {
  const more = total - 1;
  return more > 0 ? `+${more} more ${noun}${more === 1 ? '' : 's'}` : null;
}

export function PrintDialog({ open, onOpenChange, source }: PrintDialogProps) {
  // Each opening is a fresh body: a fresh candidates query and fresh choices.
  // The session advances on the open transition itself (state adjusted
  // during render, not in an effect), so the body never renders once under
  // the previous session before switching.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <PrintDialogBody
          key={session}
          session={session}
          source={source}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function PrintDialogBody({
  session,
  source,
  onClose,
}: {
  session: number;
  source: PrintSource;
  onClose: () => void;
}) {
  const { entity } = source;
  const nouns = PRINT_ENTITY_NOUNS[entity];
  const [what, setWhat] = useState<PrintWhat>('summary');
  const [format, setFormat] = useState<LabelFormat>(DEFAULT_LABEL_FORMAT);
  // The ids the user unchecked: everything starts checked, including records
  // that have not loaded yet, without a state write on load.
  const [unchecked, setUnchecked] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const candidates = usePrintCandidates(source, session);
  const records = useMemo(() => candidates.records ?? [], [candidates.records]);

  const selection = useMemo<PrintSelection>(() => {
    const checked = records.filter((record) => !unchecked.has(record.id));
    // The records are the source's entity; the cast restores the pairing the
    // candidates query lost by returning them as one array.
    return { entity, records: checked } as PrintSelection;
  }, [entity, records, unchecked]);
  const checkedCount = selection.records.length;
  const totalCount = records.length;

  const { isPrinting, printSummary, printLabels } = usePrint();
  const preview = usePrintPreview({ selection, what, format });

  const toggle = (id: string, checked: boolean) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = (checked: boolean) =>
    setUnchecked(
      checked ? new Set() : new Set(records.map((record) => record.id))
    );

  const handlePrint = async () => {
    // Each call opens its window synchronously, before its first `await`.
    let ok: boolean;
    if (what === 'summary') {
      ok = await printSummary(selection, {
        title: source.title,
        scope: source.scope,
      });
    } else {
      ok = await printLabels(
        entity,
        selection.records.map((record) => record.id),
        format,
        { onProgress: (current, total) => setProgress({ current, total }) }
      );
      setProgress(null);
    }
    if (ok) onClose();
  };

  const printLabel = !isPrinting
    ? formatPrintLabel(undefined, checkedCount)
    : progress
      ? `Printing label ${progress.current} of ${progress.total}…`
      : 'Printing…';

  const allState =
    totalCount === 0 || checkedCount === 0
      ? false
      : checkedCount === totalCount
        ? true
        : 'indeterminate';

  const renderList = () => {
    if (candidates.isLoading) {
      return (
        <ul data-testid="print-list-loading" className="divide-y">
          {[0, 1, 2].map((n) => (
            <li key={n} className="flex items-center gap-3 px-3 py-2">
              <Skeleton className="size-4 rounded-[4px]" />
              <Skeleton className="size-9 rounded" />
              <Skeleton className="h-4 flex-1" />
            </li>
          ))}
        </ul>
      );
    }
    if (candidates.isError) {
      return (
        <div className="flex flex-col items-center gap-2 px-3 py-6 text-sm">
          <p className="text-destructive">Couldn’t load {nouns.plural}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => candidates.refetch()}
          >
            Retry
          </Button>
        </div>
      );
    }
    if (totalCount === 0) {
      return (
        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
          No {nouns.plural} to print
        </p>
      );
    }
    return (
      <ul className="divide-y">
        {records.map((record) => {
          const row = describePrintRecord(entity, record);
          const id = `print-row-${record.id}`;
          const checked = !unchecked.has(record.id);
          return (
            <li key={record.id}>
              <label
                htmlFor={id}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50"
              >
                <Checkbox
                  id={id}
                  aria-label={row.title}
                  checked={checked}
                  onCheckedChange={(value) => toggle(record.id, value === true)}
                />
                {row.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.imageUrl}
                    alt=""
                    className="size-9 shrink-0 rounded border object-cover"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                    <ImageOff className="size-4" />
                  </div>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {row.title}
                  </span>
                  {row.detail && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.detail}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  };

  const renderPreview = () => {
    if (candidates.isLoading) {
      return (
        <Skeleton
          className="rounded-sm"
          style={{ width: PREVIEW_WIDTH, height: PAGE_HEIGHT * PAGE_SCALE }}
        />
      );
    }
    if (checkedCount === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          {totalCount === 0 ? 'Nothing to print' : 'Nothing selected'}
        </p>
      );
    }
    if (preview.isLoading) {
      return what === 'summary' ? (
        <Skeleton
          className="rounded-sm"
          style={{ width: PREVIEW_WIDTH, height: PAGE_HEIGHT * PAGE_SCALE }}
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

    if (what === 'summary') {
      return (
        <div className="flex flex-col items-center gap-2">
          <div
            className="overflow-hidden rounded-sm bg-white shadow-lg"
            style={{ width: PREVIEW_WIDTH, height: PAGE_HEIGHT * PAGE_SCALE }}
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
          <Caption text={moreCaption(checkedCount, 'page')} />
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col items-center gap-2">
        {preview.svg ? (
          <div
            data-testid="label-preview"
            dangerouslySetInnerHTML={{ __html: preview.svg }}
            className="h-[280px] w-full bg-white shadow-lg [&>svg]:h-full [&>svg]:w-full"
          />
        ) : null}
        <Caption text={moreCaption(checkedCount, 'label')} />
      </div>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Print</DialogTitle>
        <DialogDescription>
          Print a full-page summary or a QR label for each checked{' '}
          {nouns.singular}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_304px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div className="rounded border">
            <div className="flex items-center gap-3 border-b bg-muted/40 px-3 py-2">
              <Checkbox
                aria-label={`Select all ${nouns.plural}`}
                checked={allState}
                disabled={totalCount === 0}
                onCheckedChange={(value) => toggleAll(value === true)}
              />
              <span className="text-sm font-medium" aria-live="polite">
                {checkedCount} of {totalCount} selected
              </span>
            </div>
            <div className="max-h-[40vh] overflow-y-auto">{renderList()}</div>
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
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={handlePrint}
          disabled={checkedCount === 0 || isPrinting}
        >
          {isPrinting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Printer className="mr-2 h-4 w-4" />
          )}
          <span aria-live="polite">{printLabel}</span>
        </Button>
      </DialogFooter>
    </>
  );
}

function Caption({ text }: { text: string | null }) {
  return text ? <p className="text-sm text-muted-foreground">{text}</p> : null;
}
