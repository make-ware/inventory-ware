'use client';

import { useState, useRef, useEffect, MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { type BoundingBox } from '@project/shared';

interface BoundingBoxEditorProps {
  imageUrl: string;
  initialBox?: BoundingBox;
  onSave: (box: BoundingBox) => void;
  onCancel: () => void;
}

export function BoundingBoxEditor({
  imageUrl,
  initialBox,
  onSave,
  onCancel,
}: BoundingBoxEditorProps) {
  const [box, setBox] = useState<BoundingBox | undefined>(initialBox);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(
    null
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const getNormalizedPoint = (e: MouseEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);
    return { x, y };
  };

  const handleMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    const point = getNormalizedPoint(e);
    setStartPoint(point);
    setIsDrawing(true);
    setBox({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDrawing || !startPoint) return;
    e.preventDefault();
    const point = getNormalizedPoint(e);

    const x = Math.min(point.x, startPoint.x);
    const y = Math.min(point.y, startPoint.y);
    const width = Math.abs(point.x - startPoint.x);
    const height = Math.abs(point.y - startPoint.y);

    setBox({ x, y, width, height });
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
    setStartPoint(null);
  };

  const handleSave = () => {
    if (box && box.width > 0 && box.height > 0) {
      onSave(box);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Edit Bounding Box</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!box}>
            Save
          </Button>
        </div>
      </div>

      <div className="relative border rounded-md overflow-hidden bg-muted select-none touch-none">
        <div
          ref={containerRef}
          className="relative cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Editor"
            className="w-full h-auto block max-h-[60vh] object-contain mx-auto"
            draggable={false}
          />

          {box && (
            <div
              className="absolute border-2 border-primary bg-primary/20"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Click and drag to draw a box around the object.
      </p>
    </div>
  );
}
