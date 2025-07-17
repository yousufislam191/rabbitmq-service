# Consumer Architecture Documentation

## Overview

The consumer system has been refactored into a modular, scalable architecture that separates consumer logic into dedicated files for better maintainability and future extensibility.

## Architecture Components

### 1. Base Consumer (`consumers/BaseConsumer.js`)

**Purpose**: Provides common functionality for all consumer implementations

-   Abstract base class with shared methods
-   Handles consumer lifecycle (initialize, setup, stop)
-   Provides standardized status reporting
-   Implements common error handling patterns

**Key Methods**:

-   `initialize(rabbitmq)` - Setup RabbitMQ connection
-   `setup()` - Start the consumer
-   `stop()` - Stop the consumer
-   `processMessage(message, rawMsg)` - Abstract method for message processing
-   `getStatus()` - Get consumer status information

### 2. Individual Consumer Classes

#### Processing Consumer (`consumers/ProcessingConsumer.js`)

-   **Queue**: `app.processing.queue`
-   **Purpose**: Handles main batch processing operations
-   **Features**: Job status tracking, worker delegation

#### Priority Consumer (`consumers/PriorityConsumer.js`)

-   **Queue**: `app.priority.queue`
-   **Purpose**: Handles urgent/priority operations
-   **Features**: Priority message handling, expedited processing

#### Dead Letter Consumer (`consumers/DeadLetterConsumer.js`)

-   **Queue**: `app.deadletter.queue`
-   **Purpose**: Handles failed messages for monitoring and analysis
-   **Features**: Dead letter logging, failure analysis, monitoring integration

### 3. Consumer Registry (`consumers/ConsumerRegistry.js`)

**Purpose**: Centralized management of all consumer instances

-   Maintains registry of all available consumers
-   Provides unified interface for consumer operations
-   Handles consumer lifecycle management
-   Supports dynamic consumer management

**Key Methods**:

-   `initialize(rabbitmq)` - Initialize all consumers
-   `startAll()` - Start all consumers
-   `stopAll()` - Stop all consumers
-   `startConsumer(queueName)` - Start specific consumer
-   `stopConsumer(queueName)` - Stop specific consumer
-   `restartConsumer(queueName)` - Restart specific consumer
-   `getAllConsumerStatus()` - Get status of all consumers

### 4. Consumer Service (`services/consumerService.js`)

**Purpose**: Main service interface for consumer management

-   Uses ConsumerRegistry for consumer operations
-   Manages worker processes
-   Provides API interface for consumer control
-   Handles RabbitMQ connection sharing

## File Structure

```
consumers/
├── BaseConsumer.js           # Base class for all consumers
├── ProcessingConsumer.js     # Main processing queue consumer
├── PriorityConsumer.js       # Priority queue consumer
├── DeadLetterConsumer.js     # Dead letter queue consumer
├── ConsumerRegistry.js       # Central consumer management
└── QueueConsumerManager.js   # Entry point (existing)

services/
└── consumerService.js        # Main consumer service (refactored)
```

## Adding New Consumers

### Step 1: Create Consumer Class

```javascript
// consumers/NewConsumer.js
const BaseConsumer = require("./BaseConsumer");
const { QUEUE_CONFIG } = require("../config/queues");

class NewConsumer extends BaseConsumer {
    getQueueName() {
        return QUEUE_CONFIG.NEW_QUEUE.name;
    }

    async processMessage(message, rawMsg) {
        const correlationId = rawMsg.properties.correlationId;
        console.log(`Processing new queue message: ${correlationId}`);

        // Implement your message processing logic here
        // ...
    }
}

module.exports = NewConsumer;
```

### Step 2: Register in ConsumerRegistry

```javascript
// In consumers/ConsumerRegistry.js
const NewConsumer = require("./NewConsumer");

// In initialize method:
const newConsumer = new NewConsumer(this.consumerService);
await newConsumer.initialize(rabbitmq);
this.consumers.set(QUEUE_CONFIG.NEW_QUEUE.name, newConsumer);
```

### Step 3: Add Queue Configuration

```javascript
// In config/queues.js
const QUEUE_CONFIG = {
    // ...existing queues...
    NEW_QUEUE: {
        name: "app.newqueue.queue",
        description: "Description of new queue",
        type: "newtype",
        options: {
            durable: true,
            prefetch: 1,
            retry: true,
            maxRetries: 3,
            retryDelayMs: 10000,
        },
    },
};
```

## Benefits of New Architecture

### 🎯 **Scalability**

-   Easy to add new consumers without modifying existing code
-   Each consumer is self-contained and independent
-   Registry pattern allows dynamic consumer management

### 🛠️ **Maintainability**

-   Clear separation of concerns
-   Each consumer has focused responsibility
-   Common functionality abstracted to base class
-   Centralized configuration management

### 🔧 **Flexibility**

-   Consumers can be started/stopped independently
-   Easy to customize consumer behavior per queue type
-   Supports different processing strategies per consumer

### 📊 **Monitoring**

-   Standardized status reporting across all consumers
-   Centralized health checking
-   Individual consumer metrics and monitoring

### 🧪 **Testing**

-   Individual consumers can be tested in isolation
-   Mock-friendly architecture
-   Clear interfaces for unit testing

## Migration Guide

### What Changed

1. **Consumer Logic**: Moved from methods in ConsumerService to separate classes
2. **Management**: Now uses ConsumerRegistry for centralized control
3. **Configuration**: Uses centralized queue configuration
4. **Interface**: API remains the same, implementation is modular

### Backward Compatibility

-   All existing API endpoints continue to work
-   Consumer management methods have same signatures
-   Configuration structure remains unchanged
-   No breaking changes to external interfaces

## Usage Examples

### Start All Consumers

```javascript
const consumerService = require("./services/consumerService");
await consumerService.startAllConsumers();
```

### Manage Individual Consumers

```javascript
// Start specific consumer
await consumerService.startConsumer("app.processing.queue");

// Stop specific consumer
await consumerService.stopConsumer("app.priority.queue");

// Restart consumer
await consumerService.restartConsumer("app.deadletter.queue");
```

### Get Consumer Status

```javascript
// All consumers
const allStatus = consumerService.getConsumerStatus();

// Specific consumer
const status = consumerService.getConsumerStatus("app.processing.queue");
```

This architecture provides a solid foundation for scaling your consumer system as your project grows and new queue types are added.
