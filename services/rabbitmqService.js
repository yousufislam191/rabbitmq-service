const amqplib = require("amqplib");

class RabbitMQService {
    constructor(amqpUrl = "amqp://localhost") {
        this.amqpUrl = amqpUrl;
        this.connection = null;
        this.channel = null;
    }

    async connect() {
        this.connection = await amqplib.connect(this.amqpUrl);
        this.channel = await this.connection.createChannel();
    }

    async assertTopicExchange(exchange, options = { durable: true }) {
        await this.channel.assertExchange(exchange, "topic", options);
    }

    async assertQueue(queue, options = { durable: true }) {
        await this.channel.assertQueue(queue, options);
    }

    async bindQueue(queue, exchange, pattern) {
        await this.channel.bindQueue(queue, exchange, pattern);
    }

    async publish(exchange, routingKey, message, options = { persistent: true }) {
        const buffer = Buffer.from(JSON.stringify(message));
        this.channel.publish(exchange, routingKey, buffer, {
            persistent: options.persistent,
            correlationId: options.correlationId,
            replyTo: options.replyTo,
            headers: options.headers,
            expiration: options.expiration,
        });
    }

    async consume(queue, onMessage, options = {}) {
        const { prefetch = 1, noAck = false, retry = false, maxRetries = 3, retryDelayMs = 5000, deadLetterExchange } = options;

        await this.channel.prefetch(prefetch);

        await this.channel.consume(
            queue,
            async (msg) => {
                if (!msg) return;
                try {
                    const content = JSON.parse(msg.content.toString());
                    await onMessage(content, msg);
                    this.channel.ack(msg);
                } catch (error) {
                    console.error("Processing error:", error);

                    if (retry) {
                        const headers = msg.properties.headers || {};
                        const retries = headers["x-retries"] || 0;

                        if (retries < maxRetries) {
                            const retryHeaders = Object.assign({}, headers, { "x-retries": retries + 1 });

                            this.channel.publish(
                                "", // default exchange
                                queue,
                                msg.content,
                                {
                                    persistent: true,
                                    headers: retryHeaders,
                                    expiration: String(retryDelayMs),
                                    correlationId: msg.properties.correlationId,
                                }
                            );
                        } else {
                            if (deadLetterExchange) {
                                this.channel.publish(deadLetterExchange, "", msg.content, {
                                    persistent: true,
                                    correlationId: msg.properties.correlationId,
                                });
                            }
                            this.channel.ack(msg);
                        }
                    } else {
                        this.channel.nack(msg, false, false);
                    }
                }
            },
            { noAck }
        );
    }

    async close() {
        await this.channel.close();
        await this.connection.close();
    }
}

module.exports = RabbitMQService;
