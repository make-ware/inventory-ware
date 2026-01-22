/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_ContainerImageMappings = new Collection({
    id: "pb_mp4o965ofbb7h4k",
    name: "ContainerImageMappings",
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
      name: "container",
      type: "relation",
      required: true,
      collectionId: "pb_w8d7bjt4y2segw8",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "image",
      type: "relation",
      required: true,
      collectionId: "pb_tkwz9j2iq4zlit0",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: true,
    },
    {
      name: "bounding_box",
      type: "json",
      required: false,
    },
    {
      name: "primary_image_bbox",
      type: "json",
      required: false,
    },
  ],
    indexes: [
    "CREATE INDEX `idx_container_container_image_mappings` ON `container_image_mappings` (`container`)",
    "CREATE INDEX `idx_image_container_image_mappings` ON `container_image_mappings` (`image`)",
  ],
  });

  return app.save(collection_ContainerImageMappings);
}, (app) => {
  const collection_ContainerImageMappings = app.findCollectionByNameOrId("ContainerImageMappings");
  return app.delete(collection_ContainerImageMappings);
});
