const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");
const RabbitMQService = require("../services/rabbitmqService");
const SomeModel = require("../models/someModel");
const JobCounter = require("../models/jobCounter");
const JobStatus = require("../models/jobStatus");
const config = require("../config");
const db = require("../config/db");

/**
 * Check MongoDB connection status
 */
async function ensureConnection() {
    if (!db.isConnected || mongoose.connection.readyState !== 1) {
        console.log("MongoDB not connected, attempting to reconnect...");
        await db.connect();
    }
}

async function migrateDataJob() {
    try {
        // Ensure MongoDB connection is active
        await ensureConnection();

        const broker = new RabbitMQService(config.RABBITMQ_URL);
        await broker.connect();

        await broker.assertTopicExchange("app.topic.exchange");
        await broker.assertQueue("app.processing.queue", {
            durable: true,
            deadLetterExchange: "app.deadletter.exchange",
            deadLetterRoutingKey: "failed.processing",
        });
        await broker.bindQueue("app.processing.queue", "app.topic.exchange", "process.*");

        const cursor = SomeModel.find({ status: "pending" }).cursor();
        let batch = [];

        for await (const doc of cursor) {
            batch.push(doc);
            if (batch.length >= config.BATCH_SIZE) {
                const correlationId = await getNextBatchId();

                // Create a job status entry before publishing
                await JobStatus.create({
                    correlationId,
                    status: "pending",
                    totalItems: batch.length,
                    jobType: "batch",
                    startTime: new Date(),
                    progress: 0,
                    message: "Job queued for processing",
                });

                await broker.publish("app.topic.exchange", "process.bulkUpdate", batch, {
                    persistent: true,
                    correlationId,
                    headers: { batchSize: batch.length, source: "scheduler" },
                });
                batch = [];
            }
        }

        if (batch.length > 0) {
            const correlationId = await getNextBatchId();

            // Create a job status entry before publishing
            await JobStatus.create({
                correlationId,
                status: "pending",
                totalItems: batch.length,
                jobType: "batch",
                startTime: new Date(),
                progress: 0,
                message: "Job queued for processing",
            });

            await broker.publish("app.topic.exchange", "process.bulkUpdate", batch, {
                persistent: true,
                correlationId,
                headers: { batchSize: batch.length, source: "scheduler" },
            });
        }

        await broker.close();
    } catch (error) {
        console.error("❌ Migration job failed:", error.message);
        throw error;
    }
}

async function getNextBatchId() {
    const counter = await JobCounter.findOneAndUpdate({ name: "batch" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return `batch-${String(counter.seq).padStart(3, "0")}`;
}

module.exports = migrateDataJob;
