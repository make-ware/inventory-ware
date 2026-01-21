import { useInventory as useInventoryContext } from '@/contexts/inventory-context';

export function useInventory() {
  return useInventoryContext();
}
