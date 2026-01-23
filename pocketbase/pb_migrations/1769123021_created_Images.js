/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Images = new Collection({
    id: "pb_z3gb21s9dht9tr2",
    name: "Images",
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
      name: "file",
      type: "file",
      required: true,
    },
    {
      name: "fileHash",
      type: "text",
      required: false,
    },
    {
      name: "imageType",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["item", "container", "unprocessed"],
    },
    {
      name: "analysisStatus",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["pending", "processing", "completed", "failed"],
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
    "CREATE INDEX `idx_UserRef_images` ON `images` (`UserRef`)",
    "CREATE INDEX `idx_imageType_images` ON `images` (`imageType`)",
    "CREATE INDEX `idx_analysisStatus_images` ON `images` (`analysisStatus`)",
    "CREATE INDEX `idx_created_images` ON `images` (`created`)",
  ],
  });

  return app.save(collection_Images);
}, (app) => {
  const collection_Images = app.findCollectionByNameOrId("Images");
  return app.delete(collection_Images);
});
