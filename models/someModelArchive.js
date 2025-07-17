const mongoose = require("mongoose");

const someModelArchiveSchema = new mongoose.Schema(
    {
        // Original document fields
        name: {
            type: String,
            required: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["pending", "processing", "success", "failed"],
            default: "pending",
            index: true,
        },
        updateFields: {
            priority: { type: Number, default: 1 },
            category: { type: String, default: "normal" },
            department: { type: String, default: "general" },
            lastModified: { type: Date, default: Date.now },
            version: { type: Number, default: 1 },
            notes: { type: String },
            metadata: {
                source: { type: String, default: "migration" },
                batch: { type: String },
                region: { type: String },
            },
        },

        // Archive-specific fields
        originalId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true,
        },
        archivedAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        archiveBatch: {
            type: String,
            required: true,
        },
        archiveReason: {
            type: String,
            default: "bulk_migration",
        },
        sourceCollection: {
            type: String,
            default: "somemodels",
        },
        archivedBy: {
            type: String,
            default: "archive-worker",
        },

        // Original timestamps
        originalCreatedAt: {
            type: Date,
            required: true,
        },
        originalUpdatedAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true, // This will add createdAt and updatedAt for the archive record
        collection: "somemodelarchives", // Explicit collection name
    }
);

// Indexes for efficient querying
someModelArchiveSchema.index({ originalId: 1, archivedAt: -1 });
someModelArchiveSchema.index({ archiveBatch: 1 });
someModelArchiveSchema.index({ status: 1, archivedAt: -1 });
someModelArchiveSchema.index({ "updateFields.department": 1, archivedAt: -1 });

// Static methods for archive operations
someModelArchiveSchema.statics.findByOriginalId = function (originalId) {
    return this.findOne({ originalId });
};

someModelArchiveSchema.statics.findByBatch = function (batchId) {
    return this.find({ archiveBatch: batchId }).sort({ archivedAt: -1 });
};

someModelArchiveSchema.statics.getArchiveStats = function () {
    return this.aggregate([
        {
            $group: {
                _id: "$status",
                count: { $sum: 1 },
                latestArchive: { $max: "$archivedAt" },
            },
        },
    ]);
};

const SomeModelArchive = mongoose.model("SomeModelArchive", someModelArchiveSchema);

module.exports = SomeModelArchive;
