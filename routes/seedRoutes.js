const express = require("express");
const router = express.Router();
const seedController = require("../controllers/seedController");

// Documentation
router.get("/docs", seedController.getDocs);

// Collection statistics
router.get("/stats", seedController.getStats);

// Seed individual collections
router.post("/some-model", seedController.seedSomeModel);
router.post("/job-status", seedController.seedJobStatus);

// Seed all collections
router.post("/all", seedController.seedAll);

// Clear data (with confirmation)
router.delete("/clear", seedController.clearData);

module.exports = router;
