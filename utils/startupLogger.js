/**
 * Startup Logger Utility
 * Handles all startup logging messages for better organization and maintainability
 */

class StartupLogger {
    /**
     * Display application startup banner
     */
    static displayBanner() {
        console.log("🚀 Starting application...");
    }

    /**
     * Display database initialization message
     */
    static displayDatabaseInit() {
        console.log("🔄 Starting message consumers...");
    }

    /**
     * Display consumers startup message
     */
    static displayConsumersInit() {
        console.log("🔄 Starting message consumers...");
    }

    /**
     * Display schedulers initialization message
     */
    static displaySchedulersInit() {
        console.log("⏰ Starting schedulers...");
    }

    /**
     * Display complete API endpoints documentation
     * @param {number} port - The port number the server is running on
     */
    static displayAPIEndpoints(port) {
        console.log(`🌐 Server running on http://localhost:${port}`);
        console.log("");

        // Health endpoints
        this.displayHealthEndpoints(port);
        console.log("");

        // Database endpoints
        this.displayDatabaseEndpoints(port);
        console.log("");

        // Migration endpoints
        this.displayMigrationEndpoints(port);
        console.log("");

        // Queue endpoints
        this.displayQueueEndpoints(port);
        console.log("");

        // Data seeding endpoints
        this.displaySeedingEndpoints(port);
        console.log("");

        console.log("✅ Application started successfully!");
        console.log("📖 For detailed API documentation, visit: http://localhost:" + port + "/seed/docs");
    }

    /**
     * Display health check endpoints
     * @param {number} port - The port number
     */
    static displayHealthEndpoints(port) {
        console.log(`📊 Health endpoints:`);
        console.log(`   • General health: http://localhost:${port}/health`);
        console.log(`   • Liveness probe: http://localhost:${port}/health/live`);
        console.log(`   • Readiness probe: http://localhost:${port}/health/ready`);
    }

    /**
     * Display database endpoints
     * @param {number} port - The port number
     */
    static displayDatabaseEndpoints(port) {
        console.log(`🗃️  Database endpoints:`);
        console.log(`   • DB health: http://localhost:${port}/db/health`);
        console.log(`   • DB status: http://localhost:${port}/db/status`);
        console.log(`   • DB info: http://localhost:${port}/db/info`);
        console.log(`   • DB ping: http://localhost:${port}/db/ping`);
    }

    /**
     * Display migration endpoints
     * @param {number} port - The port number
     */
    static displayMigrationEndpoints(port) {
        console.log(`🚀 Migration endpoints:`);
        console.log(`   • Start migration: POST http://localhost:${port}/migrate`);
        console.log(`   • Get migrations: GET http://localhost:${port}/migrate`);
        console.log(`   • Migration status: GET http://localhost:${port}/migrate/status/:id`);
        console.log(`   • Cancel migration: DELETE http://localhost:${port}/migrate/cancel/:id`);
        console.log(`   • Batch status: GET http://localhost:${port}/migrate/batch/:id`);
        console.log(`   • Job history: GET http://localhost:${port}/migrate/jobs`);
    }

    /**
     * Display queue management endpoints
     * @param {number} port - The port number
     */
    static displayQueueEndpoints(port) {
        console.log(`🔄 Queue endpoints:`);
        console.log(`   • Queue stats: GET http://localhost:${port}/queue/stats`);
        console.log(`   • Queue health: GET http://localhost:${port}/queue/health`);
        console.log(`   • Consumer status: GET http://localhost:${port}/queue/consumers/status`);
        console.log(`   • Start consumers: POST http://localhost:${port}/queue/consumers/start`);
        console.log(`   • Stop consumers: POST http://localhost:${port}/queue/consumers/stop`);
        console.log(`   • Restart consumers: POST http://localhost:${port}/queue/consumers/restart`);
        console.log(`   • Purge queue: DELETE http://localhost:${port}/queue/purge/:queueName`);
        console.log(`   • Retry DLQ: POST http://localhost:${port}/queue/retry-dlq`);
        console.log(`   • Test publish: POST http://localhost:${port}/queue/test/publish`);
    }

    /**
     * Display data seeding endpoints
     * @param {number} port - The port number
     */
    static displaySeedingEndpoints(port) {
        console.log(`🌱 Data Seeding endpoints:`);
        console.log(`   • Seed docs: GET http://localhost:${port}/seed/docs`);
        console.log(`   • Collection stats: GET http://localhost:${port}/seed/stats`);
        console.log(`   • Seed SomeModel: POST http://localhost:${port}/seed/some-model`);
        console.log(`   • Seed JobStatus: POST http://localhost:${port}/seed/job-status`);
        console.log(`   • Seed all data: POST http://localhost:${port}/seed/all`);
        console.log(`   • Clear data: DELETE http://localhost:${port}/seed/clear`);
    }

    /**
     * Display error message for application startup failure
     * @param {Error} error - The error that occurred
     */
    static displayStartupError(error) {
        console.error("❌ Failed to start application:", error.message);
        console.error("💡 Troubleshooting tips:");
        console.error("   • Check if MongoDB is running on the configured port");
        console.error("   • Verify RabbitMQ server is accessible");
        console.error("   • Ensure all environment variables are set correctly");
        console.error("   • Check if the specified port is available");
    }

    /**
     * Display uncaught exception error
     * @param {Error} error - The uncaught exception
     */
    static displayUncaughtException(error) {
        console.error("💥 Uncaught Exception:", error);
        console.error("🔧 The application will exit. Please check your code for unhandled errors.");
    }

    /**
     * Display unhandled promise rejection error
     * @param {any} reason - The rejection reason
     * @param {Promise} promise - The promise that was rejected
     */
    static displayUnhandledRejection(reason, promise) {
        console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);
        console.error("🔧 The application will exit. Please ensure all promises are properly handled.");
    }

    /**
     * Display compact startup summary (cleaner output)
     * @param {number} port - The port number
     */
    static displayCompactSummary(port) {
        console.log(`🌐 Server running on http://localhost:${port}`);
        console.log(`� Documentation: http://localhost:${port}/seed/docs`);
        console.log("✅ Application ready!");
    }
}

module.exports = StartupLogger;
