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
  const [format, setFormat] = useState('shipping-4x6');
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
    console.log('Generating label with token:', pb.authStore.token);
    try {
      const res = await fetch('/api/labels/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pb.authStore.token}`,
        },
        body: JSON.stringify({
          targetId: target.id,
          targetType,
          format,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate label');
      const data = await res.json();
      setGeneratedSvg(data.svg);
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate label');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    if (!generatedSvg) return;
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }

    // Determine page size CSS based on format
    let pageStyle = '';
    if (format === 'shipping-4x6') {
      pageStyle = '@page { size: 4in 6in; margin: 0; }';
    } else if (format === 'address-30x100') {
      pageStyle = '@page { size: 100mm 30mm; margin: 0; }';
    }

    win.document.write(`
      <html>
        <head>
          <title>Print Label</title>
          <style>
            ${pageStyle}
            body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }
            svg { max-width: 100%; height: auto; }
            @media print {
              body { display: block; height: auto; }
              svg { max-width: none; width: 100%; height: 100%; }
            }
          </style>
        </head>
        <body>
          ${generatedSvg}
          <script>
            window.onload = () => {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
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
                className="max-h-[300px] max-w-full shadow-lg bg-white"
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
