const RabbitMQService = require("../services/rabbitmqService");
const { Worker } = require("worker_threads");
const config = require("../config");

async function processInWorker(batch) {
    return new Promise((resolve, reject) => {
        const worker = new Worker("./workers/bulkUpdateWorker.js", { workerData: batch });

        worker.on("message", (result) => {
            if (result.success) {
                console.log(`Processed ${result.processed} items`);
                resolve();
            } else {
                console.error("Worker error:", result.error);
                reject(new Error(result.error));
            }
        });

        worker.on("error", reject);
        worker.on("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
        });
    });
}

async function startConsumers() {
    const rabbit = new RabbitMQService(config.RABBITMQ_URL);
    await rabbit.connect();

    await rabbit.assertTopicExchange("app.topic.exchange");
    await rabbit.assertQueue("app.processing.queue", {
        durable: true,
        deadLetterExchange: "app.deadletter.exchange",
    });
    await rabbit.bindQueue("app.processing.queue", "app.topic.exchange", "process.*");

    await rabbit.assertTopicExchange("app.deadletter.exchange");
    await rabbit.assertQueue("app.deadletter.queue", { durable: true });
    await rabbit.bindQueue("app.deadletter.queue", "app.deadletter.exchange", "#");

    // Add consumers dynamically per queue
    rabbit.consume("app.processing.queue", async (batch) => await processInWorker(batch), {
        retry: true,
        maxRetries: 5,
        retryDelayMs: 10000,
        deadLetterExchange: "app.deadletter.exchange",
    });
}

module.exports = startConsumers;
