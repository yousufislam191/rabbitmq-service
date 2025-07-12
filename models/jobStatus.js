const mongoose = require("mongoose");

const JobStatusSchema = new mongoose.Schema(
    {
        jobId: { type: String, required: true }, // Add jobId as required by database schema
        correlationId: { type: String, required: true, unique: true },
        status: { type: String, enum: ["pending", "processing", "completed", "failed", "cancelled"], default: "pending" },
        totalItems: { type: Number, default: 0 },
        processedItems: { type: Number, default: 0 },
        progress: { type: Number, default: 0, min: 0, max: 100 },
        startTime: { type: Date, default: Date.now },
        endTime: Date,

        // Job metadata
        jobType: { type: String, enum: ["migration", "batch"], default: "batch" },
        parentJobId: String, // For batch jobs, this points to the migration job
        message: String,
        error: String,

        // Migration specific fields
        metadata: mongoose.Schema.Types.Mixed,
        completedBatches: { type: Number, default: 0 },
        failedBatches: { type: Number, default: 0 },
        totalBatches: { type: Number, default: 0 },
    },
    {
        timestamps: true, // This will automatically handle createdAt and updatedAt
    }
);

// Pre-save middleware to update the updatedAt field
JobStatusSchema.pre("save", function (next) {
    this.updatedAt = new Date();
    next();
});

JobStatusSchema.pre("findOneAndUpdate", function (next) {
    this.set({ updatedAt: new Date() });
    next();
});

module.exports = mongoose.model("JobStatus", JobStatusSchema);
