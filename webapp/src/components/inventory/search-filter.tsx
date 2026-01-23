'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Search } from 'lucide-react';
import { formatCategoryLabel } from '@project/shared';

export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  itemType: string[];
}

export interface SearchFilters {
  functional?: string;
  specific?: string;
  itemType?: string;
}

interface SearchFilterProps {
  query: string;
  onQueryChange: (query: string) => void;
  categories: CategoryLibrary;
  selectedFilters: SearchFilters;
  onFilterChange: (filters: SearchFilters) => void;
}

const ALL_VALUE = '__all__';

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
      functional: value === ALL_VALUE ? undefined : value,
    });
  };

  const handleSpecificChange = (value: string) => {
    onFilterChange({
      ...selectedFilters,
      specific: value === ALL_VALUE ? undefined : value,
    });
  };

  const handleItemTypeChange = (value: string) => {
    onFilterChange({
      ...selectedFilters,
      itemType: value === ALL_VALUE ? undefined : value,
    });
  };

  // Build options with "All" option at the top
  const functionalOptions = [
    { label: 'All Categories', value: ALL_VALUE },
    ...categories.functional.map((cat) => ({
      label: formatCategoryLabel(cat),
      value: cat,
    })),
  ];

  const specificOptions = [
    { label: 'All Subcategories', value: ALL_VALUE },
    ...categories.specific.map((cat) => ({
      label: formatCategoryLabel(cat),
      value: cat,
    })),
  ];

  const itemTypeOptions = [
    { label: 'All Types', value: ALL_VALUE },
    ...categories.itemType.map((cat) => ({
      label: formatCategoryLabel(cat),
      value: cat,
    })),
  ];

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
          <Combobox
            options={functionalOptions}
            value={selectedFilters.functional || ALL_VALUE}
            onChange={handleFunctionalChange}
            placeholder="All Categories"
            allowCreate={false}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="specific-filter">Specific Category</Label>
          <Combobox
            options={specificOptions}
            value={selectedFilters.specific || ALL_VALUE}
            onChange={handleSpecificChange}
            placeholder="All Subcategories"
            allowCreate={false}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type-filter">Item Type</Label>
          <Combobox
            options={itemTypeOptions}
            value={selectedFilters.itemType || ALL_VALUE}
            onChange={handleItemTypeChange}
            placeholder="All Types"
            allowCreate={false}
          />
        </div>
      </div>
    </div>
  );
}
