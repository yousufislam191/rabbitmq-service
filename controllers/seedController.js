const SeedService = require("../services/seedService");

/**
 * Seed Controller
 * Handles HTTP requests for enhanced data seeding operations
 */
class SeedController {
    /**
     * Clear all data from the database
     * DELETE /seed/clear-all
     */
    static async clearAllData(req, res) {
        try {
            const { confirmation } = req.body;

            // Require explicit confirmation
            if (confirmation !== "DELETE_ALL_DATA") {
                return res.status(400).json({
                    success: false,
                    message: "Confirmation required. Send { 'confirmation': 'DELETE_ALL_DATA' } in request body",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.clearAllData();

            res.status(200).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in clearAllData controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Insert dummy data into database in batches
     * POST /seed/insert-batch
     */
    static async insertBatchData(req, res) {
        try {
            const { collection = "someModel", totalCount = 1000, batchSize = 100, clearExisting = false } = req.body;

            // Validate input
            if (totalCount <= 0 || totalCount > 1000000) {
                return res.status(400).json({
                    success: false,
                    message: "Total count must be between 1 and 1,000,000",
                    timestamp: new Date().toISOString(),
                });
            }

            if (batchSize <= 0 || batchSize > 5000) {
                return res.status(400).json({
                    success: false,
                    message: "Batch size must be between 1 and 5,000",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.insertBatchData(collection, totalCount, batchSize, clearExisting);

            res.status(201).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in insertBatchData controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Fetch data from database and publish to RabbitMQ in batches
     * POST /seed/fetch-and-publish
     */
    static async fetchAndPublishBatches(req, res) {
        try {
            const { collection = "someModel", batchSize = 100, limit = null, priority = 0, queueType = "processing", filter = {} } = req.body;

            // Validate input
            if (batchSize <= 0 || batchSize > 1000) {
                return res.status(400).json({
                    success: false,
                    message: "Batch size must be between 1 and 1,000",
                    timestamp: new Date().toISOString(),
                });
            }

            if (priority < 0 || priority > 10) {
                return res.status(400).json({
                    success: false,
                    message: "Priority must be between 0 and 10",
                    timestamp: new Date().toISOString(),
                });
            }

            if (!["processing", "priority", "deadletter"].includes(queueType)) {
                return res.status(400).json({
                    success: false,
                    message: "Queue type must be one of: processing, priority, deadletter",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.fetchAndPublishBatches(collection, batchSize, limit, priority, queueType, filter);

            res.status(200).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in fetchAndPublishBatches controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Test complete archive flow: insert data -> fetch and publish -> archive
     * POST /seed/test-archive-flow
     */
    static async testArchiveFlow(req, res) {
        try {
            const { insertCount = 500, batchSize = 100, clearExisting = true, archiveQueueType = "archive", priority = 0, testMode = true } = req.body;

            console.log("🚀 Starting complete archive flow test...");
            const startTime = Date.now();
            const flowResults = [];

            // Step 1: Insert dummy data into SomeModel
            console.log("📝 Step 1: Inserting dummy data into SomeModel...");
            const insertResult = await SeedService.insertBatchData("someModel", insertCount, batchSize, clearExisting);

            if (!insertResult) {
                throw new Error("Insert operation failed - no result returned");
            }

            flowResults.push({
                step: "insert",
                result: insertResult,
                timestamp: new Date().toISOString(),
            });

            // Small delay to ensure all data is inserted
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 2: Fetch data and publish to archive queue
            console.log("📦 Step 2: Fetching data and publishing to archive queue...");
            const publishResult = await SeedService.fetchAndPublishBatches(
                "someModel",
                batchSize,
                insertCount, // limit to what we just inserted
                priority,
                archiveQueueType,
                {} // no filter, get all
            );
            flowResults.push({
                step: "publish",
                result: publishResult,
                timestamp: new Date().toISOString(),
            });

            const endTime = Date.now();
            const totalDuration = (endTime - startTime) / 1000;

            const response = {
                success: true,
                message: `Archive flow test completed successfully in ${totalDuration}s`,
                flowSummary: {
                    totalDuration,
                    stepsCompleted: flowResults.length,
                    documentsInserted: insertResult.stats?.documentsInserted || 0,
                    documentsPublished: publishResult.stats?.documentsProcessed || 0,
                    batchesPublished: publishResult.stats?.batchesPublished || 0,
                    queueType: archiveQueueType,
                    nextStep: "Archive worker will process the published batches and move data to SomeModelArchive collection",
                },
                stepResults: flowResults,
                testConfig: {
                    insertCount,
                    batchSize,
                    clearExisting,
                    archiveQueueType,
                    priority,
                    testMode,
                },
                timestamp: new Date().toISOString(),
            };

            console.log("✅ Archive flow test completed successfully");
            res.status(200).json(response);
        } catch (error) {
            console.error("Error in testArchiveFlow controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }
}

module.exports = SeedController;
