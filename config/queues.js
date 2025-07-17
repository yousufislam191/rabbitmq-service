/**
 * Queue Configuration
 * Centralized configuration for all queue names and their properties
 * This is the single source of truth for queue definitions
 */

const QUEUE_CONFIG = {
    // Processing Queues
    PROCESSING: {
        name: "app.processing.queue",
        description: "Main processing queue for batch operations",
        type: "processing",
        options: {
            durable: true,
            prefetch: 1,
            retry: true,
            maxRetries: 3,
            retryDelayMs: 10000,
        },
    },

    PRIORITY: {
        name: "app.priority.queue",
        description: "Priority queue for urgent operations",
        type: "priority",
        options: {
            durable: true,
            prefetch: 2,
            retry: true,
            maxRetries: 5,
            retryDelayMs: 5000,
        },
    },

    DEAD_LETTER: {
        name: "app.deadletter.queue",
        description: "Dead letter queue for failed messages",
        type: "deadletter",
        options: {
            durable: true,
            prefetch: 10,
            retry: false,
            noAck: false,
        },
    },

    RETRY: {
        name: "app.retry.queue",
        description: "Retry queue for failed messages awaiting retry",
        type: "retry",
        options: {
            durable: true,
            prefetch: 5,
            retry: false,
        },
    },

    ARCHIVE: {
        name: "app.archive.queue",
        description: "Archive queue for bulk data migration operations",
        type: "archive",
        options: {
            durable: true,
            prefetch: 1, // Process one batch at a time for archive operations
            retry: true,
            maxRetries: 3,
            retryDelayMs: 15000, // Longer retry delay for archive operations
            deadLetterExchange: "app.deadletter.exchange", // Use dead letter exchange for failed messages
            deadLetterRoutingKey: "failed.archive", // Routing key for failed archive messages
        },
    },
};

const EXCHANGE_CONFIG = {
    DEAD_LETTER: {
        name: "app.deadletter.exchange",
        type: "topic", // Keep as topic to match existing exchange
        options: {
            durable: true,
        },
    },

    MAIN: {
        name: "app.topic.exchange", // Use original name
        type: "topic",
        options: {
            durable: true,
        },
    },
};

/**
 * Helper functions to get queue information
 */
const QueueManager = {
    /**
     * Get all queue names as an array
     */
    getAllQueueNames() {
        return Object.values(QUEUE_CONFIG).map((queue) => queue.name);
    },

    /**
     * Get queue configuration by name
     */
    getQueueByName(queueName) {
        return Object.values(QUEUE_CONFIG).find((queue) => queue.name === queueName);
    },

    /**
     * Get queue configuration by type
     */
    getQueueByType(type) {
        return Object.values(QUEUE_CONFIG).find((queue) => queue.type === type);
    },

    /**
     * Get all queues as array with full configuration
     */
    getAllQueues() {
        return Object.values(QUEUE_CONFIG);
    },

    /**
     * Check if a queue name is valid
     */
    isValidQueueName(queueName) {
        return this.getAllQueueNames().includes(queueName);
    },

    /**
     * Get queue names formatted for validation error messages
     */
    getValidQueueNamesString() {
        return this.getAllQueueNames().join(", ");
    },

    /**
     * Get queues available for consumer management
     */
    getConsumerManagedQueues() {
        // Exclude retry queue from consumer management as it's internally managed
        return Object.values(QUEUE_CONFIG).filter((queue) => queue.type !== "retry");
    },

    /**
     * Get all exchange configurations
     */
    getAllExchanges() {
        return Object.values(EXCHANGE_CONFIG);
    },

    /**
     * Get exchange by name
     */
    getExchangeByName(exchangeName) {
        return Object.values(EXCHANGE_CONFIG).find((exchange) => exchange.name === exchangeName);
    },
};

module.exports = {
    QUEUE_CONFIG,
    EXCHANGE_CONFIG,
    QueueManager,
};
