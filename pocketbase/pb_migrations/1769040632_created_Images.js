/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Images = new Collection({
    id: "pb_tkwz9j2iq4zlit0",
    name: "Images",
    type: "base",
    listRule: "User = @request.auth.id",
    viewRule: "User = @request.auth.id",
    createRule: "@request.auth.id != \"\"",
    updateRule: "User = @request.auth.id",
    deleteRule: "User = @request.auth.id",
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
      name: "file",
      type: "file",
      required: true,
    },
    {
      name: "file_hash",
      type: "text",
      required: false,
    },
    {
      name: "image_type",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["item", "container", "unprocessed"],
    },
    {
      name: "analysis_status",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["pending", "processing", "completed", "failed"],
    },
    {
      name: "User",
      type: "relation",
      required: false,
      collectionId: "_pb_users_auth_",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_User_images` ON `images` (`User`)",
    "CREATE INDEX `idx_image_type_images` ON `images` (`image_type`)",
    "CREATE INDEX `idx_analysis_status_images` ON `images` (`analysis_status`)",
    "CREATE INDEX `idx_created_images` ON `images` (`created`)",
  ],
  });

  return app.save(collection_Images);
}, (app) => {
  const collection_Images = app.findCollectionByNameOrId("Images");
  return app.delete(collection_Images);
});
