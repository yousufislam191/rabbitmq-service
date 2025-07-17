const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");
const config = require("../../config");
const db = require("../../config/db");
const RabbitMQService = require("../../services/rabbitmqService");
const JobStatus = require("../../models/jobStatus");
const { Worker } = require("worker_threads");
const path = require("path");
const { QUEUE_CONFIG, EXCHANGE_CONFIG } = require("../../config/queues");

/**
 * ProcessingConsumer Worker
 * Runs in a dedicated worker thread to process main processing queue
 */
class ProcessingConsumerWorker {
    constructor() {
        this.rabbitmq = null;
        this.queueName = workerData.queueName;
        this.workerId = workerData.workerId;
        this.workerNumber = workerData.workerNumber;
        this.consumerInfo = null;
        this.isRunning = false;
        this.messagesProcessed = 0;
        this.processingWorkers = new Map(); // Track processing workers created by this consumer
        this.processingWorkerCounter = 0;
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
        const queueConfig = QUEUE_CONFIG.PROCESSING;

        this.consumerInfo = await this.rabbitmq.consume(
            this.queueName,
            async (batch, rawMsg) => {
                await this.processMessage(batch, rawMsg);
            },
            {
                prefetch: queueConfig.options.prefetch,
                retry: queueConfig.options.retry,
                maxRetries: queueConfig.options.maxRetries,
                retryDelayMs: queueConfig.options.retryDelayMs,
                deadLetterExchange: EXCHANGE_CONFIG.DEAD_LETTER.name,
                noAck: queueConfig.options.noAck || false,
            }
        );

        console.log(`🔗 ${this.workerId} consumer setup for ${this.queueName}`);
    }

    /**
     * Process a message from the queue
     */
    async processMessage(batch, rawMsg) {
        const correlationId = rawMsg.properties.correlationId;
        const batchSize = rawMsg.properties.headers?.batchSize || batch.length;

        console.log(`📥 ${this.workerId} processing batch: ${correlationId} (${batchSize} items)`);

        try {
            // Update job status to processing
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "processing",
                    startTime: new Date(),
                    message: `Processing ${batchSize} items in worker thread`,
                    processedBy: this.workerId,
                }
            );

            // Process the batch in a separate processing worker to keep this consumer thread free
            const result = await this.processInWorker(batch, correlationId);

            this.messagesProcessed++;

            // Notify parent of successful processing
            parentPort.postMessage({
                type: "messageProcessed",
                workerId: this.workerId,
                correlationId,
                result,
                messagesProcessed: this.messagesProcessed,
            });

            console.log(`✅ ${this.workerId} completed batch: ${correlationId}`);
        } catch (error) {
            console.error(`❌ ${this.workerId} processing error for ${correlationId}:`, error);

            // Update job status to failed
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "failed",
                    endTime: new Date(),
                    message: `Processing failed in worker thread: ${error.message}`,
                    error: error.message,
                }
            );

            // Notify parent of error
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                correlationId,
                error: error.message,
            });
        }
    }

    /**
     * Process batch in a dedicated processing worker thread
     */
    async processInWorker(batch, correlationId) {
        return new Promise((resolve, reject) => {
            this.processingWorkerCounter++;
            const processingWorkerId = `${this.workerId}-processing-${this.processingWorkerCounter}`;

            console.log(`🚀 ${this.workerId} creating processing worker: ${processingWorkerId}`);

            const workerPath = path.resolve("./workers/bulkUpdateWorker.js");
            const worker = new Worker(workerPath, {
                workerData: {
                    batch: batch,
                    correlationId: correlationId,
                    workerId: processingWorkerId,
                    workerNumber: this.processingWorkerCounter,
                    parentWorkerId: this.workerId,
                },
            });

            // Store worker reference
            this.processingWorkers.set(correlationId, {
                worker,
                processingWorkerId,
                startTime: new Date(),
            });

            const cleanupWorker = () => {
                this.processingWorkers.delete(correlationId);
            };

            const timeout = setTimeout(() => {
                cleanupWorker();
                worker.terminate();
                console.log(`⏰ Processing worker ${processingWorkerId} terminated due to timeout`);
                reject(new Error("Processing worker timeout exceeded"));
            }, 300000); // 5 minute timeout

            worker.on("message", async (result) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (result.success) {
                    // Update job status to completed
                    await JobStatus.findOneAndUpdate(
                        { correlationId },
                        {
                            status: "completed",
                            progress: 100,
                            processedItems: result.processed,
                            endTime: new Date(),
                            message: `Successfully processed ${result.processed} items in worker thread`,
                            processedBy: this.workerId,
                        }
                    );

                    resolve(result);
                } else {
                    reject(new Error(result.error));
                }
            });

            worker.on("error", (error) => {
                clearTimeout(timeout);
                cleanupWorker();
                console.error(`💥 Processing worker ${processingWorkerId} error:`, error);
                reject(error);
            });

            worker.on("exit", (code) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (code !== 0) {
                    console.error(`🚪 Processing worker ${processingWorkerId} exited with code ${code}`);
                } else {
                    console.log(`🔚 Processing worker ${processingWorkerId} exited normally`);
                }
            });
        });
    }

    /**
     * Stop the consumer worker
     */
    async stop() {
        console.log(`🛑 ${this.workerId} stopping...`);

        this.isRunning = false;

        // Terminate all processing workers
        for (const [correlationId, workerInfo] of this.processingWorkers) {
            console.log(`🛑 Terminating processing worker: ${workerInfo.processingWorkerId}`);
            await workerInfo.worker.terminate();
        }
        this.processingWorkers.clear();

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
            isRunning: this.isRunning,
            activeProcessingWorkers: this.processingWorkers.size,
            totalProcessingWorkersCreated: this.processingWorkerCounter,
        };
    }
}

// Initialize and start the worker
const consumerWorker = new ProcessingConsumerWorker();

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

console.log(`🎯 ProcessingConsumer Worker starting: ${workerData.workerId} for queue ${workerData.queueName}`);
