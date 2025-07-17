const queueService = require("../services/queueService");
const ErrorHandler = require("../utils/errorHandler");
const { ResponseUtils } = require("../utils/serviceUtils");
const { ValidationError } = require("../utils/errors");

class QueueController {
    getQueueStats = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.query;
        const stats = await queueService.getQueueStats(queueName);

        // The service now returns structured responses, so we can pass them directly
        const statusCode = stats.success ? 200 : stats.error?.type === "QueueNotFoundError" ? 404 : 400;
        res.status(statusCode).json(stats);
    });

    getQueueHealth = ErrorHandler.wrapAsync(async (req, res) => {
        const health = await queueService.healthCheck();
        const statusCode = health.status === "healthy" ? 200 : 503;
        res.status(statusCode).json(health);
    });

    purgeQueue = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.params;
        const result = await queueService.purgeQueue(queueName);
        res.status(200).json(result);
    });

    purgeAllQueues = ErrorHandler.wrapAsync(async (req, res) => {
        const result = await queueService.purgeAllQueues();
        res.status(200).json(result);
    });

    retryDeadLetterMessages = ErrorHandler.wrapAsync(async (req, res) => {
        const { limit } = req.query;
        const retryLimit = limit ? parseInt(limit) : 10;
        const result = await queueService.retryDeadLetterMessages(retryLimit);
        res.status(200).json(result);
    });

    publishTestMessage = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName, message, priority = 0, delay = 0 } = req.body;

        if (!queueName || !message) {
            const { response, statusCode } = ErrorHandler.createResponse(new ValidationError("Queue name and message are required"));
            return res.status(statusCode).json(response);
        }

        const testBatch = Array.isArray(message) ? message : [message];
        const result = await queueService.publishBatch(testBatch, {
            priority: parseInt(priority),
            delay: parseInt(delay),
            routingKey: "test.message",
            correlationId: `test-${Date.now()}`,
        });

        res.status(200).json(result);
    });

    getConnectionDetails = ErrorHandler.wrapAsync(async (req, res) => {
        const connectionDetails = queueService.rabbitmq.getConnectionDetails();
        res.status(200).json(ResponseUtils.success({ connectionDetails }));
    });

    /**
     * Cleanup all RabbitMQ queues - WARNING: This will delete all data
     * This is a destructive operation that should be used with caution
     */
    cleanupQueues = ErrorHandler.wrapAsync(async (req, res) => {
        const { confirm } = req.body;

        // Require explicit confirmation to prevent accidental deletion
        if (confirm !== "DELETE_ALL_QUEUES") {
            return res
                .status(400)
                .json(ResponseUtils.error('Cleanup requires explicit confirmation. Send { "confirm": "DELETE_ALL_QUEUES" } in request body.', "CONFIRMATION_REQUIRED"));
        }

        const result = await queueService.cleanupAllQueues();
        res.status(200).json(result);
    });
}

module.exports = new QueueController();
