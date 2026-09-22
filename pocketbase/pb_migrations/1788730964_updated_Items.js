/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // add field
  collection.fields.addAt(11, new Field({
    "hidden": false,
    "id": "number3517724982",
    "max": null,
    "min": 0,
    "name": "itemValue",
    "onlyInt": false,
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_n7q78k4cjdxwfdf")

  // remove field
  collection.fields.removeById("number3517724982")

  return app.save(collection)
})
