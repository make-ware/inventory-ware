/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ImageMetadata = new Collection({
    id: "pb_hhaki3uf4br5y7k",
    name: "ImageMetadata",
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
      name: "Image",
      type: "relation",
      required: false,
      collectionId: "pb_z3gb21s9dht9tr2",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "fileHash",
      type: "text",
      required: true,
    },
    {
      name: "metadata",
      type: "json",
      required: true,
    },
    {
      name: "version",
      type: "number",
      required: false,
    },
    {
      name: "imageType",
      type: "select",
      required: false,
      maxSelect: 1,
      values: ["item", "container", "unprocessed"],
    },
  ],
    indexes: [
    "CREATE UNIQUE INDEX `idx_fileHash_image_metadata` ON `ImageMetadata` (`fileHash`)",
    "CREATE INDEX `idx_image_image_metadata` ON `ImageMetadata` (`Image`)",
  ],
  });

  return app.save(collection_ImageMetadata);
}, (app) => {
  const collection_ImageMetadata = app.findCollectionByNameOrId("ImageMetadata");
  return app.delete(collection_ImageMetadata);
});
