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
import { type CategoryLibrary, formatCategoryLabel } from '@project/shared';

export interface BulkEditData {
  categoryFunctional?: string;
  categorySpecific?: string;
  itemType?: string;
  itemManufacturer?: string;
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
      if (data.categoryFunctional)
        cleanData.categoryFunctional = data.categoryFunctional;
      if (data.categorySpecific)
        cleanData.categorySpecific = data.categorySpecific;
      if (data.itemType) cleanData.itemType = data.itemType;
      if (data.itemManufacturer)
        cleanData.itemManufacturer = data.itemManufacturer;

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
                options={(categories.functional || []).map((cat) => ({
                  label: formatCategoryLabel(cat),
                  value: cat,
                }))}
                value={data.categoryFunctional}
                onChange={(val) =>
                  setData({ ...data, categoryFunctional: val })
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
                options={(categories.specific || []).map((cat) => ({
                  label: formatCategoryLabel(cat),
                  value: cat,
                }))}
                value={data.categorySpecific}
                onChange={(val) => setData({ ...data, categorySpecific: val })}
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
                options={(categories.itemType || []).map((cat) => ({
                  label: formatCategoryLabel(cat),
                  value: cat,
                }))}
                value={data.itemType}
                onChange={(val) => setData({ ...data, itemType: val })}
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
              value={data.itemManufacturer || ''}
              onChange={(e) =>
                setData({ ...data, itemManufacturer: e.target.value })
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
