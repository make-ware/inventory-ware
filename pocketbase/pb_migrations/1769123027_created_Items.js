/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Items = new Collection({
    id: "pb_n7q78k4cjdxwfdf",
    name: "Items",
    type: "base",
    listRule: "UserRef = @request.auth.id",
    viewRule: "UserRef = @request.auth.id",
    createRule: "@request.auth.id != \"\"",
    updateRule: "UserRef = @request.auth.id",
    deleteRule: "UserRef = @request.auth.id",
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
      name: "itemLabel",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "itemName",
      type: "text",
      required: false,
    },
    {
      name: "itemNotes",
      type: "text",
      required: false,
    },
    {
      name: "categoryFunctional",
      type: "text",
      required: true,
    },
    {
      name: "categorySpecific",
      type: "text",
      required: true,
    },
    {
      name: "itemType",
      type: "text",
      required: true,
    },
    {
      name: "itemManufacturer",
      type: "text",
      required: false,
    },
    {
      name: "itemAttributes",
      type: "json",
      required: false,
    },
    {
      name: "container",
      type: "relation",
      required: false,
      collectionId: "pb_7mbdu2xml9nggre",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "primaryImage",
      type: "relation",
      required: false,
      collectionId: "pb_z3gb21s9dht9tr2",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "primaryImageBbox",
      type: "json",
      required: false,
    },
    {
      name: "UserRef",
      type: "relation",
      required: true,
      collectionId: "_pb_users_auth_",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_UserRef_items` ON `items` (`UserRef`)",
    "CREATE INDEX `idx_categoryFunctional_items` ON `items` (`categoryFunctional`)",
    "CREATE INDEX `idx_categorySpecific_items` ON `items` (`categorySpecific`)",
    "CREATE INDEX `idx_itemType_items` ON `items` (`itemType`)",
    "CREATE INDEX `idx_container_items` ON `items` (`container`)",
    "CREATE INDEX `idx_created_items` ON `items` (`created`)",
    "CREATE INDEX `idx_search_items` ON `items` (`itemType`, `itemName`, `itemLabel`)",
  ],
  });

  return app.save(collection_Items);
}, (app) => {
  const collection_Items = app.findCollectionByNameOrId("Items");
  return app.delete(collection_Items);
});
