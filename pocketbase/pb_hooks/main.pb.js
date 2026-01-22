// PocketBase JavaScript Hooks
// Documentation: https://pocketbase.io/docs/js-overview/

// Track Item changes
onRecordAfterCreateSuccess((e) => {
  const collection = $app.findCollectionByNameOrId("ItemRecords");
  const record = new Record(collection);

  record.set("Item", e.record.id);
  record.set("User", e.auth ? e.auth.get("id") : null);
  record.set("transaction", "create");
  record.set("new_value", JSON.stringify(e.record.publicExport()));
  record.set("previous_value", "");

  $app.save(record);
}, "Items");

onRecordUpdateRequest((e) => {
  const newRecord = e.record.fresh();
  const prevRecord = e.record.original();
  const blacklist = ["created", "updated", "collectionName", "collectionId"];
  const itemId = newRecord.get("id");

  if (itemId) {
    try {
      const collection = $app.findCollectionByNameOrId("ItemRecords");
      const userId = e.auth ? e.auth.get("id") : null;
      const fields = newRecord.publicExport();

      for (const field_name in fields) {
        if (blacklist.indexOf(field_name) !== -1) continue;

        const currentValue = newRecord.getString(field_name);
        const previous_value = prevRecord.getString(field_name);

        if (currentValue !== previous_value) {
          const itemRecord = new Record(collection);
          itemRecord.set("Item", itemId);
          itemRecord.set("User", userId);
          itemRecord.set("field_name", field_name);
          itemRecord.set("new_value", currentValue);
          itemRecord.set("previous_value", previous_value);
          itemRecord.set("transaction", "update");

          $app.save(itemRecord);
          console.log("Created ItemRecord for " + itemId + ", field: " + field_name + ", transaction: update");
        }
      }
    } catch (error) {
      console.error("Failed to create ItemRecord for " + itemId + ":", error);
    }
  }
  e.next();
}, "Items");

// Track Container changes
onRecordAfterCreateSuccess((e) => {
  const collection = $app.findCollectionByNameOrId("ContainerRecords");
  const record = new Record(collection);

  record.set("Container", e.record.id);
  record.set("User", e.auth ? e.auth.get("id") : null);
  record.set("transaction", "create");
  record.set("new_value", JSON.stringify(e.record.publicExport()));
  record.set("previous_value", "");

  $app.save(record);
}, "Containers");

onRecordUpdateRequest((e) => {
  const newRecord = e.record.fresh();
  const prevRecord = e.record.original();
  const blacklist = ["created", "updated", "collectionName", "collectionId"];
  const containerId = newRecord.get("id");

  if (containerId) {
    try {
      const collection = $app.findCollectionByNameOrId("ContainerRecords");
      const userId = e.auth ? e.auth.get("id") : null;
      const fields = newRecord.publicExport();

      for (const field_name in fields) {
        if (blacklist.indexOf(field_name) !== -1) continue;

        const currentValue = newRecord.getString(field_name);
        const previous_value = prevRecord.getString(field_name);

        if (currentValue !== previous_value) {
          const containerRecord = new Record(collection);
          containerRecord.set("Container", containerId);
          containerRecord.set("User", userId);
          containerRecord.set("field_name", field_name);
          containerRecord.set("new_value", currentValue);
          containerRecord.set("previous_value", previous_value);
          containerRecord.set("transaction", "update"); // Default for containers

          $app.save(containerRecord);
          console.log("Created ContainerRecord for " + containerId + ", field: " + field_name);
        }
      }
    } catch (error) {
      console.error("Failed to create ContainerRecord for " + containerId + ":", error);
    }
  }
  e.next();
}, "Containers");