/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_hhaki3uf4br5y7k")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_fileHash_image_metadata` ON `ImageMetadata` (`fileHash`)"
    ]
  }, collection)

  // remove field
  collection.fields.removeById("relation83635035")

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_hhaki3uf4br5y7k")

  // update collection data
  unmarshal({
    "indexes": [
      "CREATE UNIQUE INDEX `idx_fileHash_image_metadata` ON `ImageMetadata` (`fileHash`)",
      "CREATE INDEX `idx_image_image_metadata` ON `ImageMetadata` (`ImageRef`)"
    ]
  }, collection)

  // add field
  collection.fields.addAt(3, new Field({
    "cascadeDelete": false,
    "collectionId": "pb_z3gb21s9dht9tr2",
    "hidden": false,
    "id": "relation83635035",
    "maxSelect": 1,
    "minSelect": 0,
    "name": "ImageRef",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "relation"
  }))

  return app.save(collection)
})
