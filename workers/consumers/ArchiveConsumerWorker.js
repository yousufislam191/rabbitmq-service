const { parentPort, workerData } = require("worker_threads");
const RabbitMQService = require("../../services/rabbitmqService");
const { Worker } = require("worker_threads");
const path = require("path");
const { QUEUE_CONFIG } = require("../../config/queues");
const config = require("../../config");

/**
 * Archive Consumer Worker
 * Dedicated worker thread for consuming archive queue messages
 */
class ArchiveConsumerWorker {
    constructor(workerData) {
        this.queueName = workerData.queueName;
        this.workerId = workerData.workerId;
        this.workerNumber = workerData.workerNumber;
        this.consumerType = workerData.consumerType;

        this.rabbitmq = null;
        this.isRunning = false;
        this.consumerTag = null;
        this.processedMessages = 0;
        this.errorCount = 0;
        this.currentProcessingWorkers = new Map();
        this.maxProcessingWorkers = 3; // Maximum concurrent archive processing workers
        this.processingWorkerCounter = 0;

        console.log(`🏗️ Archive Consumer Worker ${this.workerId} initialized for queue: ${this.queueName}`);
    }

    async initialize() {
        try {
            // Initialize RabbitMQ service with proper URL from config
            this.rabbitmq = new RabbitMQService(config.RABBITMQ_URL);
            await this.rabbitmq.connect();

            // Setup queue for archive messages
            await this.setupQueue();

            console.log(`✅ Archive Consumer Worker ${this.workerId} initialized successfully`);

            // Send ready signal to parent
            parentPort.postMessage({
                type: "ready",
                workerId: this.workerId,
                queueName: this.queueName,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error(`❌ Archive Consumer Worker ${this.workerId} initialization failed:`, error);
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            throw error;
        }
    }

    async setupQueue() {
        try {
            // Get queue configuration
            const queueConfig = Object.values(QUEUE_CONFIG).find((config) => config.name === this.queueName);
            if (!queueConfig) {
                throw new Error(`Queue configuration not found for: ${this.queueName}`);
            }

            // Assert queue with configuration
            await this.rabbitmq.assertQueue(this.queueName, queueConfig.options);

            console.log(`✅ Archive Consumer Worker ${this.workerId} queue setup complete: ${this.queueName}`);
        } catch (error) {
            console.error(`❌ Archive Consumer Worker ${this.workerId} queue setup failed:`, error);
            throw error;
        }
    }

    async startConsuming() {
        try {
            if (this.isRunning) {
                console.log(`⚠️ Archive Consumer Worker ${this.workerId} is already running`);
                return;
            }

            const queueConfig = Object.values(QUEUE_CONFIG).find((config) => config.name === this.queueName);
            const consumerOptions = {
                prefetch: queueConfig.options.prefetch || 1,
                noAck: false,
                retry: queueConfig.options.retry || false,
                maxRetries: queueConfig.options.maxRetries || 3,
                retryDelayMs: queueConfig.options.retryDelayMs || 10000,
                consumerTag: `${this.workerId}-archive-consumer`,
            };

            console.log(`🚀 Archive Consumer Worker ${this.workerId} starting to consume from: ${this.queueName}`);

            const consumerInfo = await this.rabbitmq.consume(this.queueName, this.handleMessage.bind(this), consumerOptions);

            this.consumerTag = consumerInfo.consumerTag;
            this.isRunning = true;

            console.log(`✅ Archive Consumer Worker ${this.workerId} started consuming with tag: ${this.consumerTag}`);

            // Send status update to parent
            parentPort.postMessage({
                type: "status",
                workerId: this.workerId,
                status: "consuming",
                consumerTag: this.consumerTag,
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error(`❌ Archive Consumer Worker ${this.workerId} failed to start consuming:`, error);
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
            throw error;
        }
    }

    async handleMessage(content, msg) {
        const startTime = Date.now();
        const correlationId = msg.properties.correlationId;
        let processingWorkerId = null;

        try {
            console.log(`📥 Archive Consumer Worker ${this.workerId} received message: ${correlationId}`);

            // Check if we have capacity for more processing workers
            if (this.currentProcessingWorkers.size >= this.maxProcessingWorkers) {
                console.log(`⏳ Archive Consumer Worker ${this.workerId} at capacity, waiting for processing worker...`);

                // Wait for a processing worker to become available
                await this.waitForProcessingWorkerCapacity();
            }

            // Create a dedicated processing worker for this archive message
            processingWorkerId = await this.createProcessingWorker(content, correlationId);

            console.log(`🔄 Archive Consumer Worker ${this.workerId} delegated message ${correlationId} to processing worker ${processingWorkerId}`);

            // Send message processed notification to parent
            parentPort.postMessage({
                type: "messageProcessed",
                workerId: this.workerId,
                correlationId,
                processingWorkerId,
                processingTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            });

            this.processedMessages++;
        } catch (error) {
            this.errorCount++;
            console.error(`❌ Archive Consumer Worker ${this.workerId} error processing message ${correlationId}:`, error);

            // Send error notification to parent
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                correlationId,
                error: error.message,
                processingTime: Date.now() - startTime,
                timestamp: new Date().toISOString(),
            });

            throw error;
        }
    }

    async createProcessingWorker(content, correlationId) {
        return new Promise((resolve, reject) => {
            this.processingWorkerCounter++;
            const processingWorkerId = `${this.workerId}-archive-processing-${this.processingWorkerCounter}`;

            console.log(`🚀 Archive Consumer Worker ${this.workerId} creating processing worker: ${processingWorkerId}`);

            const workerPath = path.resolve("./workers/archiveWorker.js");
            const worker = new Worker(workerPath, {
                workerData: {
                    workerId: processingWorkerId,
                    queueType: "archive",
                },
            });

            const workerInfo = {
                worker,
                workerId: processingWorkerId,
                correlationId,
                startTime: Date.now(),
                resolved: false,
            };

            this.currentProcessingWorkers.set(processingWorkerId, workerInfo);

            // Handle messages from processing worker
            worker.on("message", (message) => {
                switch (message.type) {
                    case "ready":
                        console.log(`✅ Processing worker ${processingWorkerId} is ready`);
                        // Send the archive message to the processing worker
                        worker.postMessage({
                            type: "process",
                            data: content,
                        });
                        if (!workerInfo.resolved) {
                            workerInfo.resolved = true;
                            resolve(processingWorkerId);
                        }
                        break;

                    case "processed":
                        console.log(`✅ Processing worker ${processingWorkerId} completed archive processing`);
                        this.cleanupProcessingWorker(processingWorkerId);
                        break;

                    case "error":
                        console.error(`❌ Processing worker ${processingWorkerId} error:`, message.error);
                        this.cleanupProcessingWorker(processingWorkerId);
                        if (!workerInfo.resolved) {
                            workerInfo.resolved = true;
                            reject(new Error(`Processing worker error: ${message.error}`));
                        }
                        break;
                }
            });

            // Handle worker errors
            worker.on("error", (error) => {
                console.error(`❌ Processing worker ${processingWorkerId} worker error:`, error);
                this.cleanupProcessingWorker(processingWorkerId);
                if (!workerInfo.resolved) {
                    workerInfo.resolved = true;
                    reject(error);
                }
            });

            // Handle worker exit
            worker.on("exit", (code) => {
                console.log(`🔌 Processing worker ${processingWorkerId} exited with code: ${code}`);
                this.cleanupProcessingWorker(processingWorkerId);
            });

            // Set timeout for worker creation
            setTimeout(() => {
                if (!workerInfo.resolved) {
                    workerInfo.resolved = true;
                    this.cleanupProcessingWorker(processingWorkerId);
                    reject(new Error(`Processing worker ${processingWorkerId} creation timeout`));
                }
            }, 30000); // 30 second timeout
        });
    }

    cleanupProcessingWorker(processingWorkerId) {
        const workerInfo = this.currentProcessingWorkers.get(processingWorkerId);
        if (workerInfo) {
            try {
                if (!workerInfo.worker.exitCode) {
                    workerInfo.worker.terminate();
                }
            } catch (error) {
                console.warn(`⚠️ Error terminating processing worker ${processingWorkerId}:`, error.message);
            }
            this.currentProcessingWorkers.delete(processingWorkerId);
            console.log(`🧹 Processing worker ${processingWorkerId} cleaned up`);
        }
    }

    async waitForProcessingWorkerCapacity(timeout = 30000) {
        const startTime = Date.now();
        while (this.currentProcessingWorkers.size >= this.maxProcessingWorkers && Date.now() - startTime < timeout) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (this.currentProcessingWorkers.size >= this.maxProcessingWorkers) {
            throw new Error("Timeout waiting for processing worker capacity");
        }
    }

    async stop() {
        try {
            console.log(`🛑 Archive Consumer Worker ${this.workerId} stopping...`);
            this.isRunning = false;

            // Stop consuming
            if (this.consumerTag) {
                await this.rabbitmq.channel.cancel(this.consumerTag);
                this.consumerTag = null;
            }

            // Cleanup all processing workers
            for (const [processingWorkerId, workerInfo] of this.currentProcessingWorkers) {
                console.log(`🛑 Terminating processing worker: ${processingWorkerId}`);
                try {
                    await workerInfo.worker.terminate();
                } catch (error) {
                    console.warn(`⚠️ Error terminating processing worker ${processingWorkerId}:`, error.message);
                }
            }
            this.currentProcessingWorkers.clear();

            // Close RabbitMQ connection
            if (this.rabbitmq) {
                await this.rabbitmq.close();
            }

            console.log(`✅ Archive Consumer Worker ${this.workerId} stopped successfully`);

            // Send stop notification to parent
            parentPort.postMessage({
                type: "stopped",
                workerId: this.workerId,
                finalStats: {
                    processedMessages: this.processedMessages,
                    errorCount: this.errorCount,
                },
                timestamp: new Date().toISOString(),
            });
        } catch (error) {
            console.error(`❌ Archive Consumer Worker ${this.workerId} stop error:`, error);
            parentPort.postMessage({
                type: "error",
                workerId: this.workerId,
                error: error.message,
                timestamp: new Date().toISOString(),
            });
        }
    }

    getStatus() {
        return {
            workerId: this.workerId,
            queueName: this.queueName,
            isRunning: this.isRunning,
            consumerTag: this.consumerTag,
            processedMessages: this.processedMessages,
            errorCount: this.errorCount,
            activeProcessingWorkers: this.currentProcessingWorkers.size,
            maxProcessingWorkers: this.maxProcessingWorkers,
        };
    }
}

// Initialize and set up message handling
(async () => {
    try {
        const consumer = new ArchiveConsumerWorker(workerData);

        // Handle messages from parent process
        parentPort.on("message", async (message) => {
            try {
                switch (message.type) {
                    case "start":
                        await consumer.startConsuming();
                        break;

                    case "stop":
                        await consumer.stop();
                        process.exit(0);
                        break;

                    case "status":
                        parentPort.postMessage({
                            type: "status",
                            data: consumer.getStatus(),
                            timestamp: new Date().toISOString(),
                        });
                        break;

                    default:
                        console.warn(`⚠️ Archive Consumer Worker ${consumer.workerId} received unknown message type: ${message.type}`);
                }
            } catch (error) {
                console.error(`❌ Archive Consumer Worker ${consumer.workerId} message handling error:`, error);
                parentPort.postMessage({
                    type: "error",
                    workerId: consumer.workerId,
                    error: error.message,
                    messageType: message.type,
                    timestamp: new Date().toISOString(),
                });
            }
        });

        // Initialize the consumer
        await consumer.initialize();
        await consumer.startConsuming();

        console.log(`🚀 Archive Consumer Worker ${consumer.workerId} is ready and consuming from ${consumer.queueName}`);
    } catch (error) {
        console.error("❌ Archive Consumer Worker initialization failed:", error);
        parentPort.postMessage({
            type: "error",
            error: error.message,
            timestamp: new Date().toISOString(),
        });
        process.exit(1);
    }
})();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    console.error("❌ Archive Consumer Worker uncaught exception:", error);
    parentPort.postMessage({
        type: "uncaughtException",
        error: error.message,
        timestamp: new Date().toISOString(),
    });
    process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("❌ Archive Consumer Worker unhandled rejection:", reason);
    parentPort.postMessage({
        type: "unhandledRejection",
        error: reason.message || reason,
        timestamp: new Date().toISOString(),
    });
    process.exit(1);
});
