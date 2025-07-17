const consumerService = require("../services/consumerService");
const ErrorHandler = require("../utils/errorHandler");
const { ResponseUtils } = require("../utils/serviceUtils");

class ConsumerController {
    // General consumer management
    getConsumerStatus = ErrorHandler.wrapAsync(async (req, res) => {
        const status = consumerService.getConsumerStatus();
        res.status(200).json(ResponseUtils.success({ consumers: status }));
    });

    getConsumerHealth = ErrorHandler.wrapAsync(async (req, res) => {
        const health = await consumerService.getConsumerHealth();
        const statusCode = health.status === "healthy" ? 200 : 503;
        res.status(statusCode).json(ResponseUtils.success(health));
    });

    startConsumers = ErrorHandler.wrapAsync(async (req, res) => {
        await consumerService.startAllConsumers();
        res.status(200).json(ResponseUtils.success({}, "All consumers started successfully"));
    });

    stopConsumers = ErrorHandler.wrapAsync(async (req, res) => {
        await consumerService.stopAllConsumers();
        res.status(200).json(ResponseUtils.success({}, "All consumers stopped successfully"));
    });

    restartConsumers = ErrorHandler.wrapAsync(async (req, res) => {
        await consumerService.restartConsumers();
        res.status(200).json(ResponseUtils.success({}, "All consumers restarted successfully"));
    });

    // Specific consumer management
    startSpecificConsumer = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.params;
        const result = await consumerService.startConsumer(queueName);
        res.status(200).json(ResponseUtils.success(result, result.message));
    });

    stopSpecificConsumer = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.params;
        const result = await consumerService.stopConsumer(queueName);
        res.status(200).json(ResponseUtils.success(result, result.message));
    });

    restartSpecificConsumer = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.params;
        const result = await consumerService.restartConsumer(queueName);
        res.status(200).json(ResponseUtils.success(result, result.message));
    });

    getSpecificConsumerStatus = ErrorHandler.wrapAsync(async (req, res) => {
        const { queueName } = req.params;
        const status = consumerService.getConsumerStatus(queueName);
        res.status(200).json(ResponseUtils.success({ consumer: status }));
    });

    getAvailableQueues = ErrorHandler.wrapAsync(async (req, res) => {
        const queues = consumerService.getAvailableQueues();
        res.status(200).json(ResponseUtils.success({ queues }));
    });

    // Worker management and statistics
    getWorkerStatistics = ErrorHandler.wrapAsync(async (req, res) => {
        const stats = consumerService.getWorkerStatistics();
        res.status(200).json(ResponseUtils.success({ workers: stats }));
    });

    resetWorkerCounter = ErrorHandler.wrapAsync(async (req, res) => {
        const stats = consumerService.resetWorkerCounter();
        res.status(200).json(ResponseUtils.success({ previousStats: stats }, "Worker counter reset successfully"));
    });

    // Worker Thread Management Methods
    getDetailedWorkerStats = ErrorHandler.wrapAsync(async (req, res) => {
        const stats = consumerService.getDetailedWorkerStats();
        res.status(200).json(ResponseUtils.success({ workerStats: stats }));
    });

    getConsumerWorkerHealth = ErrorHandler.wrapAsync(async (req, res) => {
        const health = await consumerService.getConsumerHealth();
        const statusCode = health.status === "healthy" ? 200 : 503;
        res.status(statusCode).json(ResponseUtils.success(health));
    });
}

module.exports = new ConsumerController();
