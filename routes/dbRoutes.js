const express = require("express");
const router = express.Router();
const databaseController = require("../controllers/databaseController");

// Database health endpoint
router.get("/health", databaseController.getHealth);

// Database connection status
router.get("/status", databaseController.getStatus);

// Database connection info
router.get("/info", databaseController.getInfo);

// Ping database
router.get("/ping", databaseController.ping);

module.exports = router;
