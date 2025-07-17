const queueService = require("./queueService");
const JobStatus = require("../models/jobStatus");
const { Worker } = require("worker_threads");
const path = require("path");
const { ValidationError } = require("../utils/errors");
const { QueueManager, QUEUE_CONFIG } = require("../config/queues");
const ConsumerWorkerManager = require("./ConsumerWorkerManager");

class ConsumerService {
    constructor() {
        this.rabbitmq = null;
        this.consumers = new Map();
        this.workers = new Map();
        this.isStarted = false;
        this.workerCounter = 0; // Track total workers created
        this.activeWorkers = 0; // Track currently active workers

        // Consumer Worker Manager for running consumers in worker threads
        this.consumerWorkerManager = new ConsumerWorkerManager();
    }

    async initialize() {
        try {
            // Initialize queue service first
            await queueService.initialize();

            // Reuse the queue service's RabbitMQ connection instead of creating our own
            this.rabbitmq = queueService.rabbitmq;

            // Initialize consumer worker manager for worker thread consumers
            await this.consumerWorkerManager.initialize();
            console.log("✅ Consumer service initialized with worker thread consumers");

            // Setup event listeners
            this.setupEventListeners();
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

    async processInWorker(batch, correlationId, queueName = "unknown") {
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

            // Store worker reference with cleanup flag and queue name
            this.workers.set(correlationId, {
                worker,
                cleaned: false,
                queueName: queueName,
                workerId: workerId,
                startTime: new Date(),
            });

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

                        // Note: Migration status update removed as migration functionality is no longer needed
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

    async startAllConsumers() {
        if (this.isStarted) {
            console.log("⚠️ Consumers already started");
            return;
        }

        try {
            await this.initialize();

            // Start consumers in worker threads
            await this.consumerWorkerManager.startAllConsumerWorkers();
            console.log("✅ All consumer workers started successfully in worker threads");

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
            // Terminate all active processing workers
            for (const [correlationId, workerInfo] of this.workers) {
                console.log(`🛑 Terminating processing worker: ${correlationId}`);
                await workerInfo.worker.terminate();
            }
            this.workers.clear();

            // Stop all consumer workers
            await this.consumerWorkerManager.stopAllConsumerWorkers();
            console.log("🛑 All consumer workers stopped");

            // Close RabbitMQ connection
            if (this.rabbitmq) {
                await this.rabbitmq.close();
            }

            this.consumers.clear();
            this.isStarted = false;
        } catch (error) {
            console.error("❌ Error stopping consumers:", error.message);
            throw error;
        }
    }

    /**
     * Start a specific consumer worker
     */
    async startConsumer(queueName) {
        // Determine consumer type based on queue name
        let consumerType;
        if (queueName === QUEUE_CONFIG.PROCESSING.name) {
            consumerType = "ProcessingConsumer";
        } else if (queueName === QUEUE_CONFIG.PRIORITY.name) {
            consumerType = "PriorityConsumer";
        } else if (queueName === QUEUE_CONFIG.DEAD_LETTER.name) {
            consumerType = "DeadLetterConsumer";
        } else if (queueName === QUEUE_CONFIG.ARCHIVE.name) {
            consumerType = "ArchiveConsumer";
        } else {
            throw new ValidationError(`Unknown queue name: ${queueName}`);
        }

        const workerInfo = await this.consumerWorkerManager.startConsumerWorker(consumerType, queueName);
        return {
            success: true,
            message: `Consumer worker started for ${queueName}`,
            workerId: workerInfo.workerId,
            consumerType,
        };
    }

    /**
     * Stop a specific consumer worker
     */
    async stopConsumer(queueName) {
        await this.consumerWorkerManager.stopConsumerWorker(queueName);
        return {
            success: true,
            message: `Consumer worker stopped for ${queueName}`,
        };
    }

    /**
     * Restart a specific consumer worker
     */
    async restartConsumer(queueName) {
        await this.consumerWorkerManager.restartConsumerWorker(queueName);
        return {
            success: true,
            message: `Consumer worker restarted for ${queueName}`,
        };
    }

    /**
     * Get consumer status including worker thread information
     */
    getConsumerStatus(queueName = null) {
        const workerStats = this.consumerWorkerManager.getConsumerWorkerStats();

        if (queueName) {
            // Return status for specific consumer worker
            const specificWorker = workerStats.workers.find((worker) => worker.queueName === queueName);

            if (!specificWorker) {
                throw new ValidationError(`No consumer worker found for queue: ${queueName}`);
            }

            return {
                queueName,
                worker: specificWorker,
                processingWorkers: {
                    totalCreated: this.workerCounter,
                    currentlyActive: this.activeWorkers,
                    activeWorkers: Array.from(this.workers.entries())
                        .filter(([_, info]) => info.queueName === queueName)
                        .map(([correlationId, info]) => ({
                            correlationId,
                            workerId: info.workerId,
                            startTime: info.startTime,
                            uptime: Date.now() - info.startTime.getTime(),
                        })),
                },
            };
        }

        return {
            mode: "worker-threads",
            isStarted: this.isStarted,
            consumerWorkers: workerStats,
            processingWorkers: {
                totalCreated: this.workerCounter,
                currentlyActive: this.activeWorkers,
                activeWorkers: Array.from(this.workers.keys()),
            },
        };
    }

    /**
     * Get consumer health including worker thread health
     */
    async getConsumerHealth() {
        const workerHealth = this.consumerWorkerManager.getHealthStatus();

        return {
            status: workerHealth.status,
            timestamp: new Date().toISOString(),
            consumerWorkers: workerHealth,
            processingWorkers: {
                totalCreated: this.workerCounter,
                currentlyActive: this.activeWorkers,
            },
            rabbitMQ: {
                connected: !!this.rabbitmq?.isConnected,
            },
        };
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

    /**
     * Get detailed worker statistics
     */
    getDetailedWorkerStats() {
        const stats = {
            consumerMode: "worker-threads",
            isStarted: this.isStarted,
            processingWorkers: {
                totalCreated: this.workerCounter,
                currentlyActive: this.activeWorkers,
                activeWorkers: Array.from(this.workers.entries()).map(([correlationId, info]) => ({
                    correlationId,
                    workerId: info.workerId,
                    queueName: info.queueName,
                    startTime: info.startTime,
                    uptime: Date.now() - info.startTime.getTime(),
                })),
            },
            consumerWorkers: this.consumerWorkerManager.getConsumerWorkerStats(),
        };

        return stats;
    }

    /**
     * Get available queues from configuration
     */
    getAvailableQueues() {
        return {
            queues: [
                {
                    name: QUEUE_CONFIG.PROCESSING.name,
                    type: "processing",
                    description: "Main processing queue",
                },
                {
                    name: QUEUE_CONFIG.PRIORITY.name,
                    type: "priority",
                    description: "High priority processing queue",
                },
                {
                    name: QUEUE_CONFIG.DEAD_LETTER.name,
                    type: "dead-letter",
                    description: "Dead letter queue for failed messages",
                },
            ],
            total: 3,
        };
    }
}

module.exports = new ConsumerService();
