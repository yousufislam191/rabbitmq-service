const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");
const SomeModel = require("../models/someModel");
const config = require("../config");

async function bulkUpdate(batch, correlationId, workerId, workerNumber) {
    try {
        // Create bulk operations to update document status
        const bulkOps = batch.map((item) => {
            // Determine the new status based on current status
            let newStatus = "success";
            let additionalFields = {};

            if (item.status === "failed") {
                // For failed items, we're retrying them
                newStatus = "success";
                additionalFields.retryCount = (item.retryCount || 0) + 1;
                additionalFields.lastRetryAt = new Date();
            } else if (item.status === "processing") {
                // For processing items, complete the processing
                newStatus = "success";
                additionalFields.processingDuration = new Date() - (item.processingStartedAt || item.updatedAt);
            }

            return {
                updateOne: {
                    filter: { _id: item._id },
                    update: {
                        $set: {
                            status: newStatus,
                            lastProcessed: new Date(),
                            processedBy: correlationId || `worker-${Date.now()}`,
                            processingCompleted: true,
                            ...additionalFields,
                        },
                    },
                    upsert: false,
                },
            };
        });

        const result = await SomeModel.bulkWrite(bulkOps);

        console.log(`✅ ${workerId} (#${workerNumber}) processed ${batch.length} items`);

        parentPort.postMessage({
            success: true,
            processed: batch.length,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            workerId: workerId,
            workerNumber: workerNumber,
        });
    } catch (err) {
        console.error(`❌ ${workerId} (#${workerNumber}) error:`, err.message);
        parentPort.postMessage({
            success: false,
            error: err.message,
            workerId: workerId,
            workerNumber: workerNumber,
        });
    }
}

async function start() {
    const { batch, correlationId, workerId, workerNumber } = workerData;

    try {
        console.log(`🚀 ${workerId} (#${workerNumber}) started`);

        await mongoose.connect(config.MONGODB_URI);

        if (!batch || !Array.isArray(batch)) {
            throw new Error(`Invalid batch data received: ${typeof batch}`);
        }

        if (batch.length === 0) {
            throw new Error("Empty batch received");
        }

        await bulkUpdate(batch, correlationId, workerId, workerNumber);

        mongoose.connection.close();
    } catch (error) {
        console.error(`❌ ${workerId} (#${workerNumber}) error:`, error.message);
        parentPort.postMessage({ success: false, error: error.message, workerId, workerNumber });
        mongoose.connection.close();
    }
}

start();
