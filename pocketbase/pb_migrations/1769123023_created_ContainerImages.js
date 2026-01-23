/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ContainerImages = new Collection({
    id: "pb_h87s9v6fx5ldlup",
    name: "ContainerImages",
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
      name: "ContainerRef",
      type: "relation",
      required: true,
      collectionId: "pb_7mbdu2xml9nggre",
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

  return app.save(collection_ContainerImages);
}, (app) => {
  const collection_ContainerImages = app.findCollectionByNameOrId("ContainerImages");
  return app.delete(collection_ContainerImages);
});
