const RabbitMQService = require("./rabbitmqService");
const config = require("../config");

class QueueService {
    constructor() {
        this.rabbitmq = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            this.rabbitmq = new RabbitMQService(config.RABBITMQ_URL);
            await this.rabbitmq.connect();
            await this.setupInfrastructure();
            this.isInitialized = true;
            console.log("✅ Queue service initialized successfully");
        } catch (error) {
            console.error("❌ Failed to initialize queue service:", error.message);
            throw error;
        }
    }

    async setupInfrastructure() {
        try {
            // Main topic exchange for routing messages
            await this.rabbitmq.assertTopicExchange("app.topic.exchange");

            // Dead letter exchange for failed messages (keep as topic to match existing)
            await this.rabbitmq.assertTopicExchange("app.deadletter.exchange");

            // Processing queue with dead letter configuration
            await this.rabbitmq.assertQueue("app.processing.queue", {
                durable: true,
                deadLetterExchange: "app.deadletter.exchange",
                deadLetterRoutingKey: "failed.processing",
            });

            // Dead letter queue
            await this.rabbitmq.assertQueue("app.deadletter.queue", { durable: true });

            // Retry queue with TTL
            await this.rabbitmq.assertQueue("app.retry.queue", {
                durable: true,
                deadLetterExchange: "app.topic.exchange",
                deadLetterRoutingKey: "process.retry",
            });

            // Priority queue for urgent processing
            await this.rabbitmq.assertQueue("app.priority.queue", {
                durable: true,
                maxPriority: 10,
            });

            // Bind queues to exchanges
            await this.rabbitmq.bindQueue("app.processing.queue", "app.topic.exchange", "process.*");
            await this.rabbitmq.bindQueue("app.priority.queue", "app.topic.exchange", "priority.*");
            await this.rabbitmq.bindQueue("app.deadletter.queue", "app.deadletter.exchange", "failed.*");

            console.log("✅ Queue infrastructure setup completed");
        } catch (error) {
            console.error("❌ Failed to setup queue infrastructure:", error.message);
            throw error;
        }
    }

    async publishBatch(batch, options = {}) {
        await this.ensureInitialized();

        const { correlationId, priority = 0, delay = 0, routingKey = "process.bulkUpdate" } = options;

        try {
            const exchange = priority > 5 ? "app.topic.exchange" : "app.topic.exchange";
            const finalRoutingKey = priority > 5 ? `priority.${routingKey}` : routingKey;

            const publishOptions = {
                persistent: true,
                correlationId,
                priority,
                headers: {
                    batchSize: batch.length,
                    source: "queue-service",
                    timestamp: new Date().toISOString(),
                    priority: priority > 5 ? "high" : "normal",
                },
            };

            if (delay > 0) {
                publishOptions.expiration = String(delay);
            }

            await this.rabbitmq.publish(exchange, finalRoutingKey, batch, publishOptions);

            return {
                success: true,
                correlationId,
                batchSize: batch.length,
                queue: priority > 5 ? "app.priority.queue" : "app.processing.queue",
            };
        } catch (error) {
            throw new Error(`Failed to publish batch: ${error.message}`);
        }
    }

    async getQueueStats() {
        await this.ensureInitialized();

        try {
            // Dynamically fetch all queues instead of using hardcoded list
            const queues = await this.rabbitmq.getAllQueues();

            const stats = {};

            for (const queue of queues) {
                try {
                    stats[queue] = await this.rabbitmq.getQueueInfo(queue);
                } catch (error) {
                    stats[queue] = { error: error.message };
                }
            }

            return {
                timestamp: new Date(),
                queues: stats,
                total: {
                    messages: Object.values(stats).reduce((sum, q) => sum + (q.messageCount || 0), 0),
                    consumers: Object.values(stats).reduce((sum, q) => sum + (q.consumerCount || 0), 0),
                },
            };
        } catch (error) {
            throw new Error(`Failed to get queue stats: ${error.message}`);
        }
    }

    async purgeQueue(queueName) {
        await this.ensureInitialized();

        try {
            const result = await this.rabbitmq.purgeQueue(queueName);
            return {
                success: true,
                queue: queueName,
                purgedMessages: result.messageCount,
                timestamp: new Date(),
            };
        } catch (error) {
            throw new Error(`Failed to purge queue ${queueName}: ${error.message}`);
        }
    }

    async purgeAllQueues() {
        await this.ensureInitialized();

        // Dynamically fetch all queues instead of using hardcoded list
        const queues = await this.rabbitmq.getAllQueues();

        const results = {};

        for (const queue of queues) {
            try {
                results[queue] = await this.purgeQueue(queue);
            } catch (error) {
                results[queue] = { success: false, error: error.message };
            }
        }

        return {
            timestamp: new Date(),
            results,
        };
    }

    async retryDeadLetterMessages(limit = 10) {
        await this.ensureInitialized();

        try {
            let retriedCount = 0;

            // This is a simplified version - in practice you might want to
            // peek at messages and selectively retry them
            const dlqStats = await this.rabbitmq.getQueueInfo("app.deadletter.queue");

            if (dlqStats.messageCount === 0) {
                return {
                    success: true,
                    retriedCount: 0,
                    message: "No messages in dead letter queue",
                };
            }

            // For now, just return stats - actual retry logic would be more complex
            return {
                success: true,
                availableMessages: dlqStats.messageCount,
                message: `${dlqStats.messageCount} messages available for retry`,
                note: "Manual retry implementation needed based on business logic",
            };
        } catch (error) {
            throw new Error(`Failed to retry dead letter messages: ${error.message}`);
        }
    }

    async healthCheck() {
        try {
            if (!this.isInitialized) {
                return { status: "unhealthy", error: "Service not initialized" };
            }

            const rabbitmqHealth = await this.rabbitmq.healthCheck();
            const queueStats = await this.getQueueStats();

            return {
                status: rabbitmqHealth.status,
                timestamp: new Date(),
                rabbitmq: rabbitmqHealth,
                queues: queueStats,
                service: {
                    initialized: this.isInitialized,
                    connection: this.rabbitmq.getConnectionStatus(),
                },
            };
        } catch (error) {
            return {
                status: "unhealthy",
                error: error.message,
                timestamp: new Date(),
            };
        }
    }

    async ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    async close() {
        if (this.rabbitmq) {
            await this.rabbitmq.close();
            this.isInitialized = false;
            console.log("✅ Queue service closed");
        }
    }
}

module.exports = new QueueService();
