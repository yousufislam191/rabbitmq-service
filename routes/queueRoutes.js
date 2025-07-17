const express = require("express");
const router = express.Router();
const queueController = require("../controllers/queueController");

// Queue statistics and monitoring
router.get("/stats", queueController.getQueueStats);
router.get("/health", queueController.getQueueHealth);

// Queue management
router.delete("/purge/:queueName", queueController.purgeQueue);
router.delete("/purge-all", queueController.purgeAllQueues);
router.delete("/cleanup-all", queueController.cleanupQueues);
router.post("/retry-dlq", queueController.retryDeadLetterMessages);

// Testing
router.post("/test/publish", queueController.publishTestMessage);

// Connection debugging
router.get("/connection/details", queueController.getConnectionDetails);

module.exports = router;
