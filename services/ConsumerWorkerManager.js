const { Worker } = require("worker_threads");
const path = require("path");
const { ValidationError } = require("../utils/errors");
const { QueueManager, QUEUE_CONFIG } = require("../config/queues");

/**
 * ConsumerWorkerManager
 * Manages consumer worker threads to keep main thread free
 */
class ConsumerWorkerManager {
    constructor() {
        this.consumerWorkers = new Map(); // Track consumer worker threads
        this.workerStats = new Map(); // Track worker statistics
        this.isInitialized = false;
        this.totalWorkersCreated = 0;
        this.activeConsumerWorkers = 0;
    }

    /**
     * Initialize the consumer worker manager
     */
    async initialize() {
        if (this.isInitialized) {
            console.log("⚠️ ConsumerWorkerManager already initialized");
            return;
        }

        this.isInitialized = true;
        console.log("✅ ConsumerWorkerManager initialized");
    }

    /**
     * Start a consumer in a dedicated worker thread
     */
    async startConsumerWorker(consumerType, queueName) {
        if (this.consumerWorkers.has(queueName)) {
            console.log(`⚠️ Consumer worker for ${queueName} already running`);
            return this.consumerWorkers.get(queueName);
        }

        this.totalWorkersCreated++;
        this.activeConsumerWorkers++;

        const workerId = `consumer-worker-${this.totalWorkersCreated}`;
        const workerPath = path.resolve(`./workers/consumers/${consumerType}Worker.js`);

        console.log(`🚀 Creating Consumer Worker #${this.totalWorkersCreated} (${workerId}) for queue: ${queueName}`);
        console.log(`📊 Consumer Worker Statistics: ${this.totalWorkersCreated} total created, ${this.activeConsumerWorkers} currently active`);

        const worker = new Worker(workerPath, {
            workerData: {
                queueName,
                workerId,
                workerNumber: this.totalWorkersCreated,
                consumerType,
            },
        });

        const workerInfo = {
            worker,
            workerId,
            queueName,
            consumerType,
            startTime: new Date(),
            status: "starting",
            messagesProcessed: 0,
            lastActivity: new Date(),
        };

        this.consumerWorkers.set(queueName, workerInfo);
        this.workerStats.set(workerId, {
            queueName,
            consumerType,
            startTime: new Date(),
            messagesProcessed: 0,
            errors: 0,
            restarts: 0,
        });

        // Setup worker event handlers
        this.setupWorkerEventHandlers(worker, workerInfo);

        return workerInfo;
    }

    /**
     * Setup event handlers for a consumer worker
     */
    setupWorkerEventHandlers(worker, workerInfo) {
        worker.on("message", (message) => {
            this.handleWorkerMessage(message, workerInfo);
        });

        worker.on("error", (error) => {
            console.error(`💥 Consumer Worker ${workerInfo.workerId} error:`, error);
            this.handleWorkerError(error, workerInfo);
        });

        worker.on("exit", (code) => {
            this.handleWorkerExit(code, workerInfo);
        });
    }

    /**
     * Handle messages from consumer workers
     */
    handleWorkerMessage(message, workerInfo) {
        const stats = this.workerStats.get(workerInfo.workerId);

        switch (message.type) {
            case "ready":
                workerInfo.status = "ready";
                console.log(`✅ Consumer Worker ${workerInfo.workerId} is ready for queue: ${workerInfo.queueName}`);
                break;

            case "messageProcessed":
                workerInfo.messagesProcessed++;
                workerInfo.lastActivity = new Date();
                if (stats) stats.messagesProcessed++;
                console.log(`📥 Consumer Worker ${workerInfo.workerId} processed message for ${workerInfo.queueName}`);
                break;

            case "error":
                if (stats) stats.errors++;
                console.error(`❌ Consumer Worker ${workerInfo.workerId} reported error:`, message.error);
                break;

            case "status":
                workerInfo.status = message.status;
                workerInfo.lastActivity = new Date();
                break;

            default:
                console.log(`📝 Consumer Worker ${workerInfo.workerId} message:`, message);
        }
    }

    /**
     * Handle worker errors
     */
    handleWorkerError(error, workerInfo) {
        workerInfo.status = "error";
        const stats = this.workerStats.get(workerInfo.workerId);
        if (stats) stats.errors++;

        // Auto-restart on error after a delay
        setTimeout(async () => {
            console.log(`🔄 Auto-restarting consumer worker for ${workerInfo.queueName}`);
            await this.restartConsumerWorker(workerInfo.queueName);
        }, 5000);
    }

    /**
     * Handle worker exit
     */
    handleWorkerExit(code, workerInfo) {
        const stats = this.workerStats.get(workerInfo.workerId);

        if (code !== 0) {
            console.error(`🚪 Consumer Worker ${workerInfo.workerId} exited with code ${code}`);
            workerInfo.status = "crashed";
        } else {
            console.log(`🔚 Consumer Worker ${workerInfo.workerId} exited normally`);
            workerInfo.status = "stopped";
        }

        // Clean up
        this.consumerWorkers.delete(workerInfo.queueName);
        this.activeConsumerWorkers--;

        // Auto-restart if it was an unexpected exit
        if (code !== 0 && workerInfo.status !== "stopping") {
            if (stats) stats.restarts++;
            setTimeout(async () => {
                console.log(`🔄 Auto-restarting crashed consumer worker for ${workerInfo.queueName}`);
                await this.restartConsumerWorker(workerInfo.queueName);
            }, 5000);
        }
    }

    /**
     * Stop a specific consumer worker
     */
    async stopConsumerWorker(queueName) {
        const workerInfo = this.consumerWorkers.get(queueName);
        if (!workerInfo) {
            console.log(`⚠️ No consumer worker found for queue: ${queueName}`);
            return;
        }

        workerInfo.status = "stopping";
        console.log(`🛑 Stopping consumer worker for queue: ${queueName}`);

        try {
            // Send stop signal to worker
            workerInfo.worker.postMessage({ type: "stop" });

            // Wait a bit for graceful shutdown
            await new Promise((resolve) => setTimeout(resolve, 2000));

            // Force terminate if still running
            await workerInfo.worker.terminate();

            this.consumerWorkers.delete(queueName);
            this.activeConsumerWorkers--;

            console.log(`✅ Consumer worker stopped for queue: ${queueName}`);
        } catch (error) {
            console.error(`❌ Error stopping consumer worker for ${queueName}:`, error.message);
        }
    }

    /**
     * Restart a consumer worker
     */
    async restartConsumerWorker(queueName) {
        const workerInfo = this.consumerWorkers.get(queueName);
        if (workerInfo) {
            const consumerType = workerInfo.consumerType;
            await this.stopConsumerWorker(queueName);

            // Wait a bit before restarting
            await new Promise((resolve) => setTimeout(resolve, 1000));

            return await this.startConsumerWorker(consumerType, queueName);
        }
    }

    /**
     * Start all consumer workers
     */
    async startAllConsumerWorkers() {
        const consumers = [
            { type: "ProcessingConsumer", queueName: QUEUE_CONFIG.PROCESSING.name },
            { type: "PriorityConsumer", queueName: QUEUE_CONFIG.PRIORITY.name },
            { type: "DeadLetterConsumer", queueName: QUEUE_CONFIG.DEAD_LETTER.name },
            { type: "ArchiveConsumer", queueName: QUEUE_CONFIG.ARCHIVE.name },
        ];

        const startPromises = consumers.map((consumer) => this.startConsumerWorker(consumer.type, consumer.queueName));

        await Promise.all(startPromises);
        console.log("✅ All consumer workers started");
    }

    /**
     * Stop all consumer workers
     */
    async stopAllConsumerWorkers() {
        const stopPromises = Array.from(this.consumerWorkers.keys()).map((queueName) => this.stopConsumerWorker(queueName));

        await Promise.all(stopPromises);
        this.consumerWorkers.clear();
        this.activeConsumerWorkers = 0;
        console.log("🛑 All consumer workers stopped");
    }

    /**
     * Get consumer worker statistics
     */
    getConsumerWorkerStats() {
        const workers = Array.from(this.consumerWorkers.values()).map((workerInfo) => ({
            workerId: workerInfo.workerId,
            queueName: workerInfo.queueName,
            consumerType: workerInfo.consumerType,
            status: workerInfo.status,
            startTime: workerInfo.startTime,
            messagesProcessed: workerInfo.messagesProcessed,
            lastActivity: workerInfo.lastActivity,
            uptime: Date.now() - workerInfo.startTime.getTime(),
        }));

        return {
            totalWorkersCreated: this.totalWorkersCreated,
            activeConsumerWorkers: this.activeConsumerWorkers,
            workers,
            detailedStats: Object.fromEntries(this.workerStats),
        };
    }

    /**
     * Get health status of all consumer workers
     */
    getHealthStatus() {
        const workers = Array.from(this.consumerWorkers.values());
        const healthyWorkers = workers.filter((w) => w.status === "ready" || w.status === "processing");
        const unhealthyWorkers = workers.filter((w) => w.status === "error" || w.status === "crashed");

        return {
            status: unhealthyWorkers.length === 0 ? "healthy" : "unhealthy",
            totalWorkers: workers.length,
            healthyWorkers: healthyWorkers.length,
            unhealthyWorkers: unhealthyWorkers.length,
            workers: workers.map((w) => ({
                queueName: w.queueName,
                status: w.status,
                uptime: Date.now() - w.startTime.getTime(),
            })),
        };
    }
}

module.exports = ConsumerWorkerManager;
