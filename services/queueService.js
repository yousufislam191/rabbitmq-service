const RabbitMQService = require("./rabbitmqService");
const config = require("../config");
const ErrorHandler = require("../utils/errorHandler");
const { ResponseUtils } = require("../utils/serviceUtils");
const { ServiceNotInitializedError, RabbitMQError, ValidationError } = require("../utils/errors");
const { QueueManager, QUEUE_CONFIG, EXCHANGE_CONFIG } = require("../config/queues");

class QueueService {
    constructor() {
        this.rabbitmq = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        return await ErrorHandler.handleAsyncError(
            async () => {
                this.rabbitmq = new RabbitMQService(config.RABBITMQ_URL);
                await this.rabbitmq.connect();
                await this.setupInfrastructure();
                this.isInitialized = true;
                console.log("✅ Queue service initialized successfully");
            },
            { service: "QueueService", operation: "initialize" }
        );
    }

    async setupInfrastructure() {
        return await ErrorHandler.handleAsyncError(
            async () => {
                // Setup exchanges from configuration
                const exchanges = QueueManager.getAllExchanges();
                for (const exchange of exchanges) {
                    if (exchange.type === "topic") {
                        await this.rabbitmq.assertTopicExchange(exchange.name, exchange.options);
                    } else if (exchange.type === "direct") {
                        await this.rabbitmq.assertDirectExchange(exchange.name, exchange.options);
                    }
                }

                // Setup queues from configuration
                const queues = QueueManager.getAllQueues();
                for (const queueConfig of queues) {
                    const queueOptions = { ...queueConfig.options };

                    // Add specific configurations based on queue type
                    if (queueConfig.type === "processing") {
                        queueOptions.deadLetterExchange = EXCHANGE_CONFIG.DEAD_LETTER.name;
                        queueOptions.deadLetterRoutingKey = "failed.processing";
                    } else if (queueConfig.type === "retry") {
                        queueOptions.deadLetterExchange = EXCHANGE_CONFIG.MAIN.name;
                        queueOptions.deadLetterRoutingKey = "process.retry";
                    } else if (queueConfig.type === "priority") {
                        queueOptions.maxPriority = 10;
                    } else if (queueConfig.type === "archive") {
                        queueOptions.deadLetterExchange = EXCHANGE_CONFIG.DEAD_LETTER.name;
                        queueOptions.deadLetterRoutingKey = "failed.archive";
                    }

                    await this.rabbitmq.assertQueue(queueConfig.name, queueOptions);
                }

                // Bind queues to exchanges (using configuration-based approach)
                await this.rabbitmq.bindQueue(QUEUE_CONFIG.PROCESSING.name, EXCHANGE_CONFIG.MAIN.name, "process.*");
                await this.rabbitmq.bindQueue(QUEUE_CONFIG.PRIORITY.name, EXCHANGE_CONFIG.MAIN.name, "priority.*");
                await this.rabbitmq.bindQueue(QUEUE_CONFIG.ARCHIVE.name, EXCHANGE_CONFIG.MAIN.name, "archive.*");
                await this.rabbitmq.bindQueue(QUEUE_CONFIG.DEAD_LETTER.name, EXCHANGE_CONFIG.DEAD_LETTER.name, "failed.*");

                console.log("✅ Queue infrastructure setup completed");
            },
            { service: "QueueService", operation: "setupInfrastructure" }
        );
    }

    async publishBatch(batch, options = {}) {
        await this.ensureInitialized();

        // Handle both batch array and message object formats
        let messageData;
        let batchSize;

        if (Array.isArray(batch)) {
            // Legacy format: just an array of data
            messageData = batch;
            batchSize = batch.length;

            if (batch.length === 0) {
                throw new ValidationError("Batch must be a non-empty array", "batch");
            }
        } else if (batch && typeof batch === "object" && batch.data) {
            // New format: message object with collection, data, metadata
            messageData = batch;
            batchSize = batch.data ? batch.data.length : 0;

            if (!batch.data || !Array.isArray(batch.data) || batch.data.length === 0) {
                throw new ValidationError("Message must contain non-empty data array", "batch.data");
            }
        } else {
            throw new ValidationError("Batch must be an array or message object with data property", "batch");
        }

        const { correlationId, priority = 0, delay = 0, queueType = "processing" } = options;

        // Determine routing key based on queue type
        let routingKey;
        let targetQueue;

        switch (queueType) {
            case "archive":
                routingKey = "archive.bulkMigration";
                targetQueue = QUEUE_CONFIG.ARCHIVE.name;
                break;
            case "priority":
                routingKey = "priority.bulkUpdate";
                targetQueue = QUEUE_CONFIG.PRIORITY.name;
                break;
            case "processing":
            default:
                routingKey = "process.bulkUpdate";
                targetQueue = QUEUE_CONFIG.PROCESSING.name;
                break;
        }

        return await ErrorHandler.handleAsyncError(
            async () => {
                const exchange = EXCHANGE_CONFIG.MAIN.name;
                const finalRoutingKey = priority > 5 ? `priority.${routingKey.split(".")[1]}` : routingKey;

                const publishOptions = {
                    persistent: true,
                    correlationId,
                    priority,
                    headers: {
                        batchSize: batchSize,
                        source: "queue-service",
                        timestamp: new Date().toISOString(),
                        priority: priority > 5 ? "high" : "normal",
                        queueType: queueType,
                    },
                };

                if (delay > 0) {
                    publishOptions.expiration = String(delay);
                }

                await this.rabbitmq.publish(exchange, finalRoutingKey, messageData, publishOptions);

                console.log(`📨 Published batch to ${queueType} queue (${targetQueue}) with routing key: ${finalRoutingKey}`);

                return ResponseUtils.success({
                    correlationId,
                    batchSize: batchSize,
                    queue: targetQueue,
                    routingKey: finalRoutingKey,
                    queueType,
                });
            },
            {
                service: "QueueService",
                operation: "publishBatch",
                batchSize: batchSize,
                priority,
                routingKey,
            }
        );
    }

    async getQueueStats(queueName = null) {
        await this.ensureInitialized();

        return await ErrorHandler.handleAsyncError(
            async () => {
                // If specific queue name is provided, return stats for that queue only
                if (queueName) {
                    try {
                        const queueInfo = await this.rabbitmq.getQueueInfo(queueName);
                        return ResponseUtils.successWithStats(queueInfo, queueName);
                    } catch (error) {
                        // Parse RabbitMQ specific errors into structured error objects
                        const parsedError = ErrorHandler.parseRabbitMQError(error, queueName, "getQueueInfo");

                        // Return error response instead of throwing
                        const { response } = ErrorHandler.createResponse(parsedError);
                        return response;
                    }
                }

                // Dynamically fetch all queues instead of using hardcoded list
                const queues = await this.rabbitmq.getAllQueues();
                const stats = {};

                for (const queue of queues) {
                    try {
                        stats[queue] = await this.rabbitmq.getQueueInfo(queue);
                    } catch (error) {
                        const parsedError = ErrorHandler.parseRabbitMQError(error, queue, "getQueueInfo");
                        stats[queue] = { error: parsedError.message };
                    }
                }

                return ResponseUtils.success({
                    queues: stats,
                    total: {
                        messages: Object.values(stats).reduce((sum, q) => sum + (q.messageCount || 0), 0),
                        consumers: Object.values(stats).reduce((sum, q) => sum + (q.consumerCount || 0), 0),
                    },
                });
            },
            {
                service: "QueueService",
                operation: "getQueueStats",
                queueName,
            }
        );
    }

    async purgeQueue(queueName) {
        await this.ensureInitialized();

        if (!queueName || typeof queueName !== "string") {
            throw new ValidationError("Queue name is required and must be a string", "queueName");
        }

        return await ErrorHandler.handleAsyncError(
            async () => {
                const result = await this.rabbitmq.purgeQueue(queueName);
                return ResponseUtils.success({
                    queue: queueName,
                    purgedMessages: result.messageCount,
                });
            },
            {
                service: "QueueService",
                operation: "purgeQueue",
                queueName,
            }
        );
    }

    async purgeAllQueues() {
        await this.ensureInitialized();

        return await ErrorHandler.handleAsyncError(
            async () => {
                // Dynamically fetch all queues instead of using hardcoded list
                const queues = await this.rabbitmq.getAllQueues();
                const results = {};

                for (const queue of queues) {
                    try {
                        const result = await this.purgeQueue(queue);
                        results[queue] = result;
                    } catch (error) {
                        const parsedError = ErrorHandler.parseRabbitMQError(error, queue, "purgeQueue");
                        results[queue] = {
                            success: false,
                            error: parsedError.message,
                        };
                    }
                }

                return ResponseUtils.success({ results });
            },
            {
                service: "QueueService",
                operation: "purgeAllQueues",
            }
        );
    }

    async retryDeadLetterMessages(limit = 10) {
        await this.ensureInitialized();

        if (typeof limit !== "number" || limit <= 0) {
            throw new ValidationError("Limit must be a positive number", "limit");
        }

        return await ErrorHandler.handleAsyncError(
            async () => {
                // This is a simplified version - in practice you might want to
                // peek at messages and selectively retry them
                const dlqStats = await this.rabbitmq.getQueueInfo(QUEUE_CONFIG.DEAD_LETTER.name);

                if (dlqStats.messageCount === 0) {
                    return ResponseUtils.success({
                        retriedCount: 0,
                        message: "No messages in dead letter queue",
                    });
                }

                // For now, just return stats - actual retry logic would be more complex
                return ResponseUtils.success({
                    availableMessages: dlqStats.messageCount,
                    message: `${dlqStats.messageCount} messages available for retry`,
                    note: "Manual retry implementation needed based on business logic",
                });
            },
            {
                service: "QueueService",
                operation: "retryDeadLetterMessages",
                limit,
            }
        );
    }

    async healthCheck() {
        return await ErrorHandler.handleAsyncError(
            async () => {
                if (!this.isInitialized) {
                    return {
                        status: "unhealthy",
                        timestamp: new Date().toISOString(),
                        error: "Service not initialized",
                    };
                }

                const rabbitmqHealth = await this.rabbitmq.healthCheck();
                const queueStats = await this.getQueueStats();

                return {
                    status: rabbitmqHealth.status,
                    timestamp: new Date().toISOString(),
                    rabbitmq: rabbitmqHealth,
                    queues: queueStats,
                    service: {
                        initialized: this.isInitialized,
                        connection: this.rabbitmq.getConnectionStatus(),
                    },
                };
            },
            {
                service: "QueueService",
                operation: "healthCheck",
            }
        );
    }

    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    async close() {
        return await ErrorHandler.handleAsyncError(
            async () => {
                if (this.rabbitmq) {
                    await this.rabbitmq.close();
                    this.isInitialized = false;
                    console.log("✅ Queue service closed");
                }
            },
            {
                service: "QueueService",
                operation: "close",
            }
        );
    }

    /**
     * Cleanup all RabbitMQ queues - WARNING: This will delete all data in queues
     * This is a destructive operation that removes all configured queues
     */
    async cleanupAllQueues() {
        return await ErrorHandler.handleAsyncError(
            async () => {
                console.log("🧹 Starting queue cleanup...");

                const queueNames = QueueManager.getAllQueueNames();
                const results = {
                    deletedQueues: [],
                    notFoundQueues: [],
                    errors: [],
                };

                for (const queueName of queueNames) {
                    try {
                        await this.rabbitmq.deleteQueue(queueName);
                        results.deletedQueues.push(queueName);
                        console.log(`✅ Deleted queue: ${queueName}`);
                    } catch (error) {
                        if (error.message.includes("NOT_FOUND") || error.message.includes("no queue")) {
                            results.notFoundQueues.push(queueName);
                            console.log(`⚠️ Queue ${queueName} not found (already deleted)`);
                        } else {
                            results.errors.push({ queue: queueName, error: error.message });
                            console.error(`❌ Failed to delete queue ${queueName}:`, error.message);
                        }
                    }
                }

                const summary = {
                    total: queueNames.length,
                    deleted: results.deletedQueues.length,
                    notFound: results.notFoundQueues.length,
                    errors: results.errors.length,
                };

                console.log("✅ Cleanup completed!", summary);

                return ResponseUtils.success({
                    message: "Queue cleanup completed",
                    summary,
                    results,
                    recommendation: "Restart your application to recreate the infrastructure",
                });
            },
            { service: "QueueService", operation: "cleanupAllQueues" }
        );
    }
}

module.exports = new QueueService();
