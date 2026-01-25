/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_7mbdu2xml9nggre")

  // update field
  collection.fields.addAt(5, new Field({
    "hidden": false,
    "id": "json2139012377",
    "maxSize": 0,
    "name": "boundingBox",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // update field
  collection.fields.addAt(6, new Field({
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

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_7mbdu2xml9nggre")

  // update field
  collection.fields.addAt(6, new Field({
    "hidden": false,
    "id": "json2139012377",
    "maxSize": 0,
    "name": "primaryImageBbox",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "json"
  }))

  // update field
  collection.fields.addAt(5, new Field({
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

  return app.save(collection)
})
