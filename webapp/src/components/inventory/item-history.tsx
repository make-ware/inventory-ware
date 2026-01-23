'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  History,
  Loader2,
  User,
  Image as ImageIcon,
  Package,
  ExternalLink,
} from 'lucide-react';
import pb from '@/lib/pocketbase-client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface ItemHistoryProps {
  itemId: string;
}

interface ItemRecord {
  id: string;
  created: string;
  fieldName?: string;
  newValue: string;
  ItemRef: string;
  expand?: {
    UserRef?: {
      username: string;
      email: string;
      name?: string;
    };
  };
}

export function ItemHistory({ itemId }: ItemHistoryProps) {
  const [records, setRecords] = useState<ItemRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      try {
        setIsLoading(true);
        const result = await pb.collection('ItemRecords').getList(1, 20, {
          filter: `ItemRef = "${itemId}" && transactionType = "update"`,
          sort: '-created',
          expand: 'UserRef',
        });
        setRecords(result.items as unknown as ItemRecord[]);
      } catch (error) {
        console.error('Failed to fetch item history:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();
  }, [itemId]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-4 w-4" />
            Recent Updates
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (records.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-4 w-4" />
          Recent Updates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] pr-4">
          <div className="relative border-l border-border ml-2 space-y-4">
            {records.map((record) => (
              <div key={record.id} className="relative pl-6">
                {/* Timeline Dot */}
                <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border border-primary bg-background ring-4 ring-background" />

                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-medium">
                      {format(new Date(record.created), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>

                  <div className="text-sm font-semibold text-foreground flex items-center gap-2">
                    {getIconForField(record.fieldName)}
                    {formatFieldName(record.fieldName)}
                  </div>

                  <div className="text-sm">
                    {renderNewValue(record)}
                  </div>

                  {record.expand?.UserRef && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {record.expand.UserRef.name ||
                          record.expand.UserRef.username ||
                          'Unknown User'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function getIconForField(fieldName?: string) {
  if (fieldName === 'primaryImage') return <ImageIcon className="h-3.5 w-3.5" />;
  if (fieldName === 'container') return <Package className="h-3.5 w-3.5" />;
  return null;
}

function formatFieldName(fieldName?: string): string {
  // Map technical field names to human-readable ones
  const map: Record<string, string> = {
    itemName: 'Name',
    itemLabel: 'Label',
    itemNotes: 'Notes',
    categoryFunctional: 'Functional Category',
    categorySpecific: 'Specific Category',
    itemType: 'Item Type',
    itemManufacturer: 'Manufacturer',
    itemAttributes: 'Attributes',
    primaryImage: 'Image',
    container: 'Container',
  };
  return map[fieldName || ''] || fieldName || 'Update';
}

function renderNewValue(record: ItemRecord) {
  const { fieldName, newValue, ItemRef } = record;

  if (!newValue && fieldName !== 'container') return <span className="text-muted-foreground italic">(empty)</span>;

  // Handle Image Update
  if (fieldName === 'primaryImage') {
    const imageUrl = pb.files.getUrl({ collectionId: 'Items', id: ItemRef }, newValue);
    return (
      <div className="flex items-center gap-2 mt-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
          <a href={imageUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-3 w-3 mr-1" />
            View Image
          </a>
        </Button>
      </div>
    );
  }

  // Handle Container Update
  if (fieldName === 'container') {
    if (!newValue) return <span className="text-muted-foreground italic">Removed from container</span>;

    return (
      <div className="flex items-center gap-2 mt-1">
        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
          <Link href={`/inventory/containers/${newValue}`}>
            <Package className="h-3 w-3 mr-1" />
            View Container
          </Link>
        </Button>
      </div>
    );
  }

  // Handle Attributes
  if (fieldName === 'itemAttributes') {
    return <span className="text-muted-foreground text-xs italic">Attributes changed</span>;
  }

  // Default Text Display
  const displayValue = newValue.length > 50 ? newValue.substring(0, 50) + '...' : newValue;
  return (
    <div className="text-muted-foreground break-words bg-muted/50 p-1.5 rounded-md text-xs font-mono">
      {displayValue}
    </div>
  );
}
