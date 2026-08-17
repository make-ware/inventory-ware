/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pb_z3gb21s9dht9tr2")

  // update field
  //
  // `maxSize: 0` is not "unlimited" - PocketBase falls back to a 5MB per-file
  // default, which silently rejected phone photos with a bare
  // "Failed to create record." 25MB clears any current phone camera while
  // staying under nginx's 150M body limit (docker/nginx.conf).
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file2359244304",
    "maxSelect": 0,
    "maxSize": 26214400,
    "mimeTypes": null,
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_z3gb21s9dht9tr2")

  // revert field
  collection.fields.addAt(3, new Field({
    "hidden": false,
    "id": "file2359244304",
    "maxSelect": 0,
    "maxSize": 0,
    "mimeTypes": null,
    "name": "file",
    "presentable": false,
    "protected": false,
    "required": true,
    "system": false,
    "thumbs": null,
    "type": "file"
  }))

  return app.save(collection)
})
