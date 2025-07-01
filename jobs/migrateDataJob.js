const mongoose = require("mongoose");
const SomeModel = require("../models/someModel");
const RabbitMQService = require("../services/rabbitmqService");
const config = require("../config");

async function migrateDataJob() {
    await mongoose.connect(config.MONGODB_URI);
    const broker = new RabbitMQService(config.RABBITMQ_URL);
    await broker.connect();

    // Setup queue & exchange if not done already
    await broker.assertTopicExchange("app.topic.exchange");
    await broker.assertQueue("app.processing.queue", {
        durable: true,
        deadLetterExchange: "app.deadletter.exchange",
    });
    await broker.bindQueue("app.processing.queue", "app.topic.exchange", "process.*");

    const cursor = SomeModel.find({ status: "pending" }).cursor();

    let batch = [];
    for await (const doc of cursor) {
        batch.push(doc);
        if (batch.length >= config.BATCH_SIZE) {
            await broker.publish("app.topic.exchange", "process.bulkUpdate", batch, { persistent: true });
            batch = [];
        }
    }

    if (batch.length > 0) {
        await broker.publish("app.topic.exchange", "process.bulkUpdate", batch, { persistent: true });
    }

    await broker.close();
    await mongoose.disconnect();
}

module.exports = migrateDataJob;
