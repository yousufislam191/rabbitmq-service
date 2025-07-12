require("dotenv").config();

module.exports = {
    MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/mydb",
    RABBITMQ_URL: process.env.RABBITMQ_URL || "amqp://localhost",
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE, 10) || 100,
    CRON_SCHEDULE: process.env.CRON_SCHEDULE || "*/10 * * * *", // every 10 minutes (even more conservative)
    ENABLE_SCHEDULER: process.env.ENABLE_SCHEDULER !== "false", // Default enabled, set to "false" to disable
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || 3000,
    PROCESSING_DELAY: parseInt(process.env.PROCESSING_DELAY, 10) || 1000,
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES, 10) || 3,
};
