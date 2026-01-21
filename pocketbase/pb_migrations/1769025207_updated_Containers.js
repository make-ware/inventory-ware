/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Containers_add_primary_image_bbox_0 = app.findCollectionByNameOrId("pb_al4ezg07mp22fyu") // Containers;

  collection_Containers_add_primary_image_bbox_0.fields.add(new JSONField({
    name: "primary_image_bbox",
    required: false
  }));

  return app.save(collection_Containers_add_primary_image_bbox_0);
}, (app) => {
  const collection_Containers_revert_add_primary_image_bbox = app.findCollectionByNameOrId("pb_al4ezg07mp22fyu") // Containers;

  collection_Containers_revert_add_primary_image_bbox.fields.removeByName("primary_image_bbox");

  return app.save(collection_Containers_revert_add_primary_image_bbox);
});
