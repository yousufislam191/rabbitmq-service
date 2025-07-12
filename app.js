const express = require("express");
const migrationRoutes = require("./routes/migrationRoutes");
const healthRoutes = require("./routes/healthRoutes");
const dbRoutes = require("./routes/dbRoutes");
const queueRoutes = require("./routes/queueRoutes");
const seedRoutes = require("./routes/seedRoutes");
const startConsumers = require("./consumers/QueueConsumerManager");
const startScheduler = require("./schedulers/migrationScheduler");
const config = require("./config");
const db = require("./config/db");
const StartupLogger = require("./utils/startupLogger");

const app = express();

// JSON parsing middleware with better error handling
app.use(
    express.json({
        limit: "10mb",
        strict: true,
    })
);

// Global error handling middleware for JSON parsing
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        console.error("JSON parsing error:", err.message);
        return res.status(400).json({
            success: false,
            message: "Invalid JSON format in request body",
            error: "Please check your JSON syntax",
        });
    }
    next(err);
});

// Routes
app.use("/health", healthRoutes);
app.use("/db", dbRoutes);
app.use("/migrate", migrationRoutes);
app.use("/queue", queueRoutes);
app.use("/seed", seedRoutes);

// Initialize application
async function startApplication() {
    try {
        // Initialize database connection
        StartupLogger.displayBanner();
        await db.connect();

        // Start consumers after database is connected
        StartupLogger.displayConsumersInit();
        await startConsumers();

        // Start schedulers
        StartupLogger.displaySchedulersInit();
        startScheduler();

        // Start the server
        app.listen(config.PORT, () => {
            StartupLogger.displayAPIEndpoints(config.PORT);
        });
    } catch (error) {
        StartupLogger.displayStartupError(error);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    StartupLogger.displayUncaughtException(error);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    StartupLogger.displayUnhandledRejection(reason, promise);
    process.exit(1);
});

// Start the application
startApplication();
