const mongoose = require("mongoose");

const SomeSchema = new mongoose.Schema(
    {
        name: String,
        email: String,
        status: { type: String, enum: ["pending", "processing", "success", "failed"], default: "pending" },
        updateFields: Object,
    },
    { timestamps: true }
);

module.exports = mongoose.model("SomeModel", SomeSchema);
