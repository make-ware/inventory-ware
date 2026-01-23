'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Trash2, Image as ImageIcon, Copy } from 'lucide-react';
import type { Item, BoundingBox } from '@project/shared';
import { formatCategoryLabel } from '@project/shared';
import { cn } from '@/lib/utils';
import { CroppedImageViewer } from './cropped-image-viewer';

interface ItemCardProps {
  item: Item;
  imageUrl?: string;
  boundingBox?: BoundingBox;
  onEdit?: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  onClick?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function ItemCard({
  item,
  imageUrl,
  boundingBox,
  onEdit,
  onDelete,
  onClone,
  onClick,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: ItemCardProps) {
  const handleClick = () => {
    if (isSelectionMode && onToggleSelect) {
      onToggleSelect();
    } else if (onClick) {
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-md transition-shadow relative',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={handleClick}
    >
      {isSelectionMode && (
        <div
          className="absolute top-2 left-2 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect?.()}
          />
        </div>
      )}
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className={cn('text-lg', isSelectionMode && 'ml-6')}>
            {formatCategoryLabel(item.itemType)}
          </CardTitle>
          {!isSelectionMode && (
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
              {onClone && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClone();
                  }}
                  title="Clone Item"
                >
                  <Copy className="h-4 w-4" />
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
          )}
        </div>
        {item.itemName && (
          <p className="text-sm font-medium text-muted-foreground mt-1">
            {item.itemName}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {imageUrl ? (
          <CroppedImageViewer
            imageUrl={imageUrl}
            boundingBox={boundingBox}
            mode="crop"
            alt={item.itemLabel}
            className="w-full h-32 rounded mb-3 overflow-hidden"
          />
        ) : (
          <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          <Badge variant="outline">
            {formatCategoryLabel(item.categoryFunctional)}
          </Badge>
          <Badge variant="secondary">
            {formatCategoryLabel(item.categorySpecific)}
          </Badge>
        </div>
        {item.itemLabel && (
          <p className="text-xs text-muted-foreground mb-2">
            Label: {item.itemLabel}
          </p>
        )}
        {item.itemManufacturer && (
          <p className="text-sm text-muted-foreground">
            {item.itemManufacturer}
          </p>
        )}
        {item.itemNotes && (
          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
            {item.itemNotes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
