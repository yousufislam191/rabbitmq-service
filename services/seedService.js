const SomeModel = require("../models/someModel");
const JobStatus = require("../models/jobStatus");
const JobCounter = require("../models/jobCounter");
const QueueService = require("./queueService");
const mongoose = require("mongoose");
const db = require("../config/db");

/**
 * Data Seeding Service
 * Generates and inserts dummy data in bulk for testing purposes
 */
class SeedService {
    /**
     * Check MongoDB connection status
     */
    static async ensureConnection() {
        if (!db.isConnected || mongoose.connection.readyState !== 1) {
            console.log("MongoDB not connected, attempting to reconnect...");
            await db.connect();
        }
    }

    /**
     * Generate random data for SomeModel schema
     */
    static generateSomeModelData(count) {
        const statuses = ["pending", "processing", "success", "failed"];
        const domains = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "company.com"];
        const firstNames = [
            "John",
            "Jane",
            "Michael",
            "Sarah",
            "David",
            "Emily",
            "Chris",
            "Jessica",
            "Daniel",
            "Ashley",
            "Matthew",
            "Amanda",
            "James",
            "Jennifer",
            "Robert",
            "Lisa",
            "William",
            "Karen",
            "Richard",
            "Nancy",
            "Joseph",
            "Betty",
            "Thomas",
            "Helen",
            "Charles",
            "Sandra",
            "Christopher",
            "Donna",
        ];
        const lastNames = [
            "Smith",
            "Johnson",
            "Williams",
            "Brown",
            "Jones",
            "Garcia",
            "Miller",
            "Davis",
            "Rodriguez",
            "Martinez",
            "Hernandez",
            "Lopez",
            "Gonzalez",
            "Wilson",
            "Anderson",
            "Thomas",
            "Taylor",
            "Moore",
            "Jackson",
            "Martin",
            "Lee",
            "Perez",
            "Thompson",
            "White",
            "Harris",
            "Sanchez",
            "Clark",
        ];

        const updateFieldsTemplates = [
            { priority: 1, category: "urgent", department: "sales" },
            { priority: 2, category: "normal", department: "marketing" },
            { priority: 3, category: "low", department: "support" },
            { priority: 4, category: "maintenance", department: "tech" },
            { priority: 5, category: "review", department: "admin" },
        ];

        const data = [];
        for (let i = 0; i < count; i++) {
            const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
            const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
            const domain = domains[Math.floor(Math.random() * domains.length)];
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const updateFields = updateFieldsTemplates[Math.floor(Math.random() * updateFieldsTemplates.length)];

            data.push({
                name: `${firstName} ${lastName}`,
                email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${Math.floor(Math.random() * 1000)}@${domain}`,
                status: status,
                updateFields: {
                    ...updateFields,
                    lastModified: new Date(),
                    version: Math.floor(Math.random() * 10) + 1,
                    notes: `Generated test data for ${firstName} ${lastName}`,
                    metadata: {
                        source: "seed-service",
                        batch: `batch-${Date.now()}`,
                        region: ["US", "EU", "ASIA"][Math.floor(Math.random() * 3)],
                    },
                },
                createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000), // Random date within last 90 days
                updatedAt: new Date(),
            });
        }
        return data;
    }

    /**
     * Generate random data for JobStatus schema
     */
    static generateJobStatusData(count) {
        const statuses = ["pending", "processing", "success", "failed"];
        const data = [];

        for (let i = 0; i < count; i++) {
            const status = statuses[Math.floor(Math.random() * statuses.length)];
            const createdAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000); // Random date within last 30 days
            const completedAt =
                status === "success" || status === "failed"
                    ? new Date(createdAt.getTime() + Math.random() * 24 * 60 * 60 * 1000) // Completed within 24 hours
                    : null;

            data.push({
                correlationId: `job-${Date.now()}-${i.toString().padStart(6, "0")}`,
                status: status,
                createdAt: createdAt,
                completedAt: completedAt,
                totalItems: Math.floor(Math.random() * 1000) + 1,
                error:
                    status === "failed"
                        ? `Random error: ${["Connection timeout", "Database error", "Validation failed", "Memory limit exceeded"][Math.floor(Math.random() * 4)]}`
                        : null,
            });
        }
        return data;
    }

    /**
     * Clear all data from all collections
     */
    static async clearAllData() {
        await this.ensureConnection();

        try {
            console.log("🗑️ Starting to clear all data from database...");
            const startTime = Date.now();

            // Get all collection names
            const collections = await mongoose.connection.db.listCollections().toArray();
            let clearedCollections = 0;
            let totalDocumentsDeleted = 0;

            for (const collection of collections) {
                const collectionName = collection.name;

                // Skip system collections
                if (collectionName.startsWith("system.")) {
                    continue;
                }

                try {
                    // Get document count before deletion
                    const docCount = await mongoose.connection.db.collection(collectionName).countDocuments();

                    // Clear the collection
                    const result = await mongoose.connection.db.collection(collectionName).deleteMany({});

                    totalDocumentsDeleted += result.deletedCount;
                    clearedCollections++;

                    console.log(`🗑️ Cleared collection '${collectionName}': ${result.deletedCount} documents deleted`);
                } catch (collectionError) {
                    console.warn(`⚠️ Failed to clear collection '${collectionName}':`, collectionError.message);
                }
            }

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            console.log(`✅ Successfully cleared ${clearedCollections} collections (${totalDocumentsDeleted} documents) in ${duration}s`);

            return {
                success: true,
                message: `Successfully cleared all data from ${clearedCollections} collections`,
                stats: {
                    collectionsCleared: clearedCollections,
                    documentsDeleted: totalDocumentsDeleted,
                    durationSeconds: duration,
                },
            };
        } catch (error) {
            console.error("❌ Error clearing all data:", error);
            throw new Error(`Failed to clear all data: ${error.message}`);
        }
    }

    /**
     * Insert batch data into specified collection
     */
    static async insertBatchData(collection, totalCount, batchSize, clearExisting = false) {
        await this.ensureConnection();

        try {
            console.log(`📦 Starting batch data insertion for ${collection}...`);
            const startTime = Date.now();

            // Clear existing data if requested
            if (clearExisting) {
                if (collection === "someModel") {
                    const deleteResult = await SomeModel.deleteMany({});
                    console.log(`🗑️ Cleared ${deleteResult.deletedCount} existing documents from ${collection}`);
                } else if (collection === "jobStatus") {
                    const deleteResult = await JobStatus.deleteMany({});
                    console.log(`🗑️ Cleared ${deleteResult.deletedCount} existing documents from ${collection}`);
                }
            }

            let totalInserted = 0;
            const batches = Math.ceil(totalCount / batchSize);

            for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
                const currentBatchSize = Math.min(batchSize, totalCount - totalInserted);
                let batchData;

                // Generate appropriate data based on collection type
                if (collection === "someModel") {
                    batchData = this.generateSomeModelData(currentBatchSize);
                } else if (collection === "jobStatus") {
                    batchData = this.generateJobStatusData(currentBatchSize);
                } else {
                    throw new Error(`Unsupported collection: ${collection}`);
                }

                // Insert batch data
                let result;
                if (collection === "someModel") {
                    result = await SomeModel.insertMany(batchData, { ordered: false });
                } else if (collection === "jobStatus") {
                    result = await JobStatus.insertMany(batchData, { ordered: false });
                }

                totalInserted += result.length;
                console.log(`📦 Batch ${batchIndex + 1}/${batches}: Inserted ${result.length} documents (Total: ${totalInserted})`);

                // Add small delay between batches to prevent overwhelming the database
                if (batchIndex < batches - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 50));
                }
            }

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            console.log(`✅ Successfully inserted ${totalInserted} documents into ${collection} in ${duration}s`);

            return {
                success: true,
                message: `Successfully inserted ${totalInserted} documents into ${collection}`,
                stats: {
                    collection,
                    documentsInserted: totalInserted,
                    batchesProcessed: batches,
                    durationSeconds: duration,
                    documentsPerSecond: Math.round(totalInserted / duration),
                },
            };
        } catch (error) {
            console.error(`❌ Error inserting batch data into ${collection}:`, error);
            throw new Error(`Failed to insert batch data into ${collection}: ${error.message}`);
        }
    }

    /**
     * Fetch data from database and publish to RabbitMQ in batches
     */
    static async fetchAndPublishBatches(collection, batchSize, limit = null, priority = 0, queueType = "processing", filter = {}) {
        await this.ensureConnection();

        try {
            console.log(`🚀 Starting fetch and publish for ${collection}...`);
            const startTime = Date.now();

            // Determine the model to query based on collection type
            let Model;
            if (collection === "someModel") {
                Model = SomeModel;
            } else if (collection === "jobStatus") {
                Model = JobStatus;
            } else {
                throw new Error(`Unsupported collection: ${collection}`);
            }

            // Get total document count with filter
            const totalDocuments = await Model.countDocuments(filter);
            console.log(`📊 Found ${totalDocuments} documents in ${collection} collection`);

            if (totalDocuments === 0) {
                return {
                    success: true,
                    message: `No documents found in ${collection} collection`,
                    stats: {
                        collection,
                        documentsProcessed: 0,
                        batchesPublished: 0,
                        durationSeconds: 0,
                    },
                };
            }

            // Calculate actual limit
            const actualLimit = limit ? Math.min(limit, totalDocuments) : totalDocuments;
            const batchCount = Math.ceil(actualLimit / batchSize);

            console.log(`📦 Will process ${actualLimit} documents in ${batchCount} batches of ${batchSize}`);

            let documentsProcessed = 0;
            let batchesPublished = 0;

            // Process documents in batches
            for (let skip = 0; skip < actualLimit; skip += batchSize) {
                const currentBatchSize = Math.min(batchSize, actualLimit - skip);

                // Fetch batch from database
                const batch = await Model.find(filter).skip(skip).limit(currentBatchSize).lean();

                if (batch.length === 0) break;

                // Prepare message for RabbitMQ
                const message = {
                    batchId: `${collection}_batch_${batchesPublished + 1}`,
                    collection,
                    data: batch,
                    metadata: {
                        batchSize: batch.length,
                        batchNumber: batchesPublished + 1,
                        totalBatches: batchCount,
                        timestamp: new Date().toISOString(),
                    },
                };

                // Publish to appropriate queue
                try {
                    await QueueService.publishBatch(message, {
                        priority,
                        queueType,
                        correlationId: message.batchId,
                        metadata: message.metadata,
                    });
                    documentsProcessed += batch.length;
                    batchesPublished++;

                    console.log(`📨 Published batch ${batchesPublished}/${batchCount} (${batch.length} docs) to ${queueType} queue`);
                } catch (publishError) {
                    console.error(`❌ Failed to publish batch ${batchesPublished + 1}:`, publishError);
                    throw new Error(`Failed to publish batch: ${publishError.message}`);
                }

                // Small delay between batches to prevent overwhelming the queue
                if (skip + batchSize < actualLimit) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            console.log(`✅ Successfully published ${batchesPublished} batches (${documentsProcessed} documents) in ${duration}s`);

            return {
                success: true,
                message: `Successfully published ${documentsProcessed} documents from ${collection} in ${batchesPublished} batches`,
                stats: {
                    collection,
                    documentsProcessed,
                    batchesPublished,
                    durationSeconds: duration,
                    documentsPerSecond: Math.round(documentsProcessed / duration),
                    queueType,
                    priority,
                },
            };
        } catch (error) {
            console.error(`❌ Error in fetch and publish for ${collection}:`, error);
            throw new Error(`Failed to fetch and publish ${collection}: ${error.message}`);
        }
    }
}

module.exports = SeedService;
