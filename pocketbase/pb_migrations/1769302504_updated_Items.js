/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_UserRef_items` ON `items` (`UserRef`)",
      "CREATE INDEX `idx_categoryFunctional_items` ON `items` (`categoryFunctional`)",
      "CREATE INDEX `idx_categorySpecific_items` ON `items` (`categorySpecific`)",
      "CREATE INDEX `idx_itemType_items` ON `items` (`itemType`)",
      "CREATE INDEX `idx_container_items` ON `items` (`ContainerRef`)",
      "CREATE INDEX `idx_created_items` ON `items` (`created`)",
      "CREATE INDEX `idx_search_items` ON `items` (`itemType`, `itemName`, `itemLabel`)"
    ]
  }, collection)

  // update field
  collection.fields.addAt(11, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_7mbdu2xml9nggre",
    "hidden": false,
    "id": "relation3349343259",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "ContainerRef",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // update field
  collection.fields.addAt(12, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_z3gb21s9dht9tr2",
    "hidden": false,
    "id": "relation4031382664",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "ImageRef",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // update field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "json2139012377",
    "maxSize": 0,
    "name": "boundingBox",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_UserRef_items` ON `items` (`UserRef`)",
      "CREATE INDEX `idx_categoryFunctional_items` ON `items` (`categoryFunctional`)",
      "CREATE INDEX `idx_categorySpecific_items` ON `items` (`categorySpecific`)",
      "CREATE INDEX `idx_itemType_items` ON `items` (`itemType`)",
      "CREATE INDEX `idx_container_items` ON `items` (`container`)",
      "CREATE INDEX `idx_created_items` ON `items` (`created`)",
      "CREATE INDEX `idx_search_items` ON `items` (`itemType`, `itemName`, `itemLabel`)"
    ]
  }, collection)

  // update field
  collection.fields.addAt(11, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_7mbdu2xml9nggre",
    "hidden": false,
    "id": "relation3349343259",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "container",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // update field
  collection.fields.addAt(12, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_z3gb21s9dht9tr2",
    "hidden": false,
    "id": "relation4031382664",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "primaryImage",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // update field
  collection.fields.addAt(13, new Field({
    "hidden": false,
    "id": "json2139012377",
    "maxSize": 0,
    "name": "primaryImageBbox",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  return app.save(collection)
})
