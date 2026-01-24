'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  label?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
  label = 'Search',
}: SearchInputProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label htmlFor="search-input">{label}</Label>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id="search-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
