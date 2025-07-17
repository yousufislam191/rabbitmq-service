/**
 * Custom Error Classes for better error handling and categorization
 */

class BaseError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.timestamp = new Date().toISOString();

        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            statusCode: this.statusCode,
            timestamp: this.timestamp,
            isOperational: this.isOperational,
        };
    }
}

class ValidationError extends BaseError {
    constructor(message, field = null) {
        super(message, 400);
        this.field = field;
    }
}

class RabbitMQError extends BaseError {
    constructor(message, operation = null, queueName = null) {
        super(message, 503);
        this.operation = operation;
        this.queueName = queueName;
        this.service = "RabbitMQ";
    }
}

class QueueNotFoundError extends RabbitMQError {
    constructor(queueName) {
        super(`Queue '${queueName}' does not exist. Please check the queue name and try again.`, "queue_check", queueName);
        this.statusCode = 404;
        this.exists = false;
    }
}

class QueueConfigurationError extends RabbitMQError {
    constructor(queueName, details = "") {
        super(`Queue '${queueName}' exists but has different configuration. ${details}`, "queue_configuration", queueName);
        this.statusCode = 409;
        this.exists = true;
    }
}

class ConnectionError extends RabbitMQError {
    constructor(message, reconnectAttempts = 0) {
        super(message, "connection");
        this.reconnectAttempts = reconnectAttempts;
    }
}

class DatabaseError extends BaseError {
    constructor(message, operation = null) {
        super(message, 503);
        this.operation = operation;
        this.service = "Database";
    }
}

class ServiceNotInitializedError extends BaseError {
    constructor(serviceName) {
        super(`Service '${serviceName}' is not initialized`, 503);
        this.serviceName = serviceName;
    }
}

module.exports = {
    BaseError,
    ValidationError,
    RabbitMQError,
    QueueNotFoundError,
    QueueConfigurationError,
    ConnectionError,
    DatabaseError,
    ServiceNotInitializedError,
};
