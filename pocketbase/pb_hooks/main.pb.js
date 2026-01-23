/* eslint-disable no-undef */
/// <reference path="../pb_data/types.d.ts" />
// PocketBase JavaScript Hooks
// Documentation: https://pocketbase.io/docs/js-overview/
// https://pocketbase.io/docs/js-event-hooks/

// ============================================================================
// ITEMS HOOKS
// ============================================================================

// Track Item creation and create initial image mapping
onRecordAfterCreateSuccess((e) => {
  try {
    const userId = e.auth ? e.auth.get("id") : undefined;
    const recordSnapshot = JSON.stringify(e.record.publicExport());

    // Create audit record inline
    try {
      const auditCollection = $app.findCollectionByNameOrId("ItemRecords");
      if (auditCollection) {
        const auditRecord = new Record(auditCollection);
        auditRecord.set("ItemRef", e.record.id);
        auditRecord.set("transactionType", "create");
        auditRecord.set("fieldName", null);
        auditRecord.set("newValue", recordSnapshot);
        if (userId) {
          auditRecord.set("UserRef", userId);
        }
        $app.save(auditRecord);
      }
    } catch (error) {
      console.error(
        "Failed to create ItemRecords audit record for " + e.record.id + ":",
        error
      );
    }

    // Create image mapping if primaryImage is set
    const primaryImage = e.record.get("primaryImage");
    if (primaryImage) {
      try {
        const mappingCollection = $app.findCollectionByNameOrId("ItemImages");
        if (mappingCollection) {
          const mappingRecord = new Record(mappingCollection);
          mappingRecord.set("ItemRef", e.record.id);
          mappingRecord.set("ImageRef", primaryImage);
          const boundingBox = e.record.get("primaryImageBbox");
          if (boundingBox) {
            mappingRecord.set("boundingBox", boundingBox);
          }
          $app.save(mappingRecord);
        }
      } catch (error) {
        console.error(
          "Failed to create ItemImages mapping for " + e.record.id + ":",
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "Failed to process Item creation for " + e.record.id + ":",
      error
    );
  }
  e.next();
}, "Items");

// Track Item updates and record old image mappings
onRecordAfterUpdateSuccess((e) => {
  try {
    const newRecord = e.record;
    const prevRecord = e.record.original();
    const blacklist = [
      "created",
      "updated",
      "collectionName",
      "collectionId",
      "id",
    ];
    const itemId = newRecord.id;
    const userId = e.auth ? e.auth.get("id") : undefined;
    const fields = newRecord.publicExport();

    // Track field changes for audit
    for (const fieldName in fields) {
      if (blacklist.indexOf(fieldName) !== -1) {
        continue;
      }

      const currentValue = newRecord.getString(fieldName);
      const previousValue = prevRecord.getString(fieldName);

      if (currentValue !== previousValue) {
        // Create audit record inline
        try {
          const auditCollection = $app.findCollectionByNameOrId("ItemRecords");
          if (auditCollection) {
            const auditRecord = new Record(auditCollection);
            auditRecord.set("ItemRef", itemId);
            auditRecord.set("transactionType", "update");
            auditRecord.set("fieldName", fieldName);
            auditRecord.set("newValue", currentValue);
            if (userId) {
              auditRecord.set("UserRef", userId);
            }
            $app.save(auditRecord);
          }
        } catch (error) {
          console.error(
            "Failed to create ItemRecords audit record for " + itemId + ":",
            error
          );
        }
      }
    }

    // Handle primaryImage change - archive the old image
    const newPrimaryImage = newRecord.get("primaryImage");
    const oldPrimaryImage = prevRecord.get("primaryImage");

    if (oldPrimaryImage && newPrimaryImage !== oldPrimaryImage) {
      try {
        const mappingCollection = $app.findCollectionByNameOrId("ItemImages");
        if (mappingCollection) {
          const mappingRecord = new Record(mappingCollection);
          mappingRecord.set("ItemRef", itemId);
          mappingRecord.set("ImageRef", oldPrimaryImage);
          const oldBoundingBox = prevRecord.get("primaryImageBbox");
          if (oldBoundingBox) {
            mappingRecord.set("boundingBox", oldBoundingBox);
          }
          $app.save(mappingRecord);
        }
      } catch (error) {
        console.error(
          "Failed to create ItemImages mapping for " + itemId + ":",
          error
        );
      }
    }
  } catch (error) {
    console.error("Failed to track Item update:", error);
  }
  e.next();
}, "Items");

// ============================================================================
// CONTAINERS HOOKS
// ============================================================================

// Track Container creation and create initial image mapping
onRecordAfterCreateSuccess((e) => {
  try {
    const userId = e.auth ? e.auth.get("id") : undefined;
    const recordSnapshot = JSON.stringify(e.record.publicExport());

    // Create audit record inline
    try {
      const auditCollection = $app.findCollectionByNameOrId("ContainerRecords");
      if (auditCollection) {
        const auditRecord = new Record(auditCollection);
        auditRecord.set("ContainerRef", e.record.id);
        auditRecord.set("transactionType", "create");
        auditRecord.set("fieldName", null);
        auditRecord.set("newValue", recordSnapshot);
        if (userId) {
          auditRecord.set("UserRef", userId);
        }
        $app.save(auditRecord);
      }
    } catch (error) {
      console.error(
        "Failed to create ContainerRecords audit record for " +
          e.record.id +
          ":",
        error
      );
    }

    // Create image mapping if primaryImage is set
    const primaryImage = e.record.get("primaryImage");
    if (primaryImage) {
      try {
        const mappingCollection =
          $app.findCollectionByNameOrId("ContainerImages");
        if (mappingCollection) {
          const mappingRecord = new Record(mappingCollection);
          mappingRecord.set("ContainerRef", e.record.id);
          mappingRecord.set("ImageRef", primaryImage);
          const boundingBox = e.record.get("primaryImageBbox");
          if (boundingBox) {
            mappingRecord.set("boundingBox", boundingBox);
          }
          $app.save(mappingRecord);
        }
      } catch (error) {
        console.error(
          "Failed to create ContainerImages mapping for " + e.record.id + ":",
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "Failed to process Container creation for " + e.record.id + ":",
      error
    );
  }
  e.next();
}, "Containers");

// Track Container updates and record old image mappings
onRecordAfterUpdateSuccess((e) => {
  try {
    const newRecord = e.record;
    const prevRecord = e.record.original();
    const blacklist = [
      "created",
      "updated",
      "collectionName",
      "collectionId",
      "id",
    ];
    const containerId = newRecord.id;
    const userId = e.auth ? e.auth.get("id") : undefined;
    const fields = newRecord.publicExport();

    // Track field changes for audit
    for (const fieldName in fields) {
      if (blacklist.indexOf(fieldName) !== -1) {
        continue;
      }

      const currentValue = newRecord.getString(fieldName);
      const previousValue = prevRecord.getString(fieldName);

      if (currentValue !== previousValue) {
        // Create audit record inline
        try {
          const auditCollection =
            $app.findCollectionByNameOrId("ContainerRecords");
          if (auditCollection) {
            const auditRecord = new Record(auditCollection);
            auditRecord.set("ContainerRef", containerId);
            auditRecord.set("transactionType", "update");
            auditRecord.set("fieldName", fieldName);
            auditRecord.set("newValue", currentValue);
            if (userId) {
              auditRecord.set("UserRef", userId);
            }
            $app.save(auditRecord);
          }
        } catch (error) {
          console.error(
            "Failed to create ContainerRecords audit record for " +
              containerId +
              ":",
            error
          );
        }
      }
    }

    // Handle primaryImage change - archive the old image
    const newPrimaryImage = newRecord.get("primaryImage");
    const oldPrimaryImage = prevRecord.get("primaryImage");

    if (oldPrimaryImage && newPrimaryImage !== oldPrimaryImage) {
      try {
        const mappingCollection =
          $app.findCollectionByNameOrId("ContainerImages");
        if (mappingCollection) {
          const mappingRecord = new Record(mappingCollection);
          mappingRecord.set("ContainerRef", containerId);
          mappingRecord.set("ImageRef", oldPrimaryImage);
          const oldBoundingBox = prevRecord.get("primaryImageBbox");
          if (oldBoundingBox) {
            mappingRecord.set("boundingBox", oldBoundingBox);
          }
          $app.save(mappingRecord);
        }
      } catch (error) {
        console.error(
          "Failed to create ContainerImages mapping for " + containerId + ":",
          error
        );
      }
    }
  } catch (error) {
    console.error("Failed to track Container update:", error);
  }
  e.next();
}, "Containers");

// ============================================================================
// IMAGES HOOKS
// ============================================================================

// Trigger analysis when an image is created
onRecordAfterCreateSuccess((e) => {
  const imageId = e.record.id;
  const userId = e.record.getString('UserRef');
  const secret = $os.getenv('INTERNAL_API_SECRET');

  // Only trigger if we have the secret and userId
  if (secret && userId) {
    try {
      const result = $http.send({
        url: "http://localhost:3000/api-next/analyze-image",
        method: "POST",
        body: JSON.stringify({ imageId: imageId, userId: userId }),
        headers: {
          "content-type": "application/json",
          "x-internal-secret": secret
        },
        timeout: 120 // 2 minutes timeout for analysis
      });

      if (result.statusCode !== 200) {
        console.error("Analysis request failed with status: " + result.statusCode);
      }
    } catch (err) {
      console.error("Failed to trigger analysis for image " + imageId, err);
    }
  } else {
    console.log("Skipping analysis trigger: missing secret or userId");
  }

  e.next();
}, "Images");

// Trigger analysis when image is updated to 'pending' (Reprocessing)
onRecordAfterUpdateSuccess((e) => {
  const newStatus = e.record.getString('analysisStatus');
  const oldStatus = e.record.original().getString('analysisStatus');

  // Only trigger if status changed TO 'pending'
  if (newStatus === 'pending' && oldStatus !== 'pending') {
    const imageId = e.record.id;
    const userId = e.record.getString('UserRef');
    const secret = $os.getenv('INTERNAL_API_SECRET');

    if (secret && userId) {
      try {
        const result = $http.send({
          url: "http://localhost:3000/api-next/analyze-image",
          method: "POST",
          body: JSON.stringify({ imageId: imageId, userId: userId }),
          headers: {
            "content-type": "application/json",
            "x-internal-secret": secret
          },
          timeout: 120
        });

        if (result.statusCode !== 200) {
          console.error("Analysis request failed with status: " + result.statusCode);
        }
      } catch (err) {
        console.error("Failed to re-trigger analysis for image " + imageId, err);
      }
    }
  }
  e.next();
}, "Images");
