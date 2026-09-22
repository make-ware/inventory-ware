'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import type { Item, Container } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import {
  DEFAULT_LABEL_FORMAT,
  PRINT_POPUP_BLOCKED_MESSAGE,
  buildLabelsPrintHtml,
  fetchLabelSvg,
} from '@/services/label-print';
import type { LabelFormat } from '@/services/label-print';

interface LabelGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target?: Item | Container | null;
  targetType: 'item' | 'container';
}

export function LabelGeneratorDialog({
  open,
  onOpenChange,
  target,
  targetType,
}: LabelGeneratorDialogProps) {
  const [format, setFormat] = useState<string>(DEFAULT_LABEL_FORMAT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSvg, setGeneratedSvg] = useState<string | null>(null);

  // Reset state when dialog opens or target changes
  useEffect(() => {
    if (open) {
      setGeneratedSvg(null);
    }
  }, [open, target]);

  const handleGenerate = async () => {
    if (!target) return;
    setIsGenerating(true);
    try {
      const svg = await fetchLabelSvg({
        targetId: target.id,
        targetType,
        format: format as LabelFormat,
        token: pb.authStore.token,
      });
      setGeneratedSvg(svg);
    } catch (error) {
      console.error(error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate label'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!generatedSvg) return;
    const win = window.open('', '_blank');
    if (!win) {
      toast.error(PRINT_POPUP_BLOCKED_MESSAGE);
      return;
    }
    win.document.write(buildLabelsPrintHtml([generatedSvg], format));
    win.document.close();
  };

  const getName = () => {
    if (!target) return '';
    if (targetType === 'item') return (target as Item).itemLabel;
    return (target as Container).containerLabel;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate Label</DialogTitle>
          <DialogDescription>
            Generate a QR label for {getName()}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right text-sm font-medium">Format</label>
            <Select
              value={format}
              onValueChange={(val) => {
                setFormat(val);
                setGeneratedSvg(null);
              }}
            >
              <SelectTrigger className="col-span-3">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="shipping-4x6">
                  Shipping (4&quot; x 6&quot;)
                </SelectItem>
                <SelectItem value="address-30x100">
                  Address (30mm x 100mm)
                </SelectItem>
                <SelectItem value="qr-only">QR Code Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-center min-h-[200px] border rounded bg-gray-50 items-center overflow-hidden p-4">
            {isGenerating ? (
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            ) : generatedSvg ? (
              <div
                dangerouslySetInnerHTML={{ __html: generatedSvg }}
                className="h-[280px] w-full shadow-lg bg-white [&>svg]:h-full [&>svg]:w-full"
              />
            ) : (
              <div className="text-sm text-gray-400">
                Select format and generate preview
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex gap-2">
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {generatedSvg ? 'Regenerate' : 'Generate'}
            </Button>
            <Button
              onClick={handlePrint}
              disabled={!generatedSvg}
              variant="default"
            >
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
