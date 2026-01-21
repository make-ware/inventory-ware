'use client';

import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';

export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  item_type: string[];
}

export interface SearchFilters {
  functional?: string;
  specific?: string;
  item_type?: string;
}

interface SearchFilterProps {
  query: string;
  onQueryChange: (query: string) => void;
  categories: CategoryLibrary;
  selectedFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
}

export function SearchFilter({
  query,
  onQueryChange,
  categories,
  selectedFilters,
  onFilterChange,
}: SearchFilterProps) {
  const handleFunctionalChange = (value: string) => {
    onFilterChange({
      ...selectedFilters,
      functional: value === 'all' ? undefined : value,
    });
  };

  const handleSpecificChange = (value: string) => {
    onFilterChange({
      ...selectedFilters,
      specific: value === 'all' ? undefined : value,
    });
  };

  const handleItemTypeChange = (value: string) => {
    onFilterChange({
      ...selectedFilters,
      item_type: value === 'all' ? undefined : value,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="search-input">Search</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="search-input"
            placeholder="Search items by name, notes, or manufacturer..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="functional-filter">Functional Category</Label>
          <Select
            value={selectedFilters.functional || 'all'}
            onValueChange={handleFunctionalChange}
          >
            <SelectTrigger id="functional-filter" className="w-full">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.functional.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="specific-filter">Specific Category</Label>
          <Select
            value={selectedFilters.specific || 'all'}
            onValueChange={handleSpecificChange}
          >
            <SelectTrigger id="specific-filter" className="w-full">
              <SelectValue placeholder="All Subcategories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subcategories</SelectItem>
              {categories.specific.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="type-filter">Item Type</Label>
          <Select
            value={selectedFilters.item_type || 'all'}
            onValueChange={handleItemTypeChange}
          >
            <SelectTrigger id="type-filter" className="w-full">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {categories.item_type.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
