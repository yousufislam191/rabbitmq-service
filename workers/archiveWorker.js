const { parentPort, workerData } = require("worker_threads");
const SomeModel = require("../models/someModel");
const SomeModelArchive = require("../models/someModelArchive");
const mongoose = require("mongoose");
const db = require("../config/db");

/**
 * Archive Worker Consumer
 * Processes archive queue messages and moves data from SomeModel to SomeModelArchive
 */
class ArchiveWorkerConsumer {
    constructor(workerData) {
        this.workerId = workerData.workerId;
        this.queueType = workerData.queueType || "archive";
        this.isRunning = false;
        this.processedCount = 0;
        this.errorCount = 0;
        this.currentBatch = null;
        this.startTime = Date.now();

        console.log(`🏗️ Archive Worker ${this.workerId} initialized for queue: ${this.queueType}`);
    }

    async initialize() {
        try {
            // Connect to MongoDB
            await db.connect();
            console.log(`✅ Archive Worker ${this.workerId} connected to MongoDB`);
            console.log(`🔍 Archive Worker ${this.workerId} database name:`, mongoose.connection.db.databaseName);
            console.log(`🔍 Archive Worker ${this.workerId} connection state:`, mongoose.connection.readyState);
            console.log(`🔍 Archive Worker ${this.workerId} connection URI:`, mongoose.connection.host + ":" + mongoose.connection.port);

            // Test direct database write to verify connection
            try {
                const testResult = await mongoose.connection.db.collection("test_collection").insertOne({
                    test: true,
                    timestamp: new Date(),
                    workerId: this.workerId,
                });
                console.log(`🧪 Archive Worker ${this.workerId} test insert result:`, testResult.acknowledged);
            } catch (testError) {
                console.error(`❌ Archive Worker ${this.workerId} test insert failed:`, testError.message);
            }

            this.isRunning = true;

            // Send ready signal to parent
            parentPort.postMessage({
                type: "ready",
                workerId: this.workerId,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error(`❌ Archive Worker ${this.workerId} initialization failed:`, error);
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            throw error;
        }
    }

    async processArchiveMessage(message) {
        const startTime = Date.now();
        let archivedCount = 0;
        let errorCount = 0;

        try {
            console.log(`📦 Archive Worker ${this.workerId} processing batch: ${message.batchId}`);
            console.log(`🔍 Archive Worker ${this.workerId} received message:`, JSON.stringify(message, null, 2));
            this.currentBatch = message.batchId;

            const { collection, data, metadata } = message;

            if (collection !== "someModel") {
                throw new Error(`Unsupported collection for archiving: ${collection}`);
            }

            if (!data || !Array.isArray(data) || data.length === 0) {
                throw new Error("No data provided for archiving");
            }

            // Prepare archive documents
            const archiveDocuments = data.map((doc) => ({
                // Copy original document fields
                name: doc.name,
                email: doc.email,
                status: doc.status,
                updateFields: doc.updateFields,

                // Archive-specific fields
                originalId: doc._id,
                archivedAt: new Date(),
                archiveBatch: message.batchId,
                archiveReason: "bulk_migration",
                sourceCollection: "somemodels",
                archivedBy: `archive-worker-${this.workerId}`,
                originalCreatedAt: doc.createdAt,
                originalUpdatedAt: doc.updatedAt,
            }));

            // Insert into archive collection in bulk
            console.log(`📝 Archive Worker ${this.workerId} attempting to insert ${archiveDocuments.length} documents into archive`);

            const insertResult = await SomeModelArchive.insertMany(archiveDocuments, {
                ordered: false, // Continue even if some documents fail
                rawResult: true,
            });

            console.log(
                `✅ Archive Worker ${this.workerId} insert result:`,
                JSON.stringify(
                    {
                        insertedCount: insertResult.insertedCount,
                        ops: insertResult.ops ? insertResult.ops.length : "N/A",
                    },
                    null,
                    2
                )
            );

            archivedCount = insertResult.insertedCount || archiveDocuments.length;

            // Verify documents were actually created
            const verifyCount = await SomeModelArchive.countDocuments({ archiveBatch: message.batchId });
            console.log(`🔍 Archive Worker ${this.workerId} verification: Found ${verifyCount} documents in archive with batch ID ${message.batchId}`);

            // Force sync to ensure data is written before worker exits
            await mongoose.connection.db.admin().command({ fsync: 1 });
            console.log(`💾 Archive Worker ${this.workerId} forced database sync completed`);

            // Additional verification after sync
            const postSyncCount = await SomeModelArchive.countDocuments({ archiveBatch: message.batchId });
            console.log(`🔍 Archive Worker ${this.workerId} post-sync verification: Found ${postSyncCount} documents in archive`);

            console.log(`📋 Archive Worker ${this.workerId} archived ${archivedCount} documents from batch ${message.batchId}`);

            // Optional: Remove original documents (uncomment if you want to delete after archiving)
            /*
            const originalIds = data.map(doc => doc._id);
            const deleteResult = await SomeModel.deleteMany({ _id: { $in: originalIds } });
            console.log(`🗑️ Deleted ${deleteResult.deletedCount} original documents`);
            */

            const processingTime = Date.now() - startTime;
            this.processedCount += archivedCount;

            // Send success response to parent
            parentPort.postMessage({
                type: "processed",
                workerId: this.workerId,
                batchId: message.batchId,
                documentsArchived: archivedCount,
                processingTime,
                totalProcessed: this.processedCount,
                timestamp: new Date().toISOString(),
            });

            // Wait a bit to ensure data is fully persisted before worker exits
            await new Promise((resolve) => setTimeout(resolve, 500));
            console.log(`⏰ Archive Worker ${this.workerId} waited for persistence`);

            return {
                success: true,
                documentsArchived: archivedCount,
                processingTime,
                batchId: message.batchId,
            };
        } catch (error) {
            this.errorCount++;
            errorCount++;
            const processingTime = Date.now() - startTime;

            console.error(`❌ Archive Worker ${this.workerId} error processing batch ${message.batchId}:`, error);

            // Send error response to parent
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                batchId: message.batchId,
                error: error.message,
                documentsArchived: archivedCount,
                errorCount: this.errorCount,
                processingTime,
                timestamp: new Date().toISOString(),
            });

            throw error;
        } finally {
            this.currentBatch = null;
        }
    }

    getStatus() {
        const uptime = Date.now() - this.startTime;
        return {
            workerId: this.workerId,
            queueType: this.queueType,
            isRunning: this.isRunning,
            processedCount: this.processedCount,
            errorCount: this.errorCount,
            currentBatch: this.currentBatch,
            uptime,
            avgProcessingRate: this.processedCount > 0 ? Math.round((this.processedCount / uptime) * 1000) : 0, // docs per second
        };
    }

    async shutdown() {
        try {
            console.log(`🔌 Archive Worker ${this.workerId} shutting down...`);
            this.isRunning = false;

            // Close MongoDB connection
            await mongoose.connection.close();

            const finalStats = this.getStatus();

            parentPort.postMessage({
                type: "shutdown",
                workerId: this.workerId,
                finalStats,
                timestamp: new Date().toISOString(),
            });

            console.log(`✅ Archive Worker ${this.workerId} shutdown complete`);
        } catch (error) {
            console.error(`❌ Archive Worker ${this.workerId} shutdown error:`, error);
            parentPort.postMessage({
                type: "shutdownError",
                workerId: this.workerId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }
}

// Initialize and set up message handling
(async () => {
    try {
        const archiveWorker = new ArchiveWorkerConsumer(workerData);

        // Handle messages from parent process
        parentPort.on("message", async (message) => {
            try {
                switch (message.type) {
                    case "process":
                        await archiveWorker.processArchiveMessage(message.data);
                        break;

                    case "status":
                        parentPort.postMessage({
                            type: "status",
                            data: archiveWorker.getStatus(),
                            timestamp: new Date().toISOString(),
                        });
                        break;

                    case "shutdown":
                        await archiveWorker.shutdown();
                        process.exit(0);
                        break;

                    default:
                        console.warn(`⚠️ Archive Worker ${archiveWorker.workerId} received unknown message type: ${message.type}`);
                }
            } catch (error) {
                console.error(`❌ Archive Worker ${archiveWorker.workerId} message handling error:`, error);
                parentPort.postMessage({
                    type: "error",
                    workerId: archiveWorker.workerId,
                    error: error.message,
                    messageType: message.type,
                    timestamp: new Date().toISOString(),
                });
            }
        });

        // Initialize the worker
        await archiveWorker.initialize();

        console.log(`🚀 Archive Worker ${archiveWorker.workerId} is ready to process archive messages`);
    } catch (error) {
        console.error("❌ Archive Worker initialization failed:", error);
        parentPort.postMessage({
            type: "initError",
            error: error.message,
            timestamp: new Date().toISOString(),
        });
        process.exit(1);
    }
})();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("❌ Archive Worker uncaught exception:", error);
    parentPort.postMessage({
        type: "uncaughtException",
        error: error.message,
        timestamp: new Date().toISOString(),
    });
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Archive Worker unhandled rejection:", reason);
    parentPort.postMessage({
        type: "unhandledRejection",
        error: reason.message || reason,
        timestamp: new Date().toISOString(),
    });
    process.exit(1);
});
