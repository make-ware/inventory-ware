'use client';

import NextImage from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Edit,
  Trash2,
  Image as ImageIcon,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';
import type { Image } from '@project/shared';

interface ImageCardProps {
  image: Image;
  imageUrl: string;
  onEdit?: () => void;
  onDelete?: () => void;
  onClick?: () => void;
  onProcess?: () => void;
  isProcessing?: boolean;
}

export function ImageCard({
  image,
  imageUrl,
  onEdit,
  onDelete,
  onClick,
  onProcess,
  isProcessing = false,
}: ImageCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'processing':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'failed':
        return <XCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'item':
        return 'Item';
      case 'container':
        return 'Container';
      case 'unprocessed':
        return 'Unprocessed';
      default:
        return type;
    }
  };

  const canRequeue = (status: string) => {
    return (
      status === 'pending' || status === 'failed' || status === 'unprocessed'
    );
  };

  const status = image.analysis_status || 'pending';

  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1">Image</CardTitle>
            <Badge
              variant={getStatusColor(status)}
              className="flex items-center gap-1 w-fit"
            >
              {getStatusIcon(status)}
              {status}
            </Badge>
          </div>
          <div className="flex gap-1">
            {onProcess && canRequeue(status) && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  onProcess();
                }}
                disabled={isProcessing}
                title="Process image"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
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
            <NextImage
              src={imageUrl}
              alt="Image"
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="w-full h-32 bg-muted rounded mb-3 flex items-center justify-center">
            <ImageIcon className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-wrap gap-1 mb-2">
          <Badge variant="outline">
            {getTypeLabel(image.image_type || 'unprocessed')}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(image.created).toLocaleDateString()}
        </p>
      </CardContent>
    </Card>
  );
}
