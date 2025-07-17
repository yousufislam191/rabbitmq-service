const express = require("express");
const router = express.Router();
const seedController = require("../controllers/seedController");

// Enhanced endpoints
router.delete("/clear-all", seedController.clearAllData);
router.post("/insert-batch", seedController.insertBatchData);
router.post("/fetch-and-publish", seedController.fetchAndPublishBatches);
router.post("/test-archive-flow", seedController.testArchiveFlow);

module.exports = router;
