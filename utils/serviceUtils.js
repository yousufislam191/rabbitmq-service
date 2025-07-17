const ErrorHandler = require("./errorHandler");
const { ServiceNotInitializedError } = require("./errors");

/**
 * Service Response utilities for consistent API responses
 */
class ResponseUtils {
    static success(data = {}, message = null) {
        return {
            success: true,
            timestamp: new Date().toISOString(),
            ...(message && { message }),
            ...data,
        };
    }

    static successWithStats(stats, queueName = null) {
        if (queueName) {
            return ResponseUtils.success({
                queue: queueName,
                ...stats,
            });
        }
        return ResponseUtils.success(stats);
    }

    static error(error, additionalData = {}) {
        return ErrorHandler.createResponse(error, additionalData);
    }

    static handleServiceOperation(serviceName, operationName) {
        return {
            async execute(operation) {
                try {
                    return await ErrorHandler.handleAsyncError(operation, {
                        service: serviceName,
                        operation: operationName,
                    });
                } catch (error) {
                    throw error;
                }
            },
        };
    }
}

/**
 * Service initialization guard
 */
function requireInitialized(serviceName) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args) {
            if (!this.isInitialized) {
                throw new ServiceNotInitializedError(serviceName);
            }
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}

/**
 * Method error handler decorator
 */
function handleErrors(context = {}) {
    return function (target, propertyKey, descriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = async function (...args) {
            try {
                return await originalMethod.apply(this, args);
            } catch (error) {
                const enrichedError = ErrorHandler.handleError(error, {
                    ...context,
                    method: propertyKey,
                    className: target.constructor.name,
                });
                throw enrichedError;
            }
        };

        return descriptor;
    };
}

module.exports = {
    ResponseUtils,
    requireInitialized,
    handleErrors,
    ErrorHandler,
};
