const db = require("../config/db");

class DatabaseService {
    async getHealthCheck() {
        try {
            const health = await db.healthCheck();
            const status = db.getConnectionStatus();
            return {
                ...health,
                connection: status,
            };
        } catch (error) {
            throw new Error(`Health check failed: ${error.message}`);
        }
    }

    getConnectionStatus() {
        try {
            return db.getConnectionStatus();
        } catch (error) {
            throw new Error(`Failed to get connection status: ${error.message}`);
        }
    }

    getConnectionInfo() {
        try {
            const connectionStatus = db.getConnectionStatus();
            const readyStates = {
                0: "disconnected",
                1: "connected",
                2: "connecting",
                3: "disconnecting",
            };

            return {
                isConnected: connectionStatus.isConnected,
                readyState: readyStates[connectionStatus.readyState] || "unknown",
                host: connectionStatus.host,
                port: connectionStatus.port,
                database: connectionStatus.name,
                timestamp: new Date(),
            };
        } catch (error) {
            throw new Error(`Failed to get connection info: ${error.message}`);
        }
    }

    async pingDatabase() {
        try {
            const startTime = Date.now();
            const health = await db.healthCheck();
            const responseTime = Date.now() - startTime;

            return {
                status: health.status,
                responseTime: `${responseTime}ms`,
                timestamp: new Date(),
            };
        } catch (error) {
            throw new Error(`Database ping failed: ${error.message}`);
        }
    }
}

module.exports = new DatabaseService();
