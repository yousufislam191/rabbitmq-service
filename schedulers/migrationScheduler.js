const cron = require("node-cron");
const migrationService = require("../services/migrationService");
const config = require("../config");

let isRunning = false;

function startScheduler() {
    if (!config.ENABLE_SCHEDULER) {
        console.log("📅 Migration scheduler is disabled via configuration");
        return;
    }

    console.log(`📅 Starting migration scheduler with pattern: ${config.CRON_SCHEDULE}`);

    cron.schedule(config.CRON_SCHEDULE, async () => {
        if (isRunning) {
            console.log("⏭️ Skipping scheduled migration - previous job still running");
            return;
        }

        isRunning = true;
        console.log("⏳ Running scheduled migration job...");

        try {
            let totalProcessed = 0;
            const results = [];

            // 1. First: Process pending documents (normal processing)
            console.log("🔄 Step 1: Processing pending documents...");
            const pendingResult = await migrationService.startMigration({
                batchSize: config.BATCH_SIZE || 1000,
                filters: { status: "pending" },
            });

            if (pendingResult.success && pendingResult.totalDocuments > 0) {
                console.log(`✅ Pending documents: ${pendingResult.totalDocuments} found, ${pendingResult.batchesCreated} batches created`);
                totalProcessed += pendingResult.totalDocuments;
                results.push(`Pending: ${pendingResult.totalDocuments}`);
            } else {
                console.log("📭 No pending documents found");
            }

            // 2. Second: Process processing documents (complete them)
            console.log("� Step 2: Completing processing documents...");
            const processingResult = await migrationService.completeProcessingDocuments({
                batchSize: config.BATCH_SIZE || 1000,
            });

            if (processingResult.success && processingResult.totalDocuments > 0) {
                console.log(`✅ Processing documents: ${processingResult.totalDocuments} found, ${processingResult.batchesCreated} batches created`);
                totalProcessed += processingResult.totalDocuments;
                results.push(`Processing: ${processingResult.totalDocuments}`);
            } else {
                console.log("� No processing documents found");
            }

            // 3. Third: Process failed documents (retry mechanism)
            console.log("🔄 Step 3: Retrying failed documents...");
            const failedResult = await migrationService.retryFailedDocuments({
                batchSize: config.BATCH_SIZE || 1000,
            });

            if (failedResult.success && failedResult.totalDocuments > 0) {
                console.log(`✅ Failed documents: ${failedResult.totalDocuments} found, ${failedResult.batchesCreated} batches created (retry mechanism)`);
                totalProcessed += failedResult.totalDocuments;
                results.push(`Failed (retry): ${failedResult.totalDocuments}`);
            } else {
                console.log("📭 No failed documents found");
            }

            // Summary
            if (totalProcessed > 0) {
                console.log(`🎯 Migration summary: ${totalProcessed} total documents processed`);
                console.log(`📊 Breakdown: ${results.join(", ")}`);
            } else {
                console.log("📭 No documents found for any processing step");
            }
        } catch (err) {
            console.error("❌ Migration job failed:", err.message);
            if (err.stack) {
                console.error("🔍 Error stack:", err.stack);
            }
        } finally {
            isRunning = false;
        }
    });

    console.log("📅 Migration scheduler started successfully");
}

module.exports = startScheduler;
