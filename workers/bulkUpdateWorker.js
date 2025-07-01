const { parentPort, workerData } = require("worker_threads");
const mongoose = require("mongoose");
const SomeModel = require("../models/someModel");
const config = require("../config");

async function bulkUpdate(data) {
    const bulkOps = data.map((item) => ({
        updateOne: {
            filter: { _id: item._id },
            update: { $set: item.updateFields },
            upsert: false,
        },
    }));

    try {
        await SomeModel.bulkWrite(bulkOps);
        parentPort.postMessage({ success: true, processed: data.length });
    } catch (err) {
        parentPort.postMessage({ success: false, error: err.message });
    }
}

async function start() {
    await mongoose.connect(config.MONGODB_URI);
    await bulkUpdate(workerData);
    mongoose.connection.close();
}

start();
