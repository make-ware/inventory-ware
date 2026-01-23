'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export interface ComboboxOption {
  label: string;
  value: string;
}

export interface ComboboxProps {
  options: (string | ComboboxOption)[];
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** When true (default), allows creating new values not in the options list */
  allowCreate?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
}

export function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select option...',
  className,
  disabled = false,
  allowCreate = true,
  ...props
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState('');

  const handleSelect = (currentValue: string) => {
    // currentValue from CommandItem's value is lowered by default if not set explicitly
    // but here we are setting value={opt.value} so it should match the original value
    onChange(currentValue);
    setOpen(false);
  };

  const getLabel = (val?: string) => {
    if (!val) return placeholder;
    const option = options.find((opt) =>
      typeof opt === 'string' ? opt === val : opt.value === val
    );
    if (!option) return val;
    return typeof option === 'string' ? option : option.label;
  };

  const normalizedOptions = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
          disabled={disabled}
          {...props}
        >
          {getLabel(value)}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <div className="flex items-center border-b">
            <CommandInput
              placeholder={`Search ${placeholder.toLowerCase()}...`}
              value={inputValue}
              onValueChange={setInputValue}
              className="border-none"
            />
            {allowCreate && inputValue && (
              <button
                type="button"
                className="mr-2 p-1 rounded-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(inputValue);
                  setOpen(false);
                  setInputValue('');
                }}
                title={`Add "${inputValue}"`}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
          <CommandList>
            <CommandEmpty>
              {allowCreate && inputValue ? (
                <div
                  className="py-2 px-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground rounded-sm"
                  onClick={() => {
                    onChange(inputValue);
                    setOpen(false);
                  }}
                >
                  Create &quot;{inputValue}&quot;
                </div>
              ) : (
                <div className="py-2 px-2 text-sm text-muted-foreground">
                  No results found
                </div>
              )}
            </CommandEmpty>
            <CommandGroup>
              {normalizedOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
