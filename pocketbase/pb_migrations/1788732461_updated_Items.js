/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // add field
  collection.fields.addAt(13, new Field({
    "autogeneratePattern": "",
    "hidden": false,
    "id": "text4217000001",
    "max": 3,
    "min": 3,
    "name": "valueCurrency",
    "pattern": "^[A-Z]{3}$",
    "presentable": false,
    "primaryKey": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // remove field
  collection.fields.removeById("text4217000001")

  return app.save(collection)
})
