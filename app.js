const express = require("express");
const migrationRoutes = require("./routes/migrationRoutes");
const queueRoutes = require("./routes/queueRoutes");
const seedRoutes = require("./routes/seedRoutes");
const startConsumers = require("./consumers/QueueConsumerManager");
const startScheduler = require("./schedulers/migrationScheduler");
const config = require("./config");
const db = require("./config/db");

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
app.use("/migrate", migrationRoutes);
app.use("/queue", queueRoutes);
app.use("/seed", seedRoutes);

// Initialize application
async function startApplication() {
    try {
        // Initialize database connection
        await db.connect();

        // Start consumers and scheduler
        await startConsumers();
        // startScheduler();

        // Start the server
        app.listen(config.PORT, () => {
            console.log(`🌐 Server running on http://localhost:${config.PORT}`);
        });
    } catch (error) {
        console.error("❌ Failed to start application:", error.message);
        process.exit(1);
    }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("🔧 The application will exit. Please check your code for unhandled errors. ERROR: ", error);
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
    console.error("🔧 The application will exit. Please ensure all promises are properly handled.");
    process.exit(1);
});

// Start the application
startApplication();
