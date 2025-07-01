const mongoose = require("mongoose");

const SomeSchema = new mongoose.Schema(
    {
        name: String,
        status: String,
        updateFields: Object,
    },
    { timestamps: true }
);

module.exports = mongoose.model("SomeModel", SomeSchema);
