const cron = require("node-cron");
const migrationService = require("../services/migrationService");
const config = require("../config");

let isRunning = false;

function startScheduler() {
    if (!config.ENABLE_SCHEDULER) {
        console.log("📅 Migration scheduler is disabled");
        return;
    }

    console.log(`📅 Migration scheduler started (${config.CRON_SCHEDULE})`);

    cron.schedule(config.CRON_SCHEDULE, async () => {
        if (isRunning) {
            return; // Skip silently if previous job still running
        }

        isRunning = true;

        try {
            let totalProcessed = 0;
            const results = [];

            // 1. Process pending documents
            const pendingResult = await migrationService.startMigration({
                batchSize: config.BATCH_SIZE || 1000,
                filters: { status: "pending" },
            });

            if (pendingResult.success && pendingResult.totalDocuments > 0) {
                totalProcessed += pendingResult.totalDocuments;
                results.push(`Pending: ${pendingResult.totalDocuments}`);
            }

            // 2. Complete processing documents
            const processingResult = await migrationService.completeProcessingDocuments({
                batchSize: config.BATCH_SIZE || 1000,
            });

            if (processingResult.success && processingResult.totalDocuments > 0) {
                totalProcessed += processingResult.totalDocuments;
                results.push(`Processing: ${processingResult.totalDocuments}`);
            }

            // 3. Retry failed documents
            const failedResult = await migrationService.retryFailedDocuments({
                batchSize: config.BATCH_SIZE || 1000,
            });

            if (failedResult.success && failedResult.totalDocuments > 0) {
                totalProcessed += failedResult.totalDocuments;
                results.push(`Failed: ${failedResult.totalDocuments}`);
            }

            // Only log if there's something to report
            if (totalProcessed > 0) {
                console.log(`📊 Migration processed: ${totalProcessed} docs [${results.join(", ")}]`);
            }
        } catch (err) {
            console.error("❌ Migration job failed:", err.message);
        } finally {
            isRunning = false;
        }
    });
}

module.exports = startScheduler;
