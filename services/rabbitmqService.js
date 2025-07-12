const amqplib = require("amqplib");
const { EventEmitter } = require("events");

class RabbitMQService extends EventEmitter {
    constructor(amqpUrl = "amqp://localhost") {
        super();
        this.amqpUrl = amqpUrl;
        this.connection = null;
        this.channel = null;
        this.isConnected = false;
        this.consumers = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 5000;
    }

    async connect() {
        try {
            this.connection = await amqplib.connect(this.amqpUrl);
            this.channel = await this.connection.createChannel();
            this.isConnected = true;
            this.reconnectAttempts = 0;

            this.connection.on("error", this.handleConnectionError.bind(this));
            this.connection.on("close", this.handleConnectionClose.bind(this));
            this.channel.on("error", this.handleChannelError.bind(this));

            console.log("✅ RabbitMQ connected successfully");
            this.emit("connected");
        } catch (error) {
            console.error("❌ RabbitMQ connection failed:", error.message);
            this.isConnected = false;
            this.emit("error", error);
            throw error;
        }
    }

    async handleConnectionError(error) {
        console.error("🔌 RabbitMQ connection error:", error.message);
        this.isConnected = false;
        this.emit("connectionError", error);
        await this.reconnect();
    }

    async handleConnectionClose() {
        console.warn("⚠️ RabbitMQ connection closed");
        this.isConnected = false;
        this.emit("disconnected");
        await this.reconnect();
    }

    async handleChannelError(error) {
        console.error("📺 RabbitMQ channel error:", error.message);
        this.emit("channelError", error);
    }

    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("❌ Max reconnection attempts reached");
            this.emit("maxReconnectAttemptsReached");
            return;
        }

        this.reconnectAttempts++;
        console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);

        setTimeout(async () => {
            try {
                await this.connect();
                await this.restoreConsumers();
            } catch (error) {
                console.error("❌ Reconnection failed:", error.message);
                await this.reconnect();
            }
        }, this.reconnectInterval);
    }

    async restoreConsumers() {
        console.log("🔄 Restoring consumers...");
        for (const [queue, consumerInfo] of this.consumers) {
            try {
                await this.consume(queue, consumerInfo.onMessage, consumerInfo.options);
                console.log(`✅ Restored consumer for queue: ${queue}`);
            } catch (error) {
                console.error(`❌ Failed to restore consumer for queue ${queue}:`, error.message);
            }
        }
    }

    async assertTopicExchange(exchange, options = { durable: true }) {
        try {
            await this.channel.assertExchange(exchange, "topic", options);
        } catch (error) {
            console.error(`❌ Failed to assert topic exchange '${exchange}':`, error.message);
            throw error;
        }
    }

    async assertDirectExchange(exchange, options = { durable: true }) {
        try {
            await this.channel.assertExchange(exchange, "direct", options);
        } catch (error) {
            console.error(`❌ Failed to assert direct exchange '${exchange}':`, error.message);
            throw error;
        }
    }

    async assertQueue(queue, options = { durable: true }) {
        try {
            const result = await this.channel.assertQueue(queue, options);
            return result;
        } catch (error) {
            console.error(`❌ Failed to assert queue '${queue}':`, error.message);
            throw error;
        }
    }

    async bindQueue(queue, exchange, pattern) {
        try {
            await this.channel.bindQueue(queue, exchange, pattern);
        } catch (error) {
            console.error(`❌ Failed to bind queue '${queue}' to exchange '${exchange}':`, error.message);
            throw error;
        }
    }

    async publish(exchange, routingKey, message, options = {}) {
        try {
            if (!this.isConnected) {
                throw new Error("RabbitMQ not connected");
            }

            const { persistent = true, correlationId, replyTo, headers = {}, expiration, priority, messageId } = options;

            const buffer = Buffer.from(JSON.stringify(message));

            const publishOptions = {
                persistent,
                correlationId,
                replyTo,
                headers: {
                    ...headers,
                    "x-published-at": new Date().toISOString(),
                },
                expiration,
                priority,
                messageId,
            };

            const result = this.channel.publish(exchange, routingKey, buffer, publishOptions);

            if (!result) {
                console.warn("⚠️ Message may not have been published (channel buffer full)");
            }

            this.emit("messagePublished", { exchange, routingKey, correlationId });

            return result;
        } catch (error) {
            console.error(`❌ Failed to publish message:`, error.message);
            this.emit("publishError", error);
            throw error;
        }
    }

    async consume(queue, onMessage, options = {}) {
        try {
            const { prefetch = 1, noAck = false, retry = false, maxRetries = 3, retryDelayMs = 5000, deadLetterExchange, consumerTag } = options;

            await this.channel.prefetch(prefetch);

            // Store consumer info for reconnection
            this.consumers.set(queue, { onMessage, options });

            const consumerInfo = await this.channel.consume(
                queue,
                async (msg) => {
                    if (!msg) return;

                    const startTime = Date.now();
                    const correlationId = msg.properties.correlationId;

                    try {
                        console.log(`📥 Processing message from queue '${queue}' (correlationId: ${correlationId})`);

                        const content = JSON.parse(msg.content.toString());
                        await onMessage(content, msg);

                        this.channel.ack(msg);

                        const processingTime = Date.now() - startTime;
                        console.log(`✅ Message processed successfully in ${processingTime}ms (correlationId: ${correlationId})`);

                        this.emit("messageProcessed", { queue, correlationId, processingTime });
                    } catch (error) {
                        console.error(`❌ Message processing error (correlationId: ${correlationId}):`, error.message);

                        this.emit("messageError", { queue, correlationId, error });

                        if (retry) {
                            await this.handleRetry(msg, queue, error, maxRetries, retryDelayMs, deadLetterExchange);
                        } else {
                            this.channel.nack(msg, false, false);
                        }
                    }
                },
                {
                    noAck,
                    consumerTag,
                }
            );

            this.emit("consumerStarted", { queue, consumerTag: consumerInfo.consumerTag });

            return consumerInfo;
        } catch (error) {
            console.error(`❌ Failed to start consumer for queue '${queue}':`, error.message);
            this.emit("consumerError", { queue, error });
            throw error;
        }
    }

    async handleRetry(msg, queue, error, maxRetries, retryDelayMs, deadLetterExchange) {
        const headers = msg.properties.headers || {};
        const retries = headers["x-retries"] || 0;
        const correlationId = msg.properties.correlationId;

        if (retries < maxRetries) {
            const retryHeaders = {
                ...headers,
                "x-retries": retries + 1,
                "x-original-queue": queue,
                "x-retry-reason": error.message,
                "x-retry-timestamp": new Date().toISOString(),
            };

            console.log(`🔄 Retrying message (attempt ${retries + 1}/${maxRetries}) - correlationId: ${correlationId}`);

            this.channel.publish(
                "", // default exchange
                queue,
                msg.content,
                {
                    persistent: true,
                    headers: retryHeaders,
                    expiration: String(retryDelayMs),
                    correlationId,
                }
            );

            this.emit("messageRetried", { queue, correlationId, attempt: retries + 1, maxRetries });
        } else {
            console.error(`💀 Max retries exceeded for message - correlationId: ${correlationId}`);

            if (deadLetterExchange) {
                await this.sendToDeadLetter(msg, deadLetterExchange, error);
            }

            this.emit("messageFailedPermanently", { queue, correlationId, error });
        }

        this.channel.ack(msg);
    }

    async sendToDeadLetter(msg, deadLetterExchange, error) {
        const correlationId = msg.properties.correlationId;

        try {
            const deadLetterHeaders = {
                ...msg.properties.headers,
                "x-death-reason": error.message,
                "x-death-timestamp": new Date().toISOString(),
                "x-original-routing-key": msg.fields.routingKey,
            };

            this.channel.publish(deadLetterExchange, "failed.manual", msg.content, {
                persistent: true,
                correlationId,
                headers: deadLetterHeaders,
            });

            console.log(`💀 Message sent to dead letter exchange - correlationId: ${correlationId}`);
            this.emit("messageSentToDeadLetter", { correlationId, deadLetterExchange });
        } catch (deadLetterError) {
            console.error(`❌ Failed to send message to dead letter exchange:`, deadLetterError.message);
            this.emit("deadLetterError", { correlationId, error: deadLetterError });
        }
    }

    async deleteQueue(queue, options = {}) {
        try {
            const result = await this.channel.deleteQueue(queue, options);
            console.log(`🗑️ Queue '${queue}' deleted`);
            this.consumers.delete(queue);
            return result;
        } catch (error) {
            console.error(`❌ Failed to delete queue '${queue}':`, error.message);
            throw error;
        }
    }

    async purgeQueue(queue) {
        try {
            const result = await this.channel.purgeQueue(queue);
            console.log(`🧹 Queue '${queue}' purged (${result.messageCount} messages removed)`);
            this.emit("queuePurged", { queue, messageCount: result.messageCount });
            return result;
        } catch (error) {
            console.error(`❌ Failed to purge queue '${queue}':`, error.message);
            throw error;
        }
    }

    async getQueueInfo(queue) {
        try {
            const info = await this.channel.checkQueue(queue);
            return {
                queue: info.queue,
                messageCount: info.messageCount,
                consumerCount: info.consumerCount,
            };
        } catch (error) {
            console.error(`❌ Failed to get queue info for '${queue}':`, error.message);
            throw error;
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            amqpUrl: this.amqpUrl.replace(/\/\/.*@/, "//***:***@"), // Hide credentials
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.maxReconnectAttempts,
            consumers: Array.from(this.consumers.keys()),
            consumerCount: this.consumers.size,
        };
    }

    async healthCheck() {
        try {
            if (!this.isConnected || !this.channel) {
                return { status: "unhealthy", error: "Not connected" };
            }

            // Test channel by checking a known queue or exchange
            await this.channel.checkExchange("amq.direct");

            return {
                status: "healthy",
                timestamp: new Date(),
                connection: this.getConnectionStatus(),
            };
        } catch (error) {
            return {
                status: "unhealthy",
                error: error.message,
                timestamp: new Date(),
            };
        }
    }

    async close() {
        try {
            console.log("🔌 Closing RabbitMQ connection...");

            if (this.channel) {
                await this.channel.close();
            }

            if (this.connection) {
                await this.connection.close();
            }

            this.isConnected = false;
            this.consumers.clear();

            console.log("✅ RabbitMQ connection closed gracefully");
            this.emit("closed");
        } catch (error) {
            console.error("❌ Error closing RabbitMQ connection:", error.message);
            throw error;
        }
    }
}

module.exports = RabbitMQService;
