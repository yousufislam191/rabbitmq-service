const RabbitMQService = require("./rabbitmqService");
const queueService = require("./queueService");
const JobStatus = require("../models/jobStatus");
const { Worker } = require("worker_threads");
const path = require("path");
const config = require("../config");

class ConsumerService {
    constructor() {
        this.rabbitmq = null;
        this.consumers = new Map();
        this.workers = new Map();
        this.isStarted = false;
        this.workerCounter = 0; // Track total workers created
        this.activeWorkers = 0; // Track currently active workers
    }

    async initialize() {
        try {
            // Initialize queue service first
            await queueService.initialize();

            // Reuse the queue service's RabbitMQ connection instead of creating our own
            this.rabbitmq = queueService.rabbitmq;

            // Setup event listeners
            this.setupEventListeners();

            console.log("✅ Consumer service initialized using shared connection");
        } catch (error) {
            console.error("❌ Failed to initialize consumer service:", error.message);
            throw error;
        }
    }

    setupEventListeners() {
        this.rabbitmq.on("messageProcessed", (data) => {});

        this.rabbitmq.on("messageError", (data) => {
            console.error(`❌ Message error: ${data.correlationId} - ${data.error.message}`);
        });

        this.rabbitmq.on("messageRetried", (data) => {});

        this.rabbitmq.on("messageSentToDeadLetter", (data) => {
            console.warn(`💀 Message sent to DLQ: ${data.correlationId}`);
        });

        this.rabbitmq.on("connectionError", async () => {
            console.warn("🔌 Consumer connection error, attempting to restart consumers...");
            await this.restartConsumers();
        });
    }

    async processInWorker(batch, correlationId) {
        return new Promise((resolve, reject) => {
            // Increment worker counter
            this.workerCounter++;
            this.activeWorkers++;

            const workerId = `worker-${this.workerCounter}`;
            console.log(`🚀 Creating Worker #${this.workerCounter} (${workerId}) for correlationId: ${correlationId}`);
            console.log(`📊 Worker Statistics: ${this.workerCounter} total workers created, ${this.activeWorkers} currently active`);

            const workerPath = path.resolve("./workers/bulkUpdateWorker.js");
            const worker = new Worker(workerPath, {
                workerData: {
                    batch: batch,
                    correlationId: correlationId,
                    workerId: workerId,
                    workerNumber: this.workerCounter,
                },
            });

            // Store worker reference with cleanup flag
            this.workers.set(correlationId, { worker, cleaned: false });

            const cleanupWorker = () => {
                const workerInfo = this.workers.get(correlationId);
                if (workerInfo && !workerInfo.cleaned) {
                    this.workers.delete(correlationId);
                    this.activeWorkers--;
                    workerInfo.cleaned = true;
                }
            };

            const timeout = setTimeout(() => {
                cleanupWorker();
                worker.terminate();
                console.log(`⏰ Worker ${workerId} terminated due to timeout`);
                reject(new Error("Worker timeout exceeded"));
            }, 300000); // 5 minute timeout

            worker.on("message", async (result) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (result.success) {
                    // Update job status to completed
                    try {
                        // Try simple update first
                        const updatedJob = await JobStatus.findOneAndUpdate(
                            { correlationId },
                            {
                                $set: {
                                    status: "completed",
                                    progress: 100,
                                    processedItems: result.processed,
                                    endTime: new Date(),
                                    message: `Successfully processed ${result.processed} items`,
                                    updatedAt: new Date(),
                                },
                            },
                            { new: true }
                        );

                        // Check if this batch belongs to a migration and update migration status
                        if (updatedJob && updatedJob.parentJobId) {
                            try {
                                const migrationService = require("./migrationService");
                                await migrationService.checkAndUpdateMigrationStatus(updatedJob.parentJobId);
                            } catch (migrationError) {
                                console.warn(`⚠️  Failed to update migration status for ${updatedJob.parentJobId}:`, migrationError.message);
                            }
                        }
                    } catch (error) {
                        console.warn(`⚠️  Failed to update job status for ${correlationId} but continuing:`, error.message);
                    }

                    resolve(result);
                } else {
                    console.error(`❌ Worker #${this.workerCounter} (${workerId}) failed:`, result.error);

                    // Update job status to failed
                    try {
                        await JobStatus.findOneAndUpdate(
                            { correlationId },
                            {
                                $set: {
                                    status: "failed",
                                    endTime: new Date(),
                                    message: `Processing failed: ${result.error}`,
                                    error: result.error,
                                    updatedAt: new Date(),
                                },
                            }
                        );
                    } catch (error) {
                        console.warn(`⚠️  Failed to update failed job status for ${correlationId}:`, error.message);
                    }

                    reject(new Error(result.error));
                }
            });

            worker.on("error", (error) => {
                clearTimeout(timeout);
                cleanupWorker();
                console.error(`💥 Worker #${this.workerCounter} (${workerId}) error:`, error);
                reject(error);
            });

            worker.on("exit", (code) => {
                clearTimeout(timeout);
                cleanupWorker();

                if (code !== 0) {
                    const error = new Error(`Worker exited with code ${code}`);
                    console.error(`🚪 Worker #${this.workerCounter} (${workerId}) exit:`, error.message);
                } else {
                    console.log(`🔚 Worker #${this.workerCounter} (${workerId}) exited normally`);
                }
            });
        });
    }

    async startProcessingConsumer() {
        try {
            const consumerInfo = await this.rabbitmq.consume(
                "app.processing.queue",
                async (batch, rawMsg) => {
                    const correlationId = rawMsg.properties.correlationId;
                    const batchSize = rawMsg.properties.headers?.batchSize || batch.length;

                    // Update job status to processing
                    try {
                        await JobStatus.findOneAndUpdate(
                            { correlationId },
                            {
                                status: "processing",
                                startTime: new Date(),
                                message: `Processing ${batchSize} items`,
                            }
                        );
                    } catch (error) {
                        console.error(`❌ Failed to update job status for ${correlationId}:`, error.message);
                    }

                    await this.processInWorker(batch, correlationId);
                },
                {
                    prefetch: 1,
                    retry: true,
                    maxRetries: 3,
                    retryDelayMs: 10000,
                    deadLetterExchange: "app.deadletter.exchange",
                }
            );

            this.consumers.set("processing", consumerInfo);
        } catch (error) {
            console.error("❌ Failed to start processing consumer:", error.message);
            throw error;
        }
    }

    async startPriorityConsumer() {
        try {
            const consumerInfo = await this.rabbitmq.consume(
                "app.priority.queue",
                async (batch, rawMsg) => {
                    const correlationId = rawMsg.properties.correlationId;
                    const priority = rawMsg.properties.priority || 0;

                    console.log(`⚡ Processing priority batch: ${correlationId} (priority: ${priority})`);

                    await this.processInWorker(batch, correlationId);
                },
                {
                    prefetch: 2, // Higher prefetch for priority queue
                    retry: true,
                    maxRetries: 5, // More retries for priority messages
                    retryDelayMs: 5000, // Faster retry for priority
                    deadLetterExchange: "app.deadletter.exchange",
                }
            );

            this.consumers.set("priority", consumerInfo);
        } catch (error) {
            console.error("❌ Failed to start priority consumer:", error.message);
            throw error;
        }
    }

    async startDeadLetterConsumer() {
        try {
            const consumerInfo = await this.rabbitmq.consume(
                "app.deadletter.queue",
                async (message, rawMsg) => {
                    const correlationId = rawMsg.properties.correlationId;
                    const deathReason = rawMsg.properties.headers?.["x-death-reason"];

                    console.log(`💀 Dead letter message received: ${correlationId}`);
                    console.log(`   Reason: ${deathReason}`);

                    // Log to monitoring system, send alerts, etc.
                    // For now, just acknowledge the message
                    console.log(`📝 Dead letter message logged: ${correlationId}`);
                },
                {
                    prefetch: 10,
                    retry: false, // Don't retry dead letter messages
                    noAck: false,
                }
            );

            this.consumers.set("deadletter", consumerInfo);
        } catch (error) {
            console.error("❌ Failed to start dead letter consumer:", error.message);
            throw error;
        }
    }

    async startAllConsumers() {
        if (this.isStarted) {
            console.log("⚠️ Consumers already started");
            return;
        }

        try {
            await this.initialize();

            // Start all consumers
            await Promise.all([this.startProcessingConsumer(), this.startPriorityConsumer(), this.startDeadLetterConsumer()]);

            this.isStarted = true;
        } catch (error) {
            console.error("❌ Failed to start consumers:", error.message);
            throw error;
        }
    }

    async restartConsumers() {
        try {
            console.log("🔄 Restarting consumers...");

            await this.stopAllConsumers();
            await this.startAllConsumers();

            console.log("✅ Consumers restarted successfully");
        } catch (error) {
            console.error("❌ Failed to restart consumers:", error.message);
            throw error;
        }
    }

    async stopAllConsumers() {
        try {
            // Terminate all active workers
            for (const [correlationId, workerInfo] of this.workers) {
                console.log(`🛑 Terminating worker: ${correlationId}`);
                await workerInfo.worker.terminate();
            }
            this.workers.clear();

            // Close RabbitMQ connection
            if (this.rabbitmq) {
                await this.rabbitmq.close();
            }

            this.consumers.clear();
            this.isStarted = false;

            console.log("🛑 All consumers stopped");
        } catch (error) {
            console.error("❌ Error stopping consumers:", error.message);
            throw error;
        }
    }

    getConsumerStatus() {
        return {
            isStarted: this.isStarted,
            consumers: Array.from(this.consumers.keys()),
            activeWorkers: this.workers.size,
            workerIds: Array.from(this.workers.keys()),
            connection: this.rabbitmq ? this.rabbitmq.getConnectionStatus() : null,
        };
    }

    async getConsumerHealth() {
        try {
            const status = this.getConsumerStatus();
            const rabbitmqHealth = this.rabbitmq ? await this.rabbitmq.healthCheck() : null;

            return {
                status: this.isStarted && rabbitmqHealth?.status === "healthy" ? "healthy" : "unhealthy",
                timestamp: new Date(),
                consumers: status,
                rabbitmq: rabbitmqHealth,
            };
        } catch (error) {
            return {
                status: "unhealthy",
                error: error.message,
                timestamp: new Date(),
            };
        }
    }

    getWorkerStatistics() {
        // Ensure activeWorkers is never negative and matches reality
        const actualActiveWorkers = this.workers.size;
        if (this.activeWorkers !== actualActiveWorkers) {
            console.warn(`⚠️ Worker count mismatch detected. Correcting: ${this.activeWorkers} -> ${actualActiveWorkers}`);
            this.activeWorkers = actualActiveWorkers;
        }

        return {
            totalWorkersCreated: this.workerCounter,
            activeWorkers: Math.max(0, this.activeWorkers),
            completedWorkers: Math.max(0, this.workerCounter - this.activeWorkers),
            timestamp: new Date(),
        };
    }

    resetWorkerCounter() {
        const stats = this.getWorkerStatistics();
        this.workerCounter = 0;
        // Fix negative active workers by setting to actual active count
        this.activeWorkers = Math.max(0, this.workers.size);
        console.log(`🔄 Worker counter reset. Previous stats:`, stats);
        return stats;
    }

    // Add method to fix any existing counter mismatches
    fixWorkerCounters() {
        const actualActiveWorkers = this.workers.size;
        const previousActiveWorkers = this.activeWorkers;

        // Correct the active workers to match actual active workers
        this.activeWorkers = actualActiveWorkers;

        // If activeWorkers was negative, we need to adjust workerCounter
        if (previousActiveWorkers < 0) {
            this.workerCounter = Math.max(0, this.workerCounter + Math.abs(previousActiveWorkers));
        }

        return {
            corrected: previousActiveWorkers !== actualActiveWorkers,
            previousActiveWorkers,
            currentActiveWorkers: this.activeWorkers,
            actualActiveWorkers,
            timestamp: new Date(),
        };
    }
}

module.exports = new ConsumerService();
