# Consumer Management Enhancement

This document describes the enhanced consumer management functionality that allows for granular control over individuaThe existing bulk operations remain unchanged and still work as before:

-   `GET /consumers/status` - Get status of all consumers
-   `GET /consumers/health` - Get health of all consumers
-   `POST /consumers/start` - Start all consumers
-   `POST /consumers/stop` - Stop all consumers
-   `POST /consumers/restart` - Restart all consumersmers instead of just bulk operations.

## Overview

The system now supports managing specific consumers for different queue types:

-   `app.processing.queue` - Main processing queue for batch operations
-   `app.priority.queue` - Priority queue for urgent operations
-   `app.deadletter.queue` - Dead letter queue for failed messages

## New API Endpoints

### Get Available Queues

```
GET /consumers/available
```

Returns a list of all available queues and their descriptions.

**Response:**

```json
{
    "success": true,
    "data": {
        "queues": [
            {
                "name": "app.processing.queue",
                "description": "Main processing queue for batch operations",
                "type": "processing"
            },
            {
                "name": "app.priority.queue",
                "description": "Priority queue for urgent operations",
                "type": "priority"
            },
            {
                "name": "app.deadletter.queue",
                "description": "Dead letter queue for failed messages",
                "type": "deadletter"
            }
        ]
    }
}
```

### Get Specific Consumer Status

```
GET /consumers/{queueName}/status
```

Returns the status of a specific consumer.

**Parameters:**

-   `queueName` - The name of the queue (e.g., "app.processing.queue")

**Response:**

```json
{
    "success": true,
    "data": {
        "consumer": {
            "queueName": "app.processing.queue",
            "isRunning": true,
            "consumerTag": "amq.ctag-abc123",
            "activeWorkers": 2,
            "workerIds": ["worker-123", "worker-124"],
            "timestamp": "2024-01-15T10:30:00.000Z"
        }
    }
}
```

### Start Specific Consumer

```
POST /consumers/{queueName}/start
```

Starts a specific consumer for the given queue.

**Parameters:**

-   `queueName` - The name of the queue to start consumer for

**Response:**

```json
{
    "success": true,
    "data": {
        "success": true,
        "message": "Consumer for app.processing.queue started successfully"
    },
    "message": "Consumer for app.processing.queue started successfully"
}
```

### Stop Specific Consumer

```
POST /consumers/{queueName}/stop
```

Stops a specific consumer and terminates its related workers.

**Parameters:**

-   `queueName` - The name of the queue to stop consumer for

**Response:**

```json
{
    "success": true,
    "data": {
        "success": true,
        "message": "Consumer for app.processing.queue stopped successfully"
    },
    "message": "Consumer for app.processing.queue stopped successfully"
}
```

### Restart Specific Consumer

```
POST /consumers/{queueName}/restart
```

Restarts a specific consumer (stops then starts).

**Parameters:**

-   `queueName` - The name of the queue to restart consumer for

**Response:**

```json
{
    "success": true,
    "data": {
        "success": true,
        "message": "Consumer for app.processing.queue restarted successfully"
    },
    "message": "Consumer for app.processing.queue restarted successfully"
}
```

## Existing Bulk Operations

The existing bulk operations remain unchanged and still work as before:

-   `GET /queue/consumers/status` - Get status of all consumers
-   `GET /queue/consumers/health` - Get health of all consumers
-   `POST /queue/consumers/start` - Start all consumers
-   `POST /queue/consumers/stop` - Stop all consumers
-   `POST /queue/consumers/restart` - Restart all consumers

## Error Handling

All endpoints use the global error handling system and return structured error responses:

```json
{
    "success": false,
    "error": {
        "message": "Invalid queue name: invalid.queue. Valid queues: app.processing.queue, app.priority.queue, app.deadletter.queue",
        "type": "ValidationError",
        "statusCode": 400
    }
}
```

## Implementation Features

### Enhanced Worker Tracking

-   Workers are now tracked with their associated queue names
-   Worker termination is queue-specific when stopping individual consumers
-   Worker statistics include queue association

### Connection Management

-   Reuses existing RabbitMQ connections from the queue service
-   Maintains channel isolation for individual consumers
-   Proper cleanup when stopping specific consumers

### Validation

-   Validates queue names against allowed queue list
-   Prevents operations on non-existent or invalid queues
-   Graceful handling of already running/stopped consumers

## Usage Examples

### Start only the processing consumer:

```bash
curl -X POST http://localhost:3000/consumers/app.processing.queue/start
```

### Check status of priority consumer:

```bash
curl http://localhost:3000/consumers/app.priority.queue/status
```

### Stop dead letter consumer:

```bash
curl -X POST http://localhost:3000/consumers/app.deadletter.queue/stop
```

### Get list of available queues:

```bash
curl http://localhost:3000/consumers/available
```
