require("dotenv").config();

module.exports = {
    MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/mydb",
    RABBITMQ_URL: process.env.RABBITMQ_URL || "amqp://localhost",
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE, 10) || 100,
    CRON_SCHEDULE: process.env.CRON_SCHEDULE || "*/1 * * * *", // every minute
};
