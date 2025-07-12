// MongoDB migration scripts

// Migration: Add new indexes for performance optimization
db = db.getSiblingDB("rabbitmq_batch_db");

print("Starting database migration...");

try {
    // Add compound indexes for better query performance
    db.somemodels.createIndex({ status: 1, createdAt: -1 }, { name: "status_createdAt_idx" });
    db.somemodels.createIndex({ "data.field1": 1 }, { name: "data_field1_idx" });

    // Add TTL index for automatic cleanup of old job statuses (30 days)
    db.jobstatuses.createIndex({ createdAt: 1 }, { expireAfterSeconds: 2592000, name: "ttl_jobstatuses" });

    // Add unique index for job counters
    db.jobcounters.createIndex({ jobId: 1 }, { unique: true, name: "unique_jobId_idx" });

    // Add text index for search functionality
    db.somemodels.createIndex({ name: "text", "data.field1": "text" }, { name: "text_search_idx" });

    print("✅ All indexes created successfully");

    // Add schema validation (optional)
    db.runCommand({
        collMod: "jobstatuses",
        validator: {
            $jsonSchema: {
                bsonType: "object",
                required: ["correlationId", "status"],
                properties: {
                    correlationId: {
                        bsonType: "string",
                        description: "must be a string and is required",
                    },
                    status: {
                        bsonType: "string",
                        enum: ["pending", "processing", "completed", "failed", "cancelled"],
                        description: "must be a string and is required",
                    },
                    progress: {
                        bsonType: "number",
                        minimum: 0,
                        maximum: 100,
                        description: "must be a number between 0 and 100",
                    },
                    totalItems: {
                        bsonType: "number",
                        minimum: 0,
                        description: "must be a non-negative number",
                    },
                    processedItems: {
                        bsonType: "number",
                        minimum: 0,
                        description: "must be a non-negative number",
                    },
                    jobType: {
                        bsonType: "string",
                        enum: ["migration", "batch"],
                        description: "must be either migration or batch",
                    },
                },
            },
        },
    });

    print("✅ Schema validation added successfully");
} catch (error) {
    print("❌ Migration failed: " + error);
    throw error;
}

print("Database migration completed successfully");
