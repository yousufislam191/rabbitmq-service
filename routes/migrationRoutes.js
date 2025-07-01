const express = require("express");
const router = express.Router();
const migrateDataJob = require("../jobs/migrateDataJob");

router.post("/", async (req, res) => {
    try {
        await migrateDataJob();
        res.status(200).send("Migration job triggered");
    } catch (err) {
        res.status(500).send("Migration failed: " + err.message);
    }
});

module.exports = router;
