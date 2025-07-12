const db = require("../config/db");

class HealthService {
    async getApplicationHealth() {
        try {
            const dbHealth = await db.healthCheck();
            const connectionStatus = db.getConnectionStatus();

            return {
                status: dbHealth.status === "healthy" ? "OK" : "ERROR",
                timestamp: new Date(),
                database: dbHealth,
                connection: connectionStatus,
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version,
                platform: process.platform,
                pid: process.pid,
            };
        } catch (error) {
            throw new Error(`Application health check failed: ${error.message}`);
        }
    }

    getLivenessProbe() {
        return {
            status: "alive",
            timestamp: new Date(),
            uptime: process.uptime(),
        };
    }

    async getReadinessProbe() {
        try {
            const dbHealth = await db.healthCheck();
            const isReady = dbHealth.status === "healthy";

            return {
                status: isReady ? "ready" : "not ready",
                database: dbHealth,
                timestamp: new Date(),
            };
        } catch (error) {
            throw new Error(`Readiness probe failed: ${error.message}`);
        }
    }
}

module.exports = new HealthService();
