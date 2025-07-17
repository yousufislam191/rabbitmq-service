// Load environment variables
try {
    const originalLog = console.log;
    console.log = () => {}; // Temporarily silence console
    require("dotenv").config();
    console.log = originalLog; // Restore console
} catch (error) {
    require("dotenv").config(); // Fallback
}

module.exports = {
    MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/mydb",
    RABBITMQ_URL: process.env.RABBITMQ_URL || "amqp://localhost",
    BATCH_SIZE: parseInt(process.env.BATCH_SIZE, 10) || 100,
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: process.env.PORT || 3000,
};
