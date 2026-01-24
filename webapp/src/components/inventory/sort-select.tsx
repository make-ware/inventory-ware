'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export interface SortOption {
  label: string;
  value: string;
}

interface SortSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SortOption[];
  label?: string;
  className?: string;
}

export function SortSelect({
  value,
  onValueChange,
  options,
  label = 'Sort By',
  className = '',
}: SortSelectProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label>{label}</Label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
