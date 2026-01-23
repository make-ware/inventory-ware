'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ImageMutator, ItemMutator, ContainerMutator } from '@project/shared';
import type {
  Image,
  Item,
  Container,
  BoundingBox,
  CategoryLibrary,
  ItemInput,
  ContainerInput,
} from '@project/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BoundingBoxEditor } from '@/components/inventory/bounding-box-editor';
import { ItemCreateForm } from '@/components/inventory/item-create-form';
import { ContainerCreateForm } from '@/components/inventory/container-create-form';
import { toast } from 'sonner';
import { Loader2, ArrowLeft, RefreshCw, Box, Package } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

export default function ImageLabelingWizard() {
  const router = useRouter();
  const params = useParams();
  const imageId = params.id as string;
  const { userId } = useAuth();

  const [image, setImage] = useState<Image | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [categories, setCategories] = useState<CategoryLibrary>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for the wizard
  const [selectedBbox, setSelectedBbox] = useState<BoundingBox | undefined>(
    undefined
  );
  const [isEditingBbox, setIsEditingBbox] = useState(false);

  const imageMutator = useMemo(() => new ImageMutator(pb), []);
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load image
      const imageData = await imageMutator.getById(imageId);
      if (!imageData) {
        throw new Error('Image not found');
      }
      setImage(imageData);

      // Load items linked to this image
      const linkedItems = await itemMutator.getList(
        1,
        100,
        `primaryImage="${imageId}"`
      );
      setItems(linkedItems.items);

      // Load containers linked to this image
      const linkedContainers = await containerMutator.getList(
        1,
        100,
        `primaryImage="${imageId}"`
      );
      setContainers(linkedContainers.items);

      // Load categories
      const categoryLibrary = await itemMutator.getDistinctCategories();
      setCategories(categoryLibrary);
    } catch (error) {
      console.error('Failed to load wizard data:', error);
      toast.error('Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [imageId, imageMutator, itemMutator, containerMutator]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getImageUrl = (image: Image): string => {
    return imageMutator.getFileUrl(image);
  };

  const handleBboxSave = (box: BoundingBox) => {
    setSelectedBbox(box);
    setIsEditingBbox(false);
  };

  const handleItemSubmit = async (
    data: Partial<Omit<ItemInput, 'UserRef'>>
  ) => {
    try {
      if (!userId) {
        toast.error('No authenticated user');
        return;
      }
      setIsSubmitting(true);
      await itemMutator.create({
        ...data,
        UserRef: userId,
        primaryImage: imageId,
        primaryImageBbox: selectedBbox,
      } as ItemInput);
      toast.success('Item created successfully');

      // Refresh lists and reset bbox
      const linkedItems = await itemMutator.getList(
        1,
        100,
        `primaryImage="${imageId}"`
      );
      setItems(linkedItems.items);
      setSelectedBbox(undefined);
    } catch (error) {
      console.error('Failed to create item:', error);
      toast.error('Failed to create item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContainerSubmit = async (
    data: Partial<Omit<ContainerInput, 'UserRef'>>
  ) => {
    try {
      if (!userId) {
        toast.error('No authenticated user');
        return;
      }
      setIsSubmitting(true);
      await containerMutator.create({
        ...data,
        UserRef: userId,
        primaryImage: imageId,
        primaryImageBbox: selectedBbox,
      } as ContainerInput);
      toast.success('Container created successfully');

      // Refresh lists and reset bbox
      const linkedContainers = await containerMutator.getList(
        1,
        100,
        `primaryImage="${imageId}"`
      );
      setContainers(linkedContainers.items);
      setSelectedBbox(undefined);
    } catch (error) {
      console.error('Failed to create container:', error);
      toast.error('Failed to create container');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!image) return null;

  return (
    <div className="container mx-auto py-4 sm:py-8 space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={() => router.push('/inventory')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Button>
        <h1 className="text-2xl font-bold">Image Labeling</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-[calc(100vh-12rem)]">
        {/* Left Column: Image / Bbox Editor */}
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Image Source</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0 relative">
            {isEditingBbox ? (
              <BoundingBoxEditor
                imageUrl={getImageUrl(image)}
                initialBox={selectedBbox}
                onSave={handleBboxSave}
                onCancel={() => setIsEditingBbox(false)}
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="relative aspect-square md:aspect-auto md:h-[500px] border rounded-md overflow-hidden bg-muted">
                  <img
                    src={getImageUrl(image)}
                    alt="Source"
                    className="w-full h-full object-contain"
                  />
                  {selectedBbox && (
                    <div
                      className="absolute border-2 border-primary bg-primary/20"
                      style={{
                        left: `${selectedBbox.x * 100}%`,
                        top: `${selectedBbox.y * 100}%`,
                        width: `${selectedBbox.width * 100}%`,
                        height: `${selectedBbox.height * 100}%`,
                      }}
                    />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <Button onClick={() => setIsEditingBbox(true)}>
                    {selectedBbox ? 'Edit Bounding Box' : 'Add Bounding Box'}
                  </Button>
                  {selectedBbox && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedBbox(undefined)}
                    >
                      Clear Box
                    </Button>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Draw a box around the object you want to create. This will be
                  saved with the new item or container.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Column: Creation Tabs */}
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Create Entities</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto min-h-0">
            <Tabs defaultValue="item" className="h-full flex flex-col">
              <TabsList className="w-full">
                <TabsTrigger value="item" className="flex-1">
                  New Item
                </TabsTrigger>
                <TabsTrigger value="container" className="flex-1">
                  New Container
                </TabsTrigger>
                <TabsTrigger value="created" className="flex-1">
                  Created ({items.length + containers.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent
                value="item"
                className="flex-1 mt-4 overflow-y-auto pr-2"
              >
                <ItemCreateForm
                  onSubmit={handleItemSubmit}
                  isSubmitting={isSubmitting}
                  categories={categories}
                  selectedBbox={selectedBbox}
                  primaryImageId={imageId}
                />
              </TabsContent>

              <TabsContent
                value="container"
                className="flex-1 mt-4 overflow-y-auto pr-2"
              >
                <ContainerCreateForm
                  onSubmit={handleContainerSubmit}
                  isSubmitting={isSubmitting}
                  selectedBbox={selectedBbox}
                  primaryImageId={imageId}
                />
              </TabsContent>

              <TabsContent
                value="created"
                className="flex-1 mt-4 overflow-y-auto"
              >
                <div className="space-y-6">
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-2">
                      <Package className="h-4 w-4" /> Items
                    </h3>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground ml-6">
                        No items created yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {items.map((i) => (
                          <div
                            key={i.id}
                            className="flex items-center justify-between p-3 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
                            onClick={() =>
                              router.push(`/inventory/items/${i.id}`)
                            }
                          >
                            <span>{i.itemLabel}</span>
                            {i.primaryImageBbox && (
                              <Box className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-2">
                      <Box className="h-4 w-4" /> Containers
                    </h3>
                    {containers.length === 0 ? (
                      <p className="text-sm text-muted-foreground ml-6">
                        No containers created yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {containers.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center justify-between p-3 bg-muted rounded-md cursor-pointer hover:bg-muted/80"
                            onClick={() =>
                              router.push(`/inventory/containers/${c.id}`)
                            }
                          >
                            <span>{c.containerLabel}</span>
                            {c.primaryImageBbox && (
                              <Box className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
