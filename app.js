const express = require("express");
const migrationRoutes = require("./routes/migrationRoutes");
const startConsumers = require("./consumers/QueueConsumerManager");
const startScheduler = require("./schedulers/migrationScheduler");

const app = express();
app.use(express.json());

// Routes
app.use("/migrate", migrationRoutes);

// Consumers
startConsumers();

// Schedulers
startScheduler();

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
