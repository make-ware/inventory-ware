/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ItemImageMappings = new Collection({
    id: "pb_q5p96224s2x97kw",
    name: "ItemImageMappings",
    type: "base",
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\"",
    createRule: "@request.auth.id != \"\"",
    updateRule: "@request.auth.id != \"\"",
    deleteRule: "@request.auth.id != \"\"",
    manageRule: null,
    fields: [
    {
      name: "id",
      type: "text",
      required: true,
      autogeneratePattern: "[a-z0-9]{15}",
      hidden: false,
      id: "text3208210256",
      max: 15,
      min: 15,
      pattern: "^[a-z0-9]+$",
      presentable: false,
      primaryKey: true,
      system: true,
    },
    {
      name: "created",
      type: "autodate",
      required: true,
      hidden: false,
      id: "autodate2990389176",
      onCreate: true,
      onUpdate: false,
      presentable: false,
      system: false,
    },
    {
      name: "updated",
      type: "autodate",
      required: true,
      hidden: false,
      id: "autodate3332085495",
      onCreate: true,
      onUpdate: true,
      presentable: false,
      system: false,
    },
    {
      name: "item",
      type: "relation",
      required: true,
      collectionId: "pb_7b27uzhylt0gqi8",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "image",
      type: "relation",
      required: true,
      collectionId: "pb_tkwz9j2iq4zlit0",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "bounding_box",
      type: "json",
      required: false,
    },
    {
      name: "primary_image_bbox",
      type: "json",
      required: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_item_item_image_mappings` ON `item_image_mappings` (`item`)",
    "CREATE INDEX `idx_image_item_image_mappings` ON `item_image_mappings` (`image`)",
  ],
  });

  return app.save(collection_ItemImageMappings);
}, (app) => {
  const collection_ItemImageMappings = app.findCollectionByNameOrId("ItemImageMappings");
  return app.delete(collection_ItemImageMappings);
});
