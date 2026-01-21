'use client';

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import type { Item } from '@project/shared';

interface ItemCardProps {
  item: Item;
  imageUrl?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

export function ItemCard({
  item,
  imageUrl,
  onEdit,
  onDelete,
  onClick,
}: ItemCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-lg">{item.item_label}</CardTitle>
          <div className="flex gap-1">
            {onEdit && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {imageUrl ? (
          <div className="relative w-full h-32 rounded mb-3 overflow-hidden">
            <Image
              src={imageUrl}
              alt={item.item_label}
              fill
              className="object-cover"
              unoptimized
            />
          </div>
        ) : (
          <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          <Badge variant="outline">{item.category_functional}</Badge>
          <Badge variant="secondary">{item.category_specific}</Badge>
          <Badge>{item.item_type}</Badge>
        </div>
        {item.item_manufacturer && (
          <p className="text-sm text-muted-foreground">
            {item.item_manufacturer}
          </p>
        )}
        {item.item_notes && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {item.item_notes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
