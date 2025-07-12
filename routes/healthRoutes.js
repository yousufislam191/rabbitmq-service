const express = require("express");
const router = express.Router();
const healthController = require("../controllers/healthController");

// General application health check
router.get("/", healthController.getHealth);

// Liveness probe (simple check)
router.get("/live", healthController.getLiveness);

// Readiness probe (checks dependencies)
router.get("/ready", healthController.getReadiness);

module.exports = router;
