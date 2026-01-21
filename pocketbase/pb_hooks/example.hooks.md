/// <reference path="../pb_data/types.d.ts" />

// ContainerRecord
//   Container: z.string(),
//   User: z.string(),
//   transaction: z.enum(["create", "update", "delete", "moveIn", "moveOut"]),
//   fieldName: z.string().optional().describe("Name of the field that changed"),
//   newValue: z.string().describe("New value of the changed field"),
//   previousValue: z.string().describe("Previous value of the changed field"),

// Subscribe to Container update events to track field changes
onRecordUpdateRequest((e) => {
    const newRecord = e.record.fresh();
    const prevRecord = e.record.original();

    // Blacklist of fields to ignore
    const blacklist = ["created", "metadata", "notes", "updated", "collectionName", "collectionId"];
    
    // Get the container ID
    const containerId = newRecord.get("id");
    if (containerId) {
      try {
        const collection = $app.findCollectionByNameOrId("ContainerRecords")
        // Get the current user ID
        const userId = e.auth ? e.auth.get("id") : undefined;
        // Get all fields from the record
        const fields = newRecord.publicExport();
        // Compare each field with the previous record
        for (const fieldName in fields) {
          // Skip blacklisted fields
          if (blacklist.indexOf(fieldName) !== -1) {
            continue;
          }

          const currentValue = newRecord.getString(fieldName);
          const previousValue = prevRecord.getString(fieldName);
          // If the field has changed, create a ContainerRecord
          if (currentValue !== previousValue) {
            // Create a new ContainerRecord
            const containerRecord = new Record(collection);
            // Set the fields for the ContainerRecord
            containerRecord.set("Container", containerId);
            containerRecord.set("User", userId);
            containerRecord.set("fieldName", fieldName);
            containerRecord.set("newValue", currentValue);
            containerRecord.set("previousValue", previousValue);

            // Save the ContainerRecord
            $app.save(containerRecord);
            
            console.log("Created ContainerRecord for " + containerId + ", field: " + fieldName);
          }
        }
      } catch (error) {
        console.error("Failed to create ContainerRecord for " + containerId + ":", error);
      }
    }
    // Don't forget to call next() to continue with the record update
    e.next();
  }, "Containers");

// ItemRecord
//   Item: z.string(),
//   User: z.string(),
//   transaction: z.enum(["create", "update", "delete", "checkout", "checkin", "containerChange"]),
//   fieldName: z.string().optional().describe("Name of the field that changed"),
//   newValue: z.string().describe("New value of the changed field"),
//   previousValue: z.string().describe("Previous value of the changed field"),

// Subscribe to Item update events to track field changes
onRecordUpdateRequest((e) => {
    const newRecord = e.record.fresh();
    const prevRecord = e.record.original();
    
    // Blacklist of fields to ignore
    const blacklist = ["created", "metadata", "notes", "updated", "collectionName", "collectionId"];
    // Get the item ID
    const itemId = newRecord.get("id");
    
    if (itemId) {
      try {
        const collection = $app.findCollectionByNameOrId("ItemRecords")
        // Get the current user ID
        const userId = e.auth ? e.auth.get("id") : undefined;
        // Get all fields from the newRecord
        const fields = newRecord.publicExport();
        // Compare each field with the previous newRecord
        for (const fieldName in fields) {
          // Skip blacklisted fields
          if (blacklist.indexOf(fieldName) !== -1) {
            continue;
          }
          
          const currentValue = newRecord.getString(fieldName);
          const previousValue = prevRecord.getString(fieldName);
          
          // If the field has changed, create an ItemRecord
          if (currentValue !== previousValue) {
            // Create a new ItemRecord
            const itemRecord = new Record(collection);
            // Set the fields for the ItemRecord
            itemRecord.set("Item", itemId);
            itemRecord.set("User", userId);
            itemRecord.set("fieldName", fieldName);
            itemRecord.set("newValue", currentValue);
            itemRecord.set("previousValue", previousValue);
            
            // Save the ItemRecord
            $app.save(itemRecord);
            
            console.log("Created ItemRecord for " + itemId + ", field: " + fieldName);
          }
        }
      } catch (error) {
        console.error("Failed to create ItemRecord for " + itemId + ":", error);
      }
    }
    
    // Don't forget to call next() to continue with the record update
    e.next();
  }, "Items");
