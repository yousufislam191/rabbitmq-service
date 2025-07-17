const amqplib = require("amqplib");
const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const { QueueManager } = require("../config/queues");

class RabbitMQService extends EventEmitter {
    constructor(amqpUrl = "amqp://localhost") {
        super();
        this.amqpUrl = amqpUrl;
        this.connection = null;
        this.channel = null;
        this.checkConnection = null; // Separate connection for queue checking
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

            // Create a separate connection for queue checking operations
            await this.createCheckConnection();

            console.log("✅ RabbitMQ connected successfully");
            this.emit("connected");
        } catch (error) {
            console.error("❌ RabbitMQ connection failed:", error.message);
            this.isConnected = false;
            this.emit("error", error);
            throw error;
        }
    }

    async createCheckConnection() {
        try {
            if (this.checkConnection) {
                try {
                    await this.checkConnection.close();
                } catch (e) {
                    // Ignore errors when closing
                }
            }

            this.checkConnection = await amqplib.connect(this.amqpUrl);

            // Add minimal error handling for check connection - don't propagate errors
            this.checkConnection.on("error", (error) => {
                console.warn("⚠️ Check connection error (isolated):", error.message);
                // Don't propagate this error to avoid affecting main connection
            });

            this.checkConnection.on("close", () => {
                console.warn("⚠️ Check connection closed (will recreate if needed)");
                this.checkConnection = null;
            });

            console.log("✅ RabbitMQ check connection created");
        } catch (error) {
            console.warn("⚠️ Failed to create check connection:", error.message);
            this.checkConnection = null;
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

            const { persistent = true, replyTo, headers = {}, expiration, priority } = options;

            // Generate correlationId if not provided or empty
            let { correlationId, messageId } = options;
            if (!correlationId || correlationId.trim() === "") {
                correlationId = uuidv4();
            }

            // Generate messageId if not provided or empty
            if (!messageId || messageId.trim() === "") {
                messageId = uuidv4();
            }

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

            this.emit("messagePublished", { exchange, routingKey, correlationId, messageId });

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
            // Ensure we have a valid check connection
            if (!this.checkConnection || this.checkConnection.closed) {
                await this.createCheckConnection();
            }

            if (!this.checkConnection) {
                throw new Error("Unable to create check connection");
            }

            // Create a temporary channel on the separate check connection
            let tempChannel = null;
            try {
                tempChannel = await this.checkConnection.createChannel();

                const info = await tempChannel.checkQueue(queue);

                // Close the temporary channel properly
                await tempChannel.close();

                return {
                    queue: info.queue,
                    messageCount: info.messageCount,
                    consumerCount: info.consumerCount,
                };
            } catch (checkError) {
                // Close the temp channel if it's still open (suppress any errors)
                if (tempChannel && !tempChannel.closed) {
                    try {
                        await tempChannel.close();
                    } catch (closeError) {
                        // Channel might already be closed, ignore
                    }
                }

                // Check if it's a queue not found error
                if (checkError.message.includes("NOT_FOUND") || checkError.message.includes("no queue")) {
                    throw new Error(`Queue '${queue}' does not exist`);
                }
                throw checkError;
            }
        } catch (error) {
            console.error(`❌ Failed to get queue info for '${queue}':`, error.message);
            throw error;
        }
    }

    async getAllQueues() {
        try {
            // Ensure we have a valid check connection
            if (!this.checkConnection || this.checkConnection.closed) {
                await this.createCheckConnection();
            }

            if (!this.checkConnection) {
                throw new Error("Unable to create check connection");
            }

            // Get all configured queue names from the centralized configuration
            const configuredQueues = QueueManager.getAllQueueNames();
            const existingQueues = [];

            for (const queue of configuredQueues) {
                // Create a temporary channel on the separate check connection
                let tempChannel = null;
                try {
                    tempChannel = await this.checkConnection.createChannel();

                    await tempChannel.checkQueue(queue);

                    // Close the temporary channel properly
                    await tempChannel.close();

                    existingQueues.push(queue);
                } catch (error) {
                    // Close the temp channel if it's still open (suppress any errors)
                    if (tempChannel && !tempChannel.closed) {
                        try {
                            await tempChannel.close();
                        } catch (closeError) {
                            // Channel might already be closed, ignore
                        }
                    }

                    // Only log non-existence errors as warnings, not errors
                    if (error.message.includes("NOT_FOUND") || error.message.includes("no queue")) {
                        console.warn(`Queue ${queue} not found, skipping`);
                    } else {
                        console.error(`Error checking queue ${queue}:`, error.message);
                    }
                }
            }

            return existingQueues;
        } catch (error) {
            console.error("❌ Failed to get all queues:", error.message);
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

    getConnectionDetails() {
        return {
            isConnected: this.isConnected,
            connectionState: this.connection
                ? {
                      closing: this.connection.closing,
                      closed: this.connection.closed,
                      serverProperties: this.connection.serverProperties ? "available" : "none",
                  }
                : "no connection",
            channelState: this.channel
                ? {
                      closed: this.channel.closed,
                      channelNumber: this.channel.ch,
                  }
                : "no channel",
            checkConnectionState: this.checkConnection
                ? {
                      closing: this.checkConnection.closing,
                      closed: this.checkConnection.closed,
                  }
                : "no check connection",
            reconnectAttempts: this.reconnectAttempts,
            consumers: this.consumers.size,
        };
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                return { status: "unhealthy", error: "Not connected" };
            }

            await this.ensureChannel();

            // Test channel by checking a known exchange
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
            console.log("🔌 Closing RabbitMQ connections...");

            // Close main channel and connection
            if (this.channel) {
                await this.channel.close();
            }

            if (this.connection) {
                await this.connection.close();
            }

            // Close check connection
            if (this.checkConnection) {
                try {
                    await this.checkConnection.close();
                } catch (error) {
                    console.warn("⚠️ Error closing check connection:", error.message);
                }
                this.checkConnection = null;
            }

            this.isConnected = false;
            this.consumers.clear();

            console.log("✅ RabbitMQ connections closed gracefully");
            this.emit("closed");
        } catch (error) {
            console.error("❌ Error closing RabbitMQ connections:", error.message);
            throw error;
        }
    }

    async ensureChannel() {
        try {
            // First check if connection is still valid
            if (!this.connection || this.connection.closing || this.connection.closed) {
                console.log("🔄 Connection not available, reconnecting...");
                this.isConnected = false;
                await this.connect();
                return;
            }

            // If connection is valid but we're marked as disconnected, update status
            if (!this.isConnected) {
                this.isConnected = true;
            }

            // Check if we need to recreate the channel
            if (!this.channel || this.channel.closed) {
                console.log("🔄 Channel closed, recreating...");
                this.channel = await this.connection.createChannel();
                this.channel.on("error", this.handleChannelError.bind(this));
                console.log("✅ Channel recreated successfully");
            }
        } catch (error) {
            console.error("❌ Failed to ensure channel:", error.message);
            throw error;
        }
    }
}

module.exports = RabbitMQService;
