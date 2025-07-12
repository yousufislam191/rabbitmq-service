const SeedService = require("../services/seedService");

/**
 * Seed Controller
 * Handles HTTP requests for data seeding operations
 */
class SeedController {
    /**
     * Seed SomeModel collection with dummy data
     * POST /seed/some-model
     */
    static async seedSomeModel(req, res) {
        try {
            const { count = 1000, clearExisting = false, batchSize = 1000 } = req.body;

            // Validate input
            if (count <= 0 || count > 100000) {
                return res.status(400).json({
                    success: false,
                    message: "Count must be between 1 and 100,000",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.seedSomeModel(count, {
                clearExisting,
                batchSize: Math.min(batchSize, 5000), // Limit batch size for safety
            });

            res.status(201).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in seedSomeModel controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Seed JobStatus collection with dummy data
     * POST /seed/job-status
     */
    static async seedJobStatus(req, res) {
        try {
            const { count = 100, clearExisting = false, batchSize = 500 } = req.body;

            // Validate input
            if (count <= 0 || count > 10000) {
                return res.status(400).json({
                    success: false,
                    message: "Count must be between 1 and 10,000",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.seedJobStatus(count, {
                clearExisting,
                batchSize: Math.min(batchSize, 1000),
            });

            res.status(201).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in seedJobStatus controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Seed all collections with dummy data
     * POST /seed/all
     */
    static async seedAll(req, res) {
        try {
            const { someModelCount = 1000, jobStatusCount = 100, clearExisting = false, batchSize = 1000 } = req.body;

            // Validate input
            if (someModelCount <= 0 || someModelCount > 100000) {
                return res.status(400).json({
                    success: false,
                    message: "SomeModel count must be between 1 and 100,000",
                    timestamp: new Date().toISOString(),
                });
            }

            if (jobStatusCount <= 0 || jobStatusCount > 10000) {
                return res.status(400).json({
                    success: false,
                    message: "JobStatus count must be between 1 and 10,000",
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.seedAll({
                someModelCount,
                jobStatusCount,
                clearExisting,
                batchSize: Math.min(batchSize, 5000),
            });

            res.status(201).json({
                ...result,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in seedAll controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Get collection statistics
     * GET /seed/stats
     */
    static async getStats(req, res) {
        try {
            const result = await SeedService.getCollectionStats();
            res.status(200).json(result);
        } catch (error) {
            console.error("Error in getStats controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Clear all test data
     * DELETE /seed/clear
     */
    static async clearData(req, res) {
        try {
            // Handle both query params and body
            const confirm = req.body?.confirm || req.query?.confirm;

            if (!confirm || confirm !== "DELETE_ALL_DATA") {
                return res.status(400).json({
                    success: false,
                    message: 'Please confirm by sending { "confirm": "DELETE_ALL_DATA" } in request body or ?confirm=DELETE_ALL_DATA as query parameter',
                    timestamp: new Date().toISOString(),
                });
            }

            const result = await SeedService.clearAllData();
            res.status(200).json(result);
        } catch (error) {
            console.error("Error in clearData controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    /**
     * Get seeding documentation and examples
     * GET /seed/docs
     */
    static async getDocs(req, res) {
        try {
            const docs = {
                title: "Data Seeding API Documentation",
                description: "Generate and insert dummy data for testing purposes",
                endpoints: {
                    "POST /seed/some-model": {
                        description: "Seed SomeModel collection with dummy data",
                        payload: {
                            count: "Number of documents to create (1-100,000, default: 1000)",
                            clearExisting: "Clear existing data before seeding (boolean, default: false)",
                            batchSize: "Batch size for insertion (default: 1000, max: 5000)",
                        },
                        example: {
                            count: 5000,
                            clearExisting: true,
                            batchSize: 1000,
                        },
                    },
                    "POST /seed/job-status": {
                        description: "Seed JobStatus collection with dummy data",
                        payload: {
                            count: "Number of documents to create (1-10,000, default: 100)",
                            clearExisting: "Clear existing data before seeding (boolean, default: false)",
                            batchSize: "Batch size for insertion (default: 500, max: 1000)",
                        },
                        example: {
                            count: 500,
                            clearExisting: false,
                            batchSize: 500,
                        },
                    },
                    "POST /seed/all": {
                        description: "Seed all collections with dummy data",
                        payload: {
                            someModelCount: "Number of SomeModel documents (default: 1000)",
                            jobStatusCount: "Number of JobStatus documents (default: 100)",
                            clearExisting: "Clear existing data before seeding (boolean, default: false)",
                            batchSize: "Batch size for insertion (default: 1000)",
                        },
                        example: {
                            someModelCount: 10000,
                            jobStatusCount: 1000,
                            clearExisting: true,
                            batchSize: 2000,
                        },
                    },
                    "GET /seed/stats": {
                        description: "Get collection statistics and document counts",
                        payload: "No payload required",
                        example: "GET request only",
                    },
                    "DELETE /seed/clear": {
                        description: "Clear all test data from collections",
                        payload: {
                            confirm: "Must be 'DELETE_ALL_DATA' to confirm deletion",
                        },
                        example: {
                            confirm: "DELETE_ALL_DATA",
                        },
                    },
                },
                schemas: {
                    SomeModel: {
                        name: "String (random first and last name)",
                        email: "String (generated email)",
                        status: "String (pending, processing, success, failed)",
                        updateFields: "Object (priority, category, department, metadata)",
                        timestamps: "createdAt and updatedAt",
                    },
                    JobStatus: {
                        correlationId: "String (unique job identifier)",
                        status: "String (pending, processing, success, failed)",
                        createdAt: "Date (random within last 30 days)",
                        completedAt: "Date (for completed jobs)",
                        totalItems: "Number (random 1-1000)",
                        error: "String (for failed jobs)",
                    },
                },
                tips: [
                    "Start with smaller counts to test the endpoint",
                    "Use clearExisting: true when you want fresh data",
                    "Monitor database space when creating large datasets",
                    "Use /seed/stats to check current data counts",
                    "Batch size affects memory usage and performance",
                ],
            };

            res.status(200).json({
                success: true,
                documentation: docs,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error("Error in getDocs controller:", error);
            res.status(500).json({
                success: false,
                message: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }
}

module.exports = SeedController;
