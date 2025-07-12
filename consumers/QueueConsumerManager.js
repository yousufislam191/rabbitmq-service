const consumerService = require("../services/consumerService");

// Legacy function for backward compatibility
async function processInWorker(batch) {
    const correlationId = `legacy-${Date.now()}`;
    return consumerService.processInWorker(batch, correlationId);
}

// Main function to start consumers - now uses the new service
async function startConsumers() {
    try {
        await consumerService.startAllConsumers();

        // Return consumer service for potential direct usage
        return consumerService;
    } catch (error) {
        console.error("❌ Failed to start consumers:", error.message);
        throw error;
    }
}

// Export both for backward compatibility and new usage
module.exports = startConsumers;
module.exports.consumerService = consumerService;
module.exports.processInWorker = processInWorker;
