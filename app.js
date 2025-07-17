const express = require("express");
const queueRoutes = require("./routes/queueRoutes");
const consumerRoutes = require("./routes/consumerRoutes");
const seedRoutes = require("./routes/seedRoutes");
const consumerService = require("./services/consumerService");
const config = require("./config");
const db = require("./config/db");
const ErrorHandler = require("./utils/errorHandler");

const app = express();

// Set up global error handlers for uncaught exceptions and unhandled rejections
process.on("unhandledRejection", ErrorHandler.unhandledRejectionHandler);
process.on("uncaughtException", ErrorHandler.uncaughtExceptionHandler);

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
app.use("/queue", queueRoutes);
app.use("/consumers", consumerRoutes);
app.use("/seed", seedRoutes);

// Global error handling middleware (must be last)
app.use(ErrorHandler.expressErrorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        timestamp: new Date().toISOString(),
        error: {
            message: `Route ${req.method} ${req.url} not found`,
            type: "NotFound",
        },
    });
});

// Initialize application
async function startApplication() {
    return await ErrorHandler.handleAsyncError(
        async () => {
            // Initialize database connection
            await db.connect();

            // Start consumers
            await consumerService.startAllConsumers();

            // Start the server
            app.listen(config.PORT, () => {
                console.log(`🌐 Server running on http://localhost:${config.PORT}`);
            });
        },
        { service: "Application", operation: "startup" }
    );
}

// Start the application
startApplication().catch((error) => {
    console.error("❌ Critical startup error:", error.message);
    process.exit(1);
});
