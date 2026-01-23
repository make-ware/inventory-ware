'use client';

import { useState, useEffect } from 'react';
import { useUpload } from '@/contexts/upload-context';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
  XCircle,
  Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UploadTracker() {
  const { queue, clearCompleted } = useUpload();
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-expand when new items are added, and auto-hide completed after some time
  useEffect(() => {
    if (queue.length > 0) {
      // Defer state update to avoid calling setState synchronously in effect
      setTimeout(() => {
        setIsExpanded(true);
      }, 0);
    }
  }, [queue.length]);

  if (queue.length === 0) return null;

  const completedCount = queue.filter(
    (item) => item.status === 'completed'
  ).length;
  const failedCount = queue.filter((item) => item.status === 'failed').length;
  const processingCount = queue.length - completedCount - failedCount;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 shadow-2xl transition-all duration-300">
      <Card className="border-primary/20 bg-background/95 backdrop-blur">
        <div
          className="flex items-center justify-between p-3 cursor-pointer border-b"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {processingCount > 0
                ? `Uploading ${processingCount} items...`
                : 'Uploads complete'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronUp className="h-4 w-4" />
            )}
          </div>
        </div>

        {isExpanded && (
          <CardContent className="p-0 max-h-64 overflow-y-auto">
            <div className="divide-y">
              {queue.map((item) => (
                <div key={item.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate flex-1">
                      {item.fileName}
                    </span>
                    {item.status === 'uploading' && (
                      <div className="flex items-center gap-1 text-[10px] text-blue-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Uploading</span>
                      </div>
                    )}
                    {item.status === 'analyzing' && (
                      <div className="flex items-center gap-1 text-[10px] text-purple-500">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Analyzing</span>
                      </div>
                    )}
                    {item.status === 'completed' && (
                      <CheckCircle className="h-3 w-3 text-green-500" />
                    )}
                    {item.status === 'failed' && (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                  </div>
                  {(item.status === 'uploading' ||
                    item.status === 'analyzing') && (
                    <Progress value={item.progress} className="h-1" />
                  )}
                  {item.error && (
                    <p
                      className="text-[10px] text-red-500 truncate"
                      title={item.error}
                    >
                      {item.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {(completedCount > 0 || failedCount > 0) && (
              <div className="p-2 border-t flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearCompleted();
                  }}
                  className="text-[10px] h-7"
                >
                  Clear Finished
                </Button>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
