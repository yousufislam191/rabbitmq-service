const express = require("express");
const router = express.Router();
const consumerController = require("../controllers/consumerController");

// General consumer management
router.get("/status", consumerController.getConsumerStatus);
router.get("/health", consumerController.getConsumerHealth);
router.post("/start", consumerController.startConsumers);
router.post("/stop", consumerController.stopConsumers);
router.post("/restart", consumerController.restartConsumers);

// Specific consumer management
router.get("/available", consumerController.getAvailableQueues);
router.get("/:queueName/status", consumerController.getSpecificConsumerStatus);
router.post("/:queueName/start", consumerController.startSpecificConsumer);
router.post("/:queueName/stop", consumerController.stopSpecificConsumer);
router.post("/:queueName/restart", consumerController.restartSpecificConsumer);

// Worker management and statistics
router.get("/workers/stats", consumerController.getWorkerStatistics);
router.post("/workers/reset-counter", consumerController.resetWorkerCounter);

// Worker Thread Management Routes
router.get("/workers/detailed-stats", consumerController.getDetailedWorkerStats);
router.get("/workers/health", consumerController.getConsumerWorkerHealth);

module.exports = router;
