'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useUpload } from '@/contexts/upload-context';
import { ImageUpload } from './image-upload';

/**
 * Compact uploader rendered by the inventory layout, so the same drop box is
 * available (and keeps its state) on the item, container and image screens.
 */
export function InventoryUploadBar() {
  const router = useRouter();
  const { queue } = useUpload();

  const [useAIAnalysis, setUseAIAnalysis] = useState(true);
  const [isSystemAIEnabled, setIsSystemAIEnabled] = useState(false);
  const handledUploads = useRef<Set<string>>(new Set());

  // Fetch Config & User Preference
  useEffect(() => {
    const storedPref = localStorage.getItem('inventory_use_ai_analysis');
    const userPref = storedPref === null ? true : storedPref === 'true';

    fetch('/api-next/config')
      .then((res) => res.json())
      .then((data) => {
        setIsSystemAIEnabled(data.isAIEnabled);
        if (!data.isAIEnabled) {
          setUseAIAnalysis(false);
        } else {
          setUseAIAnalysis(userPref);
        }
      })
      .catch(console.error);
  }, []);

  const handleAIToggle = (checked: boolean) => {
    setUseAIAnalysis(checked);
    localStorage.setItem('inventory_use_ai_analysis', String(checked));
  };

  // Watch Upload Queue
  useEffect(() => {
    const newManualCompleted = queue.filter(
      (item) =>
        item.status === 'completed' &&
        item.isManualMode &&
        item.imageId &&
        !handledUploads.current.has(item.id)
    );

    if (newManualCompleted.length > 0) {
      newManualCompleted.forEach((item) => handledUploads.current.add(item.id));

      if (newManualCompleted.length === 1) {
        const imageId = newManualCompleted[0].imageId;
        router.push(`/inventory/images/${imageId}/wizard`);
      } else {
        const firstImageId = newManualCompleted[0].imageId;
        toast.success(`${newManualCompleted.length} images uploaded.`, {
          action: {
            label: 'Label First',
            onClick: () =>
              router.push(`/inventory/images/${firstImageId}/wizard`),
          },
          duration: 5000,
        });
      }
    }
  }, [queue, router]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <ImageUpload isManualMode={!useAIAnalysis} className="flex-1" />
      <div className="flex items-center gap-2 sm:shrink-0">
        <Switch
          id="ai-mode"
          checked={useAIAnalysis}
          onCheckedChange={handleAIToggle}
          disabled={!isSystemAIEnabled}
        />
        <Label
          htmlFor="ai-mode"
          className={cn(
            'text-xs sm:text-sm flex items-center gap-1.5 transition-colors',
            useAIAnalysis ? 'font-semibold' : 'text-muted-foreground'
          )}
        >
          AI Analysis {useAIAnalysis ? '(On)' : '(Off)'}
          {useAIAnalysis && <Sparkles className="h-3.5 w-3.5 text-green-600" />}
        </Label>
      </div>
    </div>
  );
}
