/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id": "pb_2w2x4kzxfdx4nis",
    "name": "Labels",
    "type": "base",
    "system": false,
    "listRule": "@request.auth.id != \"\"",
    "viewRule": "@request.auth.id != \"\"",
    "createRule": "@request.auth.id != \"\"",
    "updateRule": null,
    "deleteRule": null,
    "fields": [
    {
      "name": "id",
      "id": "text3208210256",
      "type": "text",
      "required": true,
      "autogeneratePattern": "[a-z0-9]{15}",
      "hidden": false,
      "max": 15,
      "min": 15,
      "pattern": "^[a-z0-9]+$",
      "presentable": false,
      "primaryKey": true,
      "system": true,
    },
    {
      "name": "ItemRef",
      "id": "textcpszxwxhke",
      "type": "relation",
      "required": false,
      "collectionId": "pb_n7q78k4cjdxwfdf",
      "maxSelect": 1,
      "minSelect": 0,
      "cascadeDelete": false,
      "displayFields": null,
    },
    {
      "name": "ContainerRef",
      "id": "textujjhu8wr33",
      "type": "relation",
      "required": false,
      "collectionId": "pb_7mbdu2xml9nggre",
      "maxSelect": 1,
      "minSelect": 0,
      "cascadeDelete": false,
      "displayFields": null,
    },
    {
      "name": "format",
      "id": "textrevy84xy6n",
      "type": "text",
      "required": true,
      "min": 1,
    },
    {
      "name": "data",
      "id": "textwc6npv21vh",
      "type": "text",
      "required": false,
    },
  ],
    "indexes": [
    "CREATE INDEX `idx_item_labels` ON `labels` (`ItemRef`)",
    "CREATE INDEX `idx_container_labels` ON `labels` (`ContainerRef`)",
    "CREATE INDEX `idx_created_labels` ON `labels` (`created`)",
  ],
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_2w2x4kzxfdx4nis") // Labels;
  return app.delete(collection);
});
