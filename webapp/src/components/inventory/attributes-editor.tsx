'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import type { ItemAttribute } from '@project/shared';

interface AttributesEditorProps {
  attributes: ItemAttribute[];
  onChange: (attributes: ItemAttribute[]) => void;
  disabled?: boolean;
}

export function AttributesEditor({
  attributes,
  onChange,
  disabled,
}: AttributesEditorProps) {
  const addAttribute = () => {
    onChange([...attributes, { name: '', value: '' }]);
  };

  const updateAttribute = (
    index: number,
    field: 'name' | 'value',
    value: string
  ) => {
    const updated = [...attributes];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  const removeAttribute = (index: number) => {
    onChange(attributes.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Attributes</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addAttribute}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-1" /> Add Attribute
        </Button>
      </div>
      {attributes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No attributes added yet. Click &quot;Add Attribute&quot; to add
          key-value pairs.
        </p>
      ) : (
        <div className="space-y-2">
          {attributes.map((attr, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                <Input
                  placeholder="Name (e.g., Input Voltage)"
                  value={attr.name}
                  onChange={(e) =>
                    updateAttribute(index, 'name', e.target.value)
                  }
                  disabled={disabled}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Value (e.g., 12.0 Volts)"
                  value={attr.value}
                  onChange={(e) =>
                    updateAttribute(index, 'value', e.target.value)
                  }
                  disabled={disabled}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeAttribute(index)}
                disabled={disabled}
                aria-label="Remove attribute"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
