const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");
const SomeModel = require("../models/someModel");
const config = require("../config");

async function bulkUpdate(batch, correlationId) {
    try {
        console.log(`🔧 BulkUpdate starting for ${batch.length} items`);
        console.log(`🔧 First item sample:`, JSON.stringify(batch[0], null, 2));

        // Create bulk operations to update document status
        const bulkOps = batch.map((item) => {
            console.log(`🔧 Processing item with _id: ${item._id}, current status: ${item.status}`);

            // Determine the new status based on current status
            let newStatus = "success";
            let additionalFields = {};

            if (item.status === "failed") {
                // For failed items, we're retrying them
                newStatus = "success";
                additionalFields.retryCount = (item.retryCount || 0) + 1;
                additionalFields.lastRetryAt = new Date();
                console.log(`🔄 Retrying failed item: ${item._id} (retry count: ${additionalFields.retryCount})`);
            } else if (item.status === "processing") {
                // For processing items, complete the processing
                newStatus = "success";
                additionalFields.processingDuration = new Date() - (item.processingStartedAt || item.updatedAt);
                console.log(`✅ Completing processing for item: ${item._id}`);
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

        console.log(`🔧 Bulk operations created: ${bulkOps.length}`);
        console.log(`🔧 Sample bulk operation:`, JSON.stringify(bulkOps[0], null, 2));

        const result = await SomeModel.bulkWrite(bulkOps);

        console.log(`🔧 Bulk write result:`, JSON.stringify(result, null, 2));
        console.log(`✅ Worker processed ${batch.length} items (${correlationId || "unknown"})`);

        parentPort.postMessage({
            success: true,
            processed: batch.length,
            modifiedCount: result.modifiedCount,
            matchedCount: result.matchedCount,
        });
    } catch (err) {
        console.error(`❌ Worker processing error:`, err.message);
        console.error(`❌ Error stack:`, err.stack);
        parentPort.postMessage({ success: false, error: err.message });
    }
}

async function start() {
    try {
        await mongoose.connect(config.MONGODB_URI);
        console.log(`🔧 Worker started with data:`, JSON.stringify(workerData, null, 2));

        const { batch, correlationId } = workerData;

        if (!batch || !Array.isArray(batch)) {
            throw new Error(`Invalid batch data received: ${typeof batch}`);
        }

        if (batch.length === 0) {
            throw new Error("Empty batch received");
        }

        console.log(`🔧 Processing ${batch.length} documents with correlationId: ${correlationId}`);

        await bulkUpdate(batch, correlationId);

        mongoose.connection.close();
    } catch (error) {
        console.error(`❌ Worker start error:`, error.message);
        parentPort.postMessage({ success: false, error: error.message });
        mongoose.connection.close();
    }
}

start();
