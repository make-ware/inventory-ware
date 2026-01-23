'use client';

import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, Image as ImageIcon, Package } from 'lucide-react';
import type { Container } from '@project/shared';

interface ContainerCardProps {
  container: Container;
  imageUrl?: string;
  itemCount?: number;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
}

export function ContainerCard({
  container,
  imageUrl,
  itemCount = 0,
  onEdit,
  onDelete,
  onClick,
}: ContainerCardProps) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">
              {container.containerLabel}
            </CardTitle>
          </div>
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
              alt={container.containerLabel}
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
