const healthService = require("../services/healthService");

class HealthController {
    async getHealth(req, res) {
        try {
            const health = await healthService.getApplicationHealth();
            res.status(health.status === "OK" ? 200 : 503).json(health);
        } catch (error) {
            res.status(503).json({
                status: "ERROR",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    getLiveness(req, res) {
        try {
            const liveness = healthService.getLivenessProbe();
            res.status(200).json(liveness);
        } catch (error) {
            res.status(503).json({
                status: "error",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getReadiness(req, res) {
        try {
            const readiness = await healthService.getReadinessProbe();
            const isReady = readiness.status === "ready";
            res.status(isReady ? 200 : 503).json(readiness);
        } catch (error) {
            res.status(503).json({
                status: "not ready",
                error: error.message,
                timestamp: new Date(),
            });
        }
    }
}

module.exports = new HealthController();
