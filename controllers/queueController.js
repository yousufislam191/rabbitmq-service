const queueService = require("../services/queueService");
const consumerService = require("../services/consumerService");

class QueueController {
    async getQueueStats(req, res) {
        try {
            const stats = await queueService.getQueueStats();

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...stats,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getQueueHealth(req, res) {
        try {
            const health = await queueService.healthCheck();
            const statusCode = health.status === "healthy" ? 200 : 503;

            res.status(statusCode).json({
                success: health.status === "healthy",
                timestamp: new Date(),
                ...health,
            });
        } catch (error) {
            res.status(503).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async purgeQueue(req, res) {
        try {
            const { queueName } = req.params;

            if (!queueName) {
                return res.status(400).json({
                    success: false,
                    error: "Queue name is required",
                    timestamp: new Date(),
                });
            }

            const result = await queueService.purgeQueue(queueName);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async purgeAllQueues(req, res) {
        try {
            const result = await queueService.purgeAllQueues();

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async retryDeadLetterMessages(req, res) {
        try {
            const { limit } = req.query;
            const retryLimit = limit ? parseInt(limit) : 10;

            const result = await queueService.retryDeadLetterMessages(retryLimit);

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getConsumerStatus(req, res) {
        try {
            const status = consumerService.getConsumerStatus();

            res.status(200).json({
                success: true,
                timestamp: new Date(),
                consumers: status,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async getConsumerHealth(req, res) {
        try {
            const health = await consumerService.getConsumerHealth();
            const statusCode = health.status === "healthy" ? 200 : 503;

            res.status(statusCode).json({
                success: health.status === "healthy",
                timestamp: new Date(),
                ...health,
            });
        } catch (error) {
            res.status(503).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async startConsumers(req, res) {
        try {
            await consumerService.startAllConsumers();

            res.status(200).json({
                success: true,
                message: "All consumers started successfully",
                timestamp: new Date(),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async stopConsumers(req, res) {
        try {
            await consumerService.stopAllConsumers();

            res.status(200).json({
                success: true,
                message: "All consumers stopped successfully",
                timestamp: new Date(),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async restartConsumers(req, res) {
        try {
            await consumerService.restartConsumers();

            res.status(200).json({
                success: true,
                message: "All consumers restarted successfully",
                timestamp: new Date(),
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }

    async publishTestMessage(req, res) {
        try {
            const { batchSize = 5, priority = 0, correlationId = `test-${Date.now()}` } = req.body;

            // Create test batch
            const testBatch = [];
            for (let i = 0; i < batchSize; i++) {
                testBatch.push({
                    _id: `test-${correlationId}-${i}`,
                    updateFields: {
                        status: "test",
                        updatedAt: new Date(),
                        testData: `Test message ${i + 1}`,
                    },
                });
            }

            const result = await queueService.publishBatch(testBatch, {
                correlationId,
                priority,
            });

            res.status(200).json({
                success: true,
                message: "Test message published successfully",
                timestamp: new Date(),
                ...result,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message,
                timestamp: new Date(),
            });
        }
    }
}

module.exports = new QueueController();
