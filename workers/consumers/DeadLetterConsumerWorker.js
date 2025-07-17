const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");
const config = require("../../config");
const db = require("../../config/db");
const RabbitMQService = require("../../services/rabbitmqService");
const JobStatus = require("../../models/jobStatus");
const { QUEUE_CONFIG, EXCHANGE_CONFIG } = require("../../config/queues");

/**
 * DeadLetterConsumer Worker
 * Runs in a dedicated worker thread to process dead letter queue
 */
class DeadLetterConsumerWorker {
    constructor() {
        this.rabbitmq = null;
        this.queueName = workerData.queueName;
        this.workerId = workerData.workerId;
        this.workerNumber = workerData.workerNumber;
        this.consumerInfo = null;
        this.isRunning = false;
        this.messagesProcessed = 0;
        this.deadLetterMessagesHandled = 0;
    }

    /**
     * Initialize the worker
     */
    async initialize() {
        try {
            // Connect to MongoDB
            await mongoose.connect(config.MONGODB_URI);
            console.log(`📦 ${this.workerId} connected to MongoDB`);

            // Connect to RabbitMQ
            this.rabbitmq = new RabbitMQService(config.RABBITMQ_URL);
            await this.rabbitmq.connect();
            console.log(`🐰 ${this.workerId} connected to RabbitMQ`);

            // Setup the consumer
            await this.setupConsumer();

            this.isRunning = true;

            // Notify parent that we're ready
            parentPort.postMessage({
                type: "ready",
                workerId: this.workerId,
                queueName: this.queueName,
            });

            console.log(`✅ ${this.workerId} initialized and ready for ${this.queueName}`);
        } catch (error) {
            console.error(`❌ ${this.workerId} initialization failed:`, error);
            parentPort.postMessage({
                type: "error",
                error: error.message,
                workerId: this.workerId,
            });
            process.exit(1);
        }
    }

    /**
     * Setup the RabbitMQ consumer
     */
    async setupConsumer() {
        const queueConfig = QUEUE_CONFIG.DEAD_LETTER;

        this.consumerInfo = await this.rabbitmq.consume(
            this.queueName,
            async (batch, rawMsg) => {
                await this.processMessage(batch, rawMsg);
            },
            {
                prefetch: queueConfig.options.prefetch,
                retry: false, // Dead letter queue doesn't retry
                maxRetries: 0,
                retryDelayMs: 0,
                noAck: queueConfig.options.noAck || false,
            }
        );

        console.log(`🔗 ${this.workerId} consumer setup for ${this.queueName}`);
    }

    /**
     * Process a message from the dead letter queue
     */
    async processMessage(batch, rawMsg) {
        const correlationId = rawMsg.properties.correlationId;
        const batchSize = rawMsg.properties.headers?.batchSize || batch.length;
        const originalQueue = rawMsg.properties.headers?.["x-first-death-queue"] || "unknown";
        const deathCount = rawMsg.properties.headers?.["x-death"]?.[0]?.count || 1;

        console.log(`💀 ${this.workerId} processing DEAD LETTER batch: ${correlationId} (${batchSize} items, deaths: ${deathCount}, from: ${originalQueue})`);

        try {
            // Update job status to indicate dead letter processing
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "dead_letter_processing",
                    startTime: new Date(),
                    message: `Processing ${batchSize} dead letter items (deaths: ${deathCount}) in worker thread`,
                    processedBy: this.workerId,
                    deadLetterInfo: {
                        originalQueue,
                        deathCount,
                        processedAt: new Date(),
                    },
                }
            );

            // Handle the dead letter message
            await this.handleDeadLetterMessage(batch, correlationId, originalQueue, deathCount);

            this.messagesProcessed++;
            this.deadLetterMessagesHandled++;

            // Notify parent of successful processing
            parentPort.postMessage({
                type: "messageProcessed",
                workerId: this.workerId,
                correlationId,
                originalQueue,
                deathCount,
                messagesProcessed: this.messagesProcessed,
                deadLetterMessagesHandled: this.deadLetterMessagesHandled,
            });

            console.log(`✅ ${this.workerId} completed DEAD LETTER batch: ${correlationId}`);
        } catch (error) {
            console.error(`❌ ${this.workerId} dead letter processing error for ${correlationId}:`, error);

            // Update job status to failed with dead letter info
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "dead_letter_failed",
                    endTime: new Date(),
                    message: `Dead letter processing failed in worker thread: ${error.message}`,
                    error: error.message,
                    deadLetterInfo: {
                        originalQueue,
                        deathCount,
                        failedAt: new Date(),
                    },
                }
            );

            // Notify parent of error
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                correlationId,
                originalQueue,
                deathCount,
                error: error.message,
            });
        }
    }

    /**
     * Handle dead letter message processing
     */
    async handleDeadLetterMessage(batch, correlationId, originalQueue, deathCount) {
        // Log dead letter details for analysis
        console.log(`🔍 ${this.workerId} analyzing dead letter message:`, {
            correlationId,
            originalQueue,
            deathCount,
            batchSize: batch.length,
            firstItem: batch[0] ? batch[0]._id : "none",
        });

        // Strategy based on death count
        if (deathCount >= 5) {
            // Too many failures - mark as permanently failed
            await this.markAsPermanentlyFailed(correlationId, batch, originalQueue, deathCount);
        } else if (deathCount >= 3) {
            // Multiple failures - needs manual review
            await this.markForManualReview(correlationId, batch, originalQueue, deathCount);
        } else {
            // Few failures - attempt to requeue to original queue after analysis
            await this.attemptRequeue(correlationId, batch, originalQueue, deathCount);
        }

        // Update job status to completed for dead letter processing
        await JobStatus.findOneAndUpdate(
            { correlationId },
            {
                status: "dead_letter_completed",
                progress: 100,
                processedItems: batch.length,
                endTime: new Date(),
                message: `Dead letter processing completed for ${batch.length} items (deaths: ${deathCount})`,
                processedBy: this.workerId,
                deadLetterInfo: {
                    originalQueue,
                    deathCount,
                    completedAt: new Date(),
                    action: deathCount >= 5 ? "permanently_failed" : deathCount >= 3 ? "manual_review" : "requeued",
                },
            }
        );
    }

    /**
     * Mark batch as permanently failed
     */
    async markAsPermanentlyFailed(correlationId, batch, originalQueue, deathCount) {
        console.log(`⚰️ ${this.workerId} marking batch as permanently failed: ${correlationId} (deaths: ${deathCount})`);

        // Here you could store failed items in a separate collection for later analysis
        // For now, we'll just log the failure
        console.error(`🚨 PERMANENT FAILURE - CorrelationId: ${correlationId}, Original Queue: ${originalQueue}, Deaths: ${deathCount}, Items: ${batch.length}`);
    }

    /**
     * Mark batch for manual review
     */
    async markForManualReview(correlationId, batch, originalQueue, deathCount) {
        console.log(`🔍 ${this.workerId} marking batch for manual review: ${correlationId} (deaths: ${deathCount})`);

        // Here you could add items to a manual review queue or database table
        console.warn(`🔔 MANUAL REVIEW REQUIRED - CorrelationId: ${correlationId}, Original Queue: ${originalQueue}, Deaths: ${deathCount}, Items: ${batch.length}`);
    }

    /**
     * Attempt to requeue the batch to original queue
     */
    async attemptRequeue(correlationId, batch, originalQueue, deathCount) {
        console.log(`🔄 ${this.workerId} attempting to requeue batch: ${correlationId} to ${originalQueue} (deaths: ${deathCount})`);

        try {
            // Add a delay before requeuing to avoid immediate re-failure
            await new Promise((resolve) => setTimeout(resolve, 5000 * deathCount)); // Exponential backoff

            // Here you could requeue the message to the original queue
            // For now, we'll just log the requeue attempt
            console.log(`🔄 REQUEUE ATTEMPT - CorrelationId: ${correlationId}, Original Queue: ${originalQueue}, Deaths: ${deathCount}, Items: ${batch.length}`);
        } catch (error) {
            console.error(`❌ ${this.workerId} failed to requeue batch: ${correlationId}`, error);
            throw error;
        }
    }

    /**
     * Stop the consumer worker
     */
    async stop() {
        console.log(`🛑 ${this.workerId} stopping...`);

        this.isRunning = false;

        // Stop the RabbitMQ consumer
        if (this.consumerInfo?.consumerTag && this.rabbitmq?.channel) {
            await this.rabbitmq.channel.cancel(this.consumerInfo.consumerTag);
        }

        // Close connections
        if (this.rabbitmq) {
            await this.rabbitmq.close();
        }

        await mongoose.connection.close();

        console.log(`✅ ${this.workerId} stopped successfully`);

        parentPort.postMessage({
            type: "status",
            status: "stopped",
            workerId: this.workerId,
        });
    }

    /**
     * Get worker statistics
     */
    getStats() {
        return {
            workerId: this.workerId,
            queueName: this.queueName,
            messagesProcessed: this.messagesProcessed,
            deadLetterMessagesHandled: this.deadLetterMessagesHandled,
            isRunning: this.isRunning,
            consumerType: "DeadLetterConsumer",
        };
    }
}

// Initialize and start the worker
const consumerWorker = new DeadLetterConsumerWorker();

// Handle messages from parent
parentPort.on("message", async (message) => {
    switch (message.type) {
        case "stop":
            await consumerWorker.stop();
            process.exit(0);
            break;
        case "getStats":
            parentPort.postMessage({
                type: "stats",
                data: consumerWorker.getStats(),
            });
            break;
        default:
            console.log(`📝 ${consumerWorker.workerId} received message:`, message);
    }
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
    console.error(`💥 ${consumerWorker.workerId} uncaught exception:`, error);
    parentPort.postMessage({
        type: "error",
        error: error.message,
        workerId: consumerWorker.workerId,
    });
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error(`💥 ${consumerWorker.workerId} unhandled rejection:`, reason);
    parentPort.postMessage({
        type: "error",
        error: reason.message || reason,
        workerId: consumerWorker.workerId,
    });
    process.exit(1);
});

// Start the worker
consumerWorker.initialize().catch((error) => {
    console.error(`❌ ${consumerWorker.workerId} failed to start:`, error);
    process.exit(1);
});

console.log(`💀 DeadLetterConsumer Worker starting: ${workerData.workerId} for queue ${workerData.queueName}`);
