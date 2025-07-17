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
 * PriorityConsumer Worker
 * Runs in a dedicated worker thread to process priority queue
 */
class PriorityConsumerWorker {
    constructor() {
        this.rabbitmq = null;
        this.queueName = workerData.queueName;
        this.workerId = workerData.workerId;
        this.workerNumber = workerData.workerNumber;
        this.consumerInfo = null;
        this.isRunning = false;
        this.messagesProcessed = 0;
        this.processingWorkers = new Map();
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
        const queueConfig = QUEUE_CONFIG.PRIORITY;

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
     * Process a message from the priority queue
     */
    async processMessage(batch, rawMsg) {
        const correlationId = rawMsg.properties.correlationId;
        const batchSize = rawMsg.properties.headers?.batchSize || batch.length;
        const priority = rawMsg.properties.priority || 0;

        console.log(`⚡ ${this.workerId} processing PRIORITY batch: ${correlationId} (${batchSize} items, priority: ${priority})`);

        try {
            // Update job status to processing with priority info
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "processing",
                    startTime: new Date(),
                    message: `Processing ${batchSize} high-priority items in worker thread`,
                    processedBy: this.workerId,
                    priority: priority,
                }
            );

            // Process the batch in a separate processing worker
            const result = await this.processInWorker(batch, correlationId, priority);

            this.messagesProcessed++;

            // Notify parent of successful processing
            parentPort.postMessage({
                type: "messageProcessed",
                workerId: this.workerId,
                correlationId,
                result,
                priority,
                messagesProcessed: this.messagesProcessed,
            });

            console.log(`✅ ${this.workerId} completed PRIORITY batch: ${correlationId}`);
        } catch (error) {
            console.error(`❌ ${this.workerId} priority processing error for ${correlationId}:`, error);

            // Update job status to failed
            await JobStatus.findOneAndUpdate(
                { correlationId },
                {
                    status: "failed",
                    endTime: new Date(),
                    message: `Priority processing failed in worker thread: ${error.message}`,
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
    async processInWorker(batch, correlationId, priority = 0) {
        return new Promise((resolve, reject) => {
            this.processingWorkerCounter++;
            const processingWorkerId = `${this.workerId}-priority-processing-${this.processingWorkerCounter}`;

            console.log(`🚀 ${this.workerId} creating PRIORITY processing worker: ${processingWorkerId} (priority: ${priority})`);

            const workerPath = path.resolve("./workers/bulkUpdateWorker.js");
            const worker = new Worker(workerPath, {
                workerData: {
                    batch: batch,
                    correlationId: correlationId,
                    workerId: processingWorkerId,
                    workerNumber: this.processingWorkerCounter,
                    parentWorkerId: this.workerId,
                    priority: priority,
                    isPriority: true,
                },
            });

            // Store worker reference
            this.processingWorkers.set(correlationId, {
                worker,
                processingWorkerId,
                startTime: new Date(),
                priority,
            });

            const cleanupWorker = () => {
                this.processingWorkers.delete(correlationId);
            };

            const timeout = setTimeout(() => {
                cleanupWorker();
                worker.terminate();
                console.log(`⏰ Priority processing worker ${processingWorkerId} terminated due to timeout`);
                reject(new Error("Priority processing worker timeout exceeded"));
            }, 300000); // 5 minute timeout

            worker.on("message", async (result) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (result.success) {
                    // Update job status to completed with priority info
                    await JobStatus.findOneAndUpdate(
                        { correlationId },
                        {
                            status: "completed",
                            progress: 100,
                            processedItems: result.processed,
                            endTime: new Date(),
                            message: `Successfully processed ${result.processed} high-priority items in worker thread`,
                            processedBy: this.workerId,
                            priority: priority,
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
                console.error(`💥 Priority processing worker ${processingWorkerId} error:`, error);
                reject(error);
            });

            worker.on("exit", (code) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (code !== 0) {
                    console.error(`🚪 Priority processing worker ${processingWorkerId} exited with code ${code}`);
                } else {
                    console.log(`🔚 Priority processing worker ${processingWorkerId} exited normally`);
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
            console.log(`🛑 Terminating priority processing worker: ${workerInfo.processingWorkerId}`);
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
            consumerType: "PriorityConsumer",
        };
    }
}

// Initialize and start the worker
const consumerWorker = new PriorityConsumerWorker();

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

console.log(`⚡ PriorityConsumer Worker starting: ${workerData.workerId} for queue ${workerData.queueName}`);
