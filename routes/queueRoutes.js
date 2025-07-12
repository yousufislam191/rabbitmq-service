const express = require("express");
const router = express.Router();
const queueController = require("../controllers/queueController");

// Queue statistics and monitoring
router.get("/stats", queueController.getQueueStats);
router.get("/health", queueController.getQueueHealth);

// Queue management
router.delete("/purge/:queueName", queueController.purgeQueue);
router.delete("/purge-all", queueController.purgeAllQueues);
router.post("/retry-dlq", queueController.retryDeadLetterMessages);

// Consumer management
router.get("/consumers/status", queueController.getConsumerStatus);
router.get("/consumers/health", queueController.getConsumerHealth);
router.post("/consumers/start", queueController.startConsumers);
router.post("/consumers/stop", queueController.stopConsumers);
router.post("/consumers/restart", queueController.restartConsumers);

// Testing
router.post("/test/publish", queueController.publishTestMessage);

// Worker management and statistics
router.get("/workers/stats", queueController.getWorkerStatistics);
router.post("/workers/reset-counter", queueController.resetWorkerCounter);

module.exports = router;
