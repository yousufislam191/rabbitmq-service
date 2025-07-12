const databaseService = require("../services/databaseService");

class DatabaseController {
    async getHealth(req, res) {
        try {
            const health = await databaseService.getHealthCheck();
            res.status(health.status === "healthy" ? 200 : 503).json(health);
        } catch (error) {
            res.status(503).json({
                status: "unhealthy",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getStatus(req, res) {
        try {
            const connectionStatus = databaseService.getConnectionStatus();
            res.status(connectionStatus.isConnected ? 200 : 503).json({
                ...connectionStatus,
                timestamp: new Date(),
            });
        } catch (error) {
            res.status(503).json({
                status: "error",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getInfo(req, res) {
        try {
            const info = databaseService.getConnectionInfo();
            res.json(info);
        } catch (error) {
            res.status(500).json({
                status: "error",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async ping(req, res) {
        try {
            const pingResult = await databaseService.pingDatabase();
            res.status(pingResult.status === "healthy" ? 200 : 503).json(pingResult);
        } catch (error) {
            res.status(503).json({
                status: "error",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }
}

module.exports = new DatabaseController();
