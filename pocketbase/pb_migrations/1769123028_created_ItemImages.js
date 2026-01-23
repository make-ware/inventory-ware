/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ItemImages = new Collection({
    id: "pb_szysb85h5eigv5y",
    name: "ItemImages",
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
      name: "ItemRef",
      type: "relation",
      required: true,
      collectionId: "pb_n7q78k4cjdxwfdf",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "ImageRef",
      type: "relation",
      required: true,
      collectionId: "pb_z3gb21s9dht9tr2",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "boundingBox",
      type: "json",
      required: false,
    },
  ],
    indexes: [],
  });

  return app.save(collection_ItemImages);
}, (app) => {
  const collection_ItemImages = app.findCollectionByNameOrId("ItemImages");
  return app.delete(collection_ItemImages);
});
