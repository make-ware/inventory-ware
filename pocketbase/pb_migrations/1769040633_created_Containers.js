/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Containers = new Collection({
    id: "pb_w8d7bjt4y2segw8",
    name: "Containers",
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
      name: "container_label",
      type: "text",
      required: true,
      min: 1,
    },
    {
      name: "container_notes",
      type: "text",
      required: false,
    },
    {
      name: "primary_image",
      type: "relation",
      required: false,
      collectionId: "pb_tkwz9j2iq4zlit0",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "primary_image_bbox",
      type: "json",
      required: false,
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
    "CREATE INDEX `idx_User_containers` ON `containers` (`User`)",
    "CREATE INDEX `idx_created_containers` ON `containers` (`created`)",
    "CREATE INDEX `idx_label_containers` ON `containers` (`container_label`)",
  ],
  });

  return app.save(collection_Containers);
}, (app) => {
  const collection_Containers = app.findCollectionByNameOrId("Containers");
  return app.delete(collection_Containers);
});
