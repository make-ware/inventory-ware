/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_2w2x4kzxfdx4nis")

  // add field
  //
  // Labels can be printed for images as well as items and containers, and a
  // label record is filed under whichever target it was rendered for.
  collection.fields.addAt(5, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_z3gb21s9dht9tr2",
    "hidden": false,
    "id": "relationimgrefa1",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "ImageRef",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_item_labels` ON `labels` (`ItemRef`)",
      "CREATE INDEX `idx_container_labels` ON `labels` (`ContainerRef`)",
      "CREATE INDEX `idx_image_labels` ON `labels` (`ImageRef`)",
      "CREATE INDEX `idx_created_labels` ON `labels` (`created`)"
    ]
  }, collection)

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_2w2x4kzxfdx4nis")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE INDEX `idx_item_labels` ON `labels` (`ItemRef`)",
      "CREATE INDEX `idx_container_labels` ON `labels` (`ContainerRef`)",
      "CREATE INDEX `idx_created_labels` ON `labels` (`created`)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("relationimgrefa1")

  return app.save(collection)
})
