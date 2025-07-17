const { BaseError, ValidationError, RabbitMQError, QueueNotFoundError, QueueConfigurationError, ConnectionError, DatabaseError, ServiceNotInitializedError } = require("./errors");

/**
 * Global Error Handler for the application
 */
class ErrorHandler {
    static handleError(error, context = {}) {
        const errorInfo = {
            ...context,
            timestamp: new Date().toISOString(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
        };

        // Log error based on severity
        if (error.isOperational === false || error.statusCode >= 500) {
            console.error("🚨 CRITICAL ERROR:", JSON.stringify(errorInfo, null, 2));
        } else if (error.statusCode >= 400) {
            console.warn("⚠️ CLIENT ERROR:", JSON.stringify(errorInfo, null, 2));
        } else {
            console.log("ℹ️ INFO:", JSON.stringify(errorInfo, null, 2));
        }

        return error;
    }

    static parseRabbitMQError(error, queueName = null, operation = null) {
        const message = error.message || error.toString();

        // Queue not found errors
        if (message.includes("NOT_FOUND") || message.includes("no queue") || message.includes("does not exist")) {
            return new QueueNotFoundError(queueName || "unknown");
        }

        // Queue configuration mismatch errors
        if (message.includes("PRECONDITION_FAILED")) {
            const details = message.includes("inequivalent arg") ? "Unable to retrieve stats due to declaration mismatch." : "";
            return new QueueConfigurationError(queueName || "unknown", details);
        }

        // Connection/Channel errors
        if (message.includes("Channel closed") || message.includes("Connection closed") || message.includes("Channel closing")) {
            return new ConnectionError("RabbitMQ connection issue. The service is attempting to reconnect. Please try again in a moment.");
        }

        // Generic RabbitMQ error
        return new RabbitMQError(message, operation, queueName);
    }

    static createResponse(error, additionalData = {}) {
        const isOperationalError = error instanceof BaseError && error.isOperational;
        const statusCode = error.statusCode || 500;

        const response = {
            success: false,
            timestamp: new Date().toISOString(),
            error: {
                message: isOperationalError ? error.message : "An internal server error occurred",
                type: error.name || "Error",
                ...(error.queueName && { queue: error.queueName }),
                ...(error.operation && { operation: error.operation }),
                ...(error.service && { service: error.service }),
                ...(error.exists !== undefined && { exists: error.exists }),
            },
            ...additionalData,
        };

        // Include stack trace only in development
        if (process.env.NODE_ENV === "development" && error.stack) {
            response.error.stack = error.stack;
        }

        return { response, statusCode };
    }

    static async handleAsyncError(fn, context = {}) {
        try {
            return await fn();
        } catch (error) {
            const handledError = ErrorHandler.handleError(error, context);
            throw handledError;
        }
    }

    static wrapAsync(fn) {
        return (req, res, next) => {
            Promise.resolve(fn(req, res, next)).catch(next);
        };
    }

    static expressErrorHandler(error, req, res, next) {
        const handledError = ErrorHandler.handleError(error, {
            url: req.url,
            method: req.method,
            userAgent: req.get("User-Agent"),
            ip: req.ip,
        });

        const { response, statusCode } = ErrorHandler.createResponse(handledError);
        res.status(statusCode).json(response);
    }

    static unhandledRejectionHandler(reason, promise) {
        console.error("💥 Unhandled Rejection at:", promise, "reason:", reason);

        const error = reason instanceof Error ? reason : new Error(reason);
        ErrorHandler.handleError(error, { type: "unhandledRejection" });

        // Don't exit the process immediately, log and continue
        console.log("🔧 The application will continue running, but this should be investigated.");
    }

    static uncaughtExceptionHandler(error) {
        console.error("💥 Uncaught Exception:", error);
        ErrorHandler.handleError(error, { type: "uncaughtException" });

        // Graceful shutdown for uncaught exceptions
        console.log("🔧 The application will exit due to uncaught exception.");
        process.exit(1);
    }
}

module.exports = ErrorHandler;
