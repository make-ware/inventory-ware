/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const items = app.findCollectionByNameOrId("Items")
  items.fields.add(new Field({
    "hidden": false,
    "id": "number1799100001",
    "name": "estimatedValue",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "number",
  }))
  items.fields.add(new Field({
    "hidden": false,
    "id": "text1799100002",
    "max": 3,
    "min": 3,
    "name": "estimatedCurrency",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text",
  }))
  app.save(items)

  const users = app.findCollectionByNameOrId("Users")
  users.fields.add(new Field({
    "hidden": false,
    "id": "bool1799100003",
    "name": "aiEstimateEnabled",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "bool",
  }))
  users.fields.add(new Field({
    "hidden": false,
    "id": "text1799100004",
    "max": 3,
    "min": 3,
    "name": "aiEstimateCurrency",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text",
  }))
  return app.save(users)
}, (app) => {
  const items = app.findCollectionByNameOrId("Items")
  items.fields.removeByName("estimatedValue")
  items.fields.removeByName("estimatedCurrency")
  app.save(items)

  const users = app.findCollectionByNameOrId("Users")
  users.fields.removeByName("aiEstimateEnabled")
  users.fields.removeByName("aiEstimateCurrency")
  return app.save(users)
})