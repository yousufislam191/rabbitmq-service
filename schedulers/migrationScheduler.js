const cron = require("node-cron");
const migrateDataJob = require("../jobs/migrateDataJob");
const config = require("../config");

function startScheduler() {
    cron.schedule(config.CRON_SCHEDULE, async () => {
        console.log("⏳ Running scheduled migration job...");
        try {
            await migrateDataJob();
        } catch (err) {
            console.error("❌ Migration job failed:", err.message);
        }
    });
}

module.exports = startScheduler;
