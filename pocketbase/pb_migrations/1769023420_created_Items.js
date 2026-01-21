/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Items = new Collection({
    id: "pb_p3zq0rcjtgmj5lr",
    name: "Items",
    type: "base",
    listRule: "",
    viewRule: "",
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
      name: "item_label",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "item_notes",
      type: "text",
      required: false,
    },
    {
      name: "category_functional",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "category_specific",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "item_type",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "item_manufacturer",
      type: "text",
      required: false,
    },
    {
      name: "item_attributes",
      type: "json",
      required: false,
    },
    {
      name: "container",
      type: "relation",
      required: false,
      collectionId: "pb_al4ezg07mp22fyu",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "primary_image",
      type: "relation",
      required: false,
      collectionId: "pb_0tct8klufoespt4",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_category_functional_items` ON `items` (`category_functional`)",
    "CREATE INDEX `idx_category_specific_items` ON `items` (`category_specific`)",
    "CREATE INDEX `idx_item_type_items` ON `items` (`item_type`)",
    "CREATE INDEX `idx_container_items` ON `items` (`container`)",
    "CREATE INDEX `idx_created_items` ON `items` (`created`)",
    "CREATE INDEX `idx_search_items` ON `items` (`item_label`, `category_functional`)",
  ],
  });

  return app.save(collection_Items);
}, (app) => {
  const collection_Items = app.findCollectionByNameOrId("Items");
  return app.delete(collection_Items);
});
