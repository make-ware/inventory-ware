'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/ui/combobox';
import type { CategoryLibrary } from '@project/shared';

export interface BulkEditData {
  category_functional?: string;
  category_specific?: string;
  item_type?: string;
  item_manufacturer?: string;
}

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: (data: BulkEditData) => Promise<void>;
  categories: CategoryLibrary;
}

export function BulkEditDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  categories,
}: BulkEditDialogProps) {
  const [data, setData] = useState<BulkEditData>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    try {
      setIsSubmitting(true);
      // Filter out empty strings to avoid overwriting with empty
      const cleanData: BulkEditData = {};
      if (data.category_functional)
        cleanData.category_functional = data.category_functional;
      if (data.category_specific)
        cleanData.category_specific = data.category_specific;
      if (data.item_type) cleanData.item_type = data.item_type;
      if (data.item_manufacturer)
        cleanData.item_manufacturer = data.item_manufacturer;

      await onConfirm(cleanData);
      onOpenChange(false);
      setData({}); // Reset form
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Items</DialogTitle>
          <DialogDescription>
            Update properties for {selectedCount} selected items. Leave fields
            blank to keep existing values.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="functional" className="text-right">
              Functional
            </Label>
            <div className="col-span-3">
              <Combobox
                options={categories.functional}
                value={data.category_functional}
                onChange={(val) =>
                  setData({ ...data, category_functional: val })
                }
                placeholder="No Change"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="specific" className="text-right">
              Specific
            </Label>
            <div className="col-span-3">
              <Combobox
                options={categories.specific}
                value={data.category_specific}
                onChange={(val) =>
                  setData({ ...data, category_specific: val })
                }
                placeholder="No Change"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Type
            </Label>
            <div className="col-span-3">
              <Combobox
                options={categories.item_type}
                value={data.item_type}
                onChange={(val) => setData({ ...data, item_type: val })}
                placeholder="No Change"
              />
            </div>
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="manufacturer" className="text-right">
              Manufacturer
            </Label>
            <Input
              id="manufacturer"
              value={data.item_manufacturer || ''}
              onChange={(e) =>
                setData({ ...data, item_manufacturer: e.target.value })
              }
              className="col-span-3"
              placeholder="No Change"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update Items'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
