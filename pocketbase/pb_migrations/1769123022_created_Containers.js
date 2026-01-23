/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Containers = new Collection({
    id: "pb_7mbdu2xml9nggre",
    name: "Containers",
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
      name: "containerLabel",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "containerNotes",
      type: "text",
      required: false,
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
    "CREATE INDEX `idx_UserRef_containers` ON `containers` (`UserRef`)",
    "CREATE INDEX `idx_created_containers` ON `containers` (`created`)",
    "CREATE INDEX `idx_label_containers` ON `containers` (`containerLabel`)",
  ],
  });

  return app.save(collection_Containers);
}, (app) => {
  const collection_Containers = app.findCollectionByNameOrId("Containers");
  return app.delete(collection_Containers);
});
