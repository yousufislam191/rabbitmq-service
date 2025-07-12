const mongoose = require("mongoose");
const config = require("./index");

class Database {
    constructor() {
        this.isConnected = false;
    }

    async connect() {
        try {
            if (this.isConnected) {
                return;
            }

            // MongoDB connection options
            const options = {
                maxPoolSize: 10, // Maintain up to 10 socket connections
                serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                bufferCommands: false, // Disable mongoose buffering
            };

            await mongoose.connect(config.MONGODB_URI, options);
            this.isConnected = true;

            console.log("✅ MongoDB connected successfully");

            // Handle connection events
            mongoose.connection.on("error", (err) => {
                console.error("❌ MongoDB connection error:", err);
                this.isConnected = false;
            });

            mongoose.connection.on("disconnected", () => {
                console.warn("⚠️  MongoDB disconnected");
                this.isConnected = false;
            });

            mongoose.connection.on("reconnected", () => {
                console.log("🔄 MongoDB reconnected");
                this.isConnected = true;
            });

            // Graceful shutdown
            process.on("SIGINT", this.disconnect.bind(this));
            process.on("SIGTERM", this.disconnect.bind(this));
        } catch (error) {
            console.error("❌ MongoDB connection failed:", error.message);
            this.isConnected = false;
            throw error;
        }
    }

    async disconnect() {
        try {
            if (!this.isConnected) {
                console.log("MongoDB is already disconnected");
                return;
            }

            await mongoose.connection.close();
            this.isConnected = false;
            console.log("🔌 MongoDB disconnected gracefully");
        } catch (error) {
            console.error("❌ Error disconnecting from MongoDB:", error.message);
            throw error;
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
        };
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                throw new Error("Database not connected");
            }

            // Simple ping to check if connection is alive
            await mongoose.connection.db.admin().ping();
            return { status: "healthy", timestamp: new Date() };
        } catch (error) {
            return {
                status: "unhealthy",
                error: error.message,
                timestamp: new Date(),
            };
        }
    }
}

// Create singleton instance
const db = new Database();

module.exports = db;
