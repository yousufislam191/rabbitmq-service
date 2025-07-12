const express = require("express");
const router = express.Router();
const migrationController = require("../controllers/migrationController");

// Start migration
router.post("/", migrationController.startMigration);

// Retry failed documents
router.post("/retry-failed", migrationController.retryFailed);

// Complete processing documents
router.post("/complete-processing", migrationController.completeProcessing);

// Process all pending statuses (pending, processing, failed)
router.post("/process-all", migrationController.processAllStatuses);

// Fix stuck job statuses
router.post("/fix-stuck-jobs", migrationController.fixStuckJobs);

// Create missing migration jobs
router.post("/create-missing-migrations", migrationController.createMissingMigrationJobs);

// Get all migrations
router.get("/", migrationController.getAllMigrations);

// Get specific migration status
router.get("/status/:migrationId", migrationController.getMigrationStatus);

// Cancel migration
router.delete("/cancel/:migrationId", migrationController.cancelMigration);

// Get batch status
router.get("/batch/:batchId", migrationController.getBatchStatus);

// Get job history
router.get("/jobs", migrationController.getJobHistory);

module.exports = router;
