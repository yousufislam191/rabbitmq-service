const SomeModel = require("../models/someModel");
const JobStatus = require("../models/jobStatus");
const JobCounter = require("../models/jobCounter");
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
     * Seed SomeModel collection with dummy data
     */
    static async seedSomeModel(count = 1000, options = {}) {
        try {
            // Ensure MongoDB connection is active
            await this.ensureConnection();

            const { clearExisting = false, batchSize = 1000 } = options;

            console.log(`Starting to seed SomeModel with ${count} documents...`);

            // Clear existing data if requested
            if (clearExisting) {
                console.log("Clearing existing SomeModel data...");
                await SomeModel.deleteMany({});
                console.log("Existing data cleared.");
            }

            const startTime = Date.now();
            let totalInserted = 0;

            // Insert data in batches for better performance
            for (let i = 0; i < count; i += batchSize) {
                const batchCount = Math.min(batchSize, count - i);
                const batchData = this.generateSomeModelData(batchCount);

                console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}: ${batchCount} documents...`);
                const result = await SomeModel.insertMany(batchData, { ordered: false });
                totalInserted += result.length;

                console.log(`Batch inserted: ${result.length} documents`);
            }

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            console.log(`Seeding completed! Inserted ${totalInserted} documents in ${duration} seconds`);

            return {
                success: true,
                message: `Successfully seeded ${totalInserted} documents`,
                stats: {
                    documentsInserted: totalInserted,
                    durationSeconds: duration,
                    documentsPerSecond: Math.round(totalInserted / duration),
                    collection: "SomeModel",
                },
            };
        } catch (error) {
            console.error("Error seeding SomeModel:", error);
            throw new Error(`Failed to seed SomeModel: ${error.message}`);
        }
    }

    /**
     * Seed JobStatus collection with dummy data
     */
    static async seedJobStatus(count = 100, options = {}) {
        try {
            // Ensure MongoDB connection is active
            await this.ensureConnection();

            const { clearExisting = false, batchSize = 500 } = options;

            console.log(`Starting to seed JobStatus with ${count} documents...`);

            if (clearExisting) {
                console.log("Clearing existing JobStatus data...");
                await JobStatus.deleteMany({});
                console.log("Existing JobStatus data cleared.");
            }

            const startTime = Date.now();
            let totalInserted = 0;

            for (let i = 0; i < count; i += batchSize) {
                const batchCount = Math.min(batchSize, count - i);
                const batchData = this.generateJobStatusData(batchCount);

                const result = await JobStatus.insertMany(batchData, { ordered: false });
                totalInserted += result.length;
            }

            const endTime = Date.now();
            const duration = (endTime - startTime) / 1000;

            return {
                success: true,
                message: `Successfully seeded ${totalInserted} job status documents`,
                stats: {
                    documentsInserted: totalInserted,
                    durationSeconds: duration,
                    documentsPerSecond: Math.round(totalInserted / duration),
                    collection: "JobStatus",
                },
            };
        } catch (error) {
            console.error("Error seeding JobStatus:", error);
            throw new Error(`Failed to seed JobStatus: ${error.message}`);
        }
    }

    /**
     * Seed all collections with dummy data
     */
    static async seedAll(options = {}) {
        try {
            const { someModelCount = 1000, jobStatusCount = 100, clearExisting = false, batchSize = 1000 } = options;

            console.log("Starting comprehensive data seeding...");
            const startTime = Date.now();
            const results = [];

            // Seed SomeModel
            const someModelResult = await this.seedSomeModel(someModelCount, { clearExisting, batchSize });
            results.push(someModelResult);

            // Seed JobStatus
            const jobStatusResult = await this.seedJobStatus(jobStatusCount, { clearExisting, batchSize: 500 });
            results.push(jobStatusResult);

            // Initialize JobCounter if it doesn't exist
            await JobCounter.findOneAndUpdate({ name: "migration" }, { $setOnInsert: { seq: 0 } }, { upsert: true });

            const endTime = Date.now();
            const totalDuration = (endTime - startTime) / 1000;

            return {
                success: true,
                message: "All collections seeded successfully",
                results: results,
                summary: {
                    totalDurationSeconds: totalDuration,
                    totalDocuments: someModelCount + jobStatusCount,
                    collections: ["SomeModel", "JobStatus", "JobCounter"],
                },
            };
        } catch (error) {
            console.error("Error in comprehensive seeding:", error);
            throw new Error(`Failed to seed all collections: ${error.message}`);
        }
    }

    /**
     * Get collection statistics
     */
    static async getCollectionStats() {
        try {
            // Ensure MongoDB connection is active
            await this.ensureConnection();

            const someModelCount = await SomeModel.countDocuments();
            const someModelByStatus = await SomeModel.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);

            const jobStatusCount = await JobStatus.countDocuments();
            const jobStatusByStatus = await JobStatus.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]);

            const jobCounterCount = await JobCounter.countDocuments();

            return {
                success: true,
                stats: {
                    SomeModel: {
                        total: someModelCount,
                        byStatus: someModelByStatus,
                    },
                    JobStatus: {
                        total: jobStatusCount,
                        byStatus: jobStatusByStatus,
                    },
                    JobCounter: {
                        total: jobCounterCount,
                    },
                },
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error("Error getting collection stats:", error);
            throw new Error(`Failed to get collection stats: ${error.message}`);
        }
    }

    /**
     * Clear all test data
     */
    static async clearAllData() {
        try {
            // Ensure MongoDB connection is active
            await this.ensureConnection();

            console.log("Clearing all test data...");

            const someModelResult = await SomeModel.deleteMany({});
            const jobStatusResult = await JobStatus.deleteMany({});
            // Note: Not clearing JobCounter as it might be needed for operations

            return {
                success: true,
                message: "All test data cleared successfully",
                cleared: {
                    SomeModel: someModelResult.deletedCount,
                    JobStatus: jobStatusResult.deletedCount,
                },
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            console.error("Error clearing data:", error);
            throw new Error(`Failed to clear data: ${error.message}`);
        }
    }
}

module.exports = SeedService;
