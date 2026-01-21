/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Items_add_primary_image_bbox_0 = app.findCollectionByNameOrId("pb_p3zq0rcjtgmj5lr") // Items;

  collection_Items_add_primary_image_bbox_0.fields.add(new JSONField({
    name: "primary_image_bbox",
    required: false
  }));

  return app.save(collection_Items_add_primary_image_bbox_0);
}, (app) => {
  const collection_Items_revert_add_primary_image_bbox = app.findCollectionByNameOrId("pb_p3zq0rcjtgmj5lr") // Items;

  collection_Items_revert_add_primary_image_bbox.fields.removeByName("primary_image_bbox");

  return app.save(collection_Items_revert_add_primary_image_bbox);
});
