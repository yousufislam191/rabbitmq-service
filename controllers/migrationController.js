const migrationService = require("../services/migrationService");

class MigrationController {
    async startMigration(req, res) {
        try {
            console.log("🔍 Migration controller - received request body:", JSON.stringify(req.body, null, 2));

            const { batchSize, filters, dryRun = false } = req.body;

            const options = {
                batchSize: batchSize ? parseInt(batchSize) : undefined,
                filters: filters || { status: "pending" },
                dryRun: dryRun === true || dryRun === "true",
            };

            console.log("🔍 Migration controller - parsed options:", JSON.stringify(options, null, 2));

            const result = await migrationService.startMigration(options);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            console.error("❌ Migration controller error:", error.message);
            console.error("🔍 Error stack:", error.stack);
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getMigrationStatus(req, res) {
        try {
            const { migrationId } = req.params;

            if (!migrationId) {
                return res.status(400).json({
                    success: false,
                    error: "Migration ID is required",
                    timestamp: new Date(),
                });
            }

            const status = await migrationService.getJobStatus(migrationId);

            if (!status) {
                return res.status(404).json({
                    success: false,
                    error: "Migration job not found",
                    timestamp: new Date(),
                });
            }

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                migration: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getAllMigrations(req, res) {
        try {
            const { status, jobType = "migration", limit = 50 } = req.query;

            const filters = { jobType };
            if (status) {
                filters.status = status;
            }

            const migrations = await migrationService.getAllJobStatuses(filters);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                count: migrations.length,
                migrations: migrations.slice(0, parseInt(limit)),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async cancelMigration(req, res) {
        try {
            const { migrationId } = req.params;

            if (!migrationId) {
                return res.status(400).json({
                    success: false,
                    error: "Migration ID is required",
                    timestamp: new Date(),
                });
            }

            const result = await migrationService.cancelMigration(migrationId);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            const statusCode = error.message.includes("not found") ? 404 : 500;
            res.status(statusCode).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getBatchStatus(req, res) {
        try {
            const { batchId } = req.params;

            if (!batchId) {
                return res.status(400).json({
                    success: false,
                    error: "Batch ID is required",
                    timestamp: new Date(),
                });
            }

            const status = await migrationService.getJobStatus(batchId);

            if (!status) {
                return res.status(404).json({
                    success: false,
                    error: "Batch job not found",
                    timestamp: new Date(),
                });
            }

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                batch: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getJobHistory(req, res) {
        try {
            const { status, jobType, parentJobId, limit = 100 } = req.query;

            const filters = {};
            if (status) filters.status = status;
            if (jobType) filters.jobType = jobType;
            if (parentJobId) filters.parentJobId = parentJobId;

            const jobs = await migrationService.getAllJobStatuses(filters);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                count: jobs.length,
                jobs: jobs.slice(0, parseInt(limit)),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async retryFailed(req, res) {
        try {
            const { batchSize, dryRun = false } = req.body;

            const options = {
                batchSize: batchSize ? parseInt(batchSize) : undefined,
                dryRun: dryRun === true || dryRun === "true",
            };

            const result = await migrationService.retryFailedDocuments(options);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                message: "Failed documents retry started",
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async completeProcessing(req, res) {
        try {
            const { batchSize, dryRun = false } = req.body;

            const options = {
                batchSize: batchSize ? parseInt(batchSize) : undefined,
                dryRun: dryRun === true || dryRun === "true",
            };

            const result = await migrationService.completeProcessingDocuments(options);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                message: "Processing documents completion started",
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async processAllStatuses(req, res) {
        try {
            const { batchSize, dryRun = false } = req.body;

            const options = {
                batchSize: batchSize ? parseInt(batchSize) : undefined,
                dryRun: dryRun === true || dryRun === "true",
            };

            const result = await migrationService.processAllPendingStatuses(options);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                message: "All pending status documents processing started",
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async fixStuckJobs(req, res) {
        try {
            await migrationService.updateJobStatusesForStuckJobs();

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                message: "Stuck job statuses have been updated",
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async createMissingMigrationJobs(req, res) {
        try {
            const result = await migrationService.createMissingMigrationJobs();

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                message: "Missing migration jobs have been created",
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }
}

module.exports = new MigrationController();
