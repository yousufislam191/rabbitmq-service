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
            if (count <= 0 || count > 10000000) {
                return res.status(400).json({
                    success: false,
                    message: "Count must be between 1 and 10,000,000",
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
}

module.exports = SeedController;
