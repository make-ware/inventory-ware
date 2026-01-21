// PocketBase JavaScript Hooks
// Documentation: https://pocketbase.io/docs/js-overview/

// Example: Custom API endpoint
routerAdd("GET", "/api/hello", (c) => {
  return c.json(200, {
    "message": "Hello from PocketBase!",
    "timestamp": new Date().toISOString()
  })
})

// Example: Validate user registration (before creation)
onRecordCreateRequest((e) => {
  if (e.record.tableName() === "users") {
    // Add custom validation logic here
    console.log("👤 New user registration:", e.record.get("email"))
  }
  e.next()
}, "users")

// Example: Send welcome email after user creation
onRecordCreate((e) => {
  if (e.record.tableName() === "users") {
    // Add email sending logic here
    console.log("📧 Welcome email should be sent to:", e.record.get("email"))
  }
}, "users")

// Track Item changes
onRecordAfterCreateSuccess((e) => {
  const collection = $app.findCollectionByNameOrId("ItemRecords");
  const record = new Record(collection);

  record.set("Item", e.record.id);
  record.set("User", e.auth ? e.auth.id : null);
  record.set("transaction", "create");
  record.set("newValue", JSON.stringify(e.record.publicExport()));
  record.set("previousValue", "");

  $app.dao().saveRecord(record);
}, "items");

onRecordUpdateRequest((e) => {
  const newRecord = e.record.fresh();
  const prevRecord = e.record.original();
  const blacklist = ["created", "updated", "collectionName", "collectionId"];
  const itemId = newRecord.get("id");

  if (itemId) {
    try {
      const collection = $app.findCollectionByNameOrId("ItemRecords");
      const userId = e.auth ? e.auth.id : null;
      const fields = newRecord.publicExport();

      for (const fieldName in fields) {
        if (blacklist.indexOf(fieldName) !== -1) continue;

        const currentValue = newRecord.getString(fieldName);
        const previousValue = prevRecord.getString(fieldName);

        if (currentValue !== previousValue) {
          const itemRecord = new Record(collection);
          itemRecord.set("Item", itemId);
          itemRecord.set("User", userId);
          itemRecord.set("fieldName", fieldName);
          itemRecord.set("newValue", currentValue);
          itemRecord.set("previousValue", previousValue);
          itemRecord.set("transaction", "update");

          $app.dao().saveRecord(itemRecord);
          console.log("Created ItemRecord for " + itemId + ", field: " + fieldName + ", transaction: update");
        }
      }
    } catch (error) {
      console.error("Failed to create ItemRecord for " + itemId + ":", error);
    }
  }
  e.next();
}, "items");

// Track Container changes
onRecordAfterCreateSuccess((e) => {
  const collection = $app.findCollectionByNameOrId("ContainerRecords");
  const record = new Record(collection);

  record.set("Container", e.record.id);
  record.set("User", e.auth ? e.auth.id : null);
  record.set("transaction", "create");
  record.set("newValue", JSON.stringify(e.record.publicExport()));
  record.set("previousValue", "");

  $app.dao().saveRecord(record);
}, "containers");

onRecordUpdateRequest((e) => {
  const newRecord = e.record.fresh();
  const prevRecord = e.record.original();
  const blacklist = ["created", "updated", "collectionName", "collectionId"];
  const containerId = newRecord.get("id");

  if (containerId) {
    try {
      const collection = $app.findCollectionByNameOrId("ContainerRecords");
      const userId = e.auth ? e.auth.id : null;
      const fields = newRecord.publicExport();

      for (const fieldName in fields) {
        if (blacklist.indexOf(fieldName) !== -1) continue;

        const currentValue = newRecord.getString(fieldName);
        const previousValue = prevRecord.getString(fieldName);

        if (currentValue !== previousValue) {
          const containerRecord = new Record(collection);
          containerRecord.set("Container", containerId);
          containerRecord.set("User", userId);
          containerRecord.set("fieldName", fieldName);
          containerRecord.set("newValue", currentValue);
          containerRecord.set("previousValue", previousValue);
          containerRecord.set("transaction", "update"); // Default for containers

          $app.dao().saveRecord(containerRecord);
          console.log("Created ContainerRecord for " + containerId + ", field: " + fieldName);
        }
      }
    } catch (error) {
      console.error("Failed to create ContainerRecord for " + containerId + ":", error);
    }
  }
  e.next();
}, "containers");