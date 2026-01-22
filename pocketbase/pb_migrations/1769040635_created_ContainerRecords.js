/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ContainerRecords = new Collection({
    id: "pb_7z270c3wbpxgi6c",
    name: "ContainerRecords",
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
      name: "Container",
      type: "relation",
      required: true,
      collectionId: "pb_w8d7bjt4y2segw8",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
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
    {
      name: "transaction",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["create", "update", "delete"],
    },
    {
      name: "field_name",
      type: "text",
      required: false,
    },
    {
      name: "new_value",
      type: "text",
      required: true,
    },
    {
      name: "previous_value",
      type: "text",
      required: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_container_container_records` ON `container_records` (`container`)",
    "CREATE INDEX `idx_created_container_records` ON `container_records` (`created`)",
  ],
  });

  return app.save(collection_ContainerRecords);
}, (app) => {
  const collection_ContainerRecords = app.findCollectionByNameOrId("ContainerRecords");
  return app.delete(collection_ContainerRecords);
});
