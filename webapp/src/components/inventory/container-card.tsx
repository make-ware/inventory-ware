'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Edit, Trash2, Image as ImageIcon, Package } from 'lucide-react';
import type { Container, BoundingBox } from '@project/shared';
import { CroppedImageViewer } from '../image/cropped-image-viewer';
import { cn } from '@/lib/utils';

interface ContainerCardProps {
  container: Container;
  imageUrl?: string;
  boundingBox?: BoundingBox;
  itemCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export function ContainerCard({
  container,
  imageUrl,
  boundingBox,
  itemCount = 0,
  onEdit,
  onDelete,
  onClick,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}: ContainerCardProps) {
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
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <CardTitle className={cn('text-lg', isSelectionMode && 'ml-6')}>
              {container.containerLabel}
            </CardTitle>
          </div>
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
      </CardHeader>
      <CardContent>
        {imageUrl ? (
          <CroppedImageViewer
            imageUrl={imageUrl}
            boundingBox={boundingBox}
            alt={container.containerLabel}
            className="w-full h-32 rounded mb-3 overflow-hidden"
          />
        ) : (
          <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex items-center justify-between mb-2">
          <Badge variant="secondary" className="flex items-center gap-1">
            <Package className="h-3 w-3" />
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Badge>
        </div>
        {container.containerNotes && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {container.containerNotes}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
