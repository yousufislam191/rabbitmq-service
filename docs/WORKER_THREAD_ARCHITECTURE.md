# Worker Thread Consumer Architecture

## Overview

This system now implements a **multi-layered worker thread architecture** to keep the main Node.js thread completely free for other tasks. The architecture ensures that:

1. **Main Thread**: Handles HTTP requests, API responses, and coordination
2. **Consumer Worker Threads**: Each consumer runs in its own dedicated worker thread
3. **Processing Worker Threads**: Each batch processing task runs in a separate worker thread

## Architecture Layers

### Layer 1: Main Thread

-   Handles HTTP API requests
-   Manages worker thread lifecycle
-   Coordinates between different services
-   **Never blocked** by consumer or processing operations

### Layer 2: Consumer Worker Threads

-   Each queue has its own dedicated consumer worker thread:
    -   `ProcessingConsumer Worker` - Handles main processing queue
    -   `PriorityConsumer Worker` - Handles priority queue
    -   `DeadLetterConsumer Worker` - Handles dead letter queue
-   Each consumer worker:
    -   Connects to RabbitMQ independently
    -   Processes messages from its assigned queue
    -   Creates processing workers for actual batch processing
    -   Reports status back to main thread

### Layer 3: Processing Worker Threads

-   Created on-demand for each batch processing task
-   Handles the actual database operations (bulk updates)
-   Isolated from consumer threads and main thread
-   Automatically cleaned up after completion

## Worker Thread Tracking

### Consumer Worker Statistics

```javascript
{
  totalWorkersCreated: 3,
  activeConsumerWorkers: 3,
  workers: [
    {
      workerId: "consumer-worker-1",
      queueName: "processing-queue",
      consumerType: "ProcessingConsumer",
      status: "ready",
      startTime: "2025-07-17T10:00:00.000Z",
      messagesProcessed: 25,
      lastActivity: "2025-07-17T10:05:00.000Z",
      uptime: 300000
    }
  ]
}
```

### Processing Worker Statistics

```javascript
{
  totalCreated: 15,
  currentlyActive: 2,
  activeWorkers: [
    {
      correlationId: "batch-123",
      workerId: "consumer-worker-1-processing-5",
      queueName: "processing-queue",
      startTime: "2025-07-17T10:04:30.000Z",
      uptime: 30000
    }
  ]
}
```

## API Endpoints

### Consumer Management

-   `GET /consumers` - Get consumer status
-   `GET /consumers/health` - Get consumer health
-   `POST /consumers/start` - Start all consumers
-   `POST /consumers/stop` - Stop all consumers
-   `POST /consumers/restart` - Restart all consumers

### Individual Consumer Control

-   `POST /consumers/:queueName/start` - Start specific consumer
-   `POST /consumers/:queueName/stop` - Stop specific consumer
-   `POST /consumers/:queueName/restart` - Restart specific consumer

### Worker Thread Management

-   `PUT /consumers/mode` - Switch between worker thread and main thread mode
-   `GET /consumers/workers/stats` - Get detailed worker statistics
-   `GET /consumers/workers/health` - Get worker thread health status

## Configuration

### Enable/Disable Worker Thread Mode

```javascript
// Enable worker thread consumers (default)
PUT /consumers/mode
{
  "useWorkerThreads": true
}

// Disable worker thread consumers (legacy main thread mode)
PUT /consumers/mode
{
  "useWorkerThreads": false
}
```

## Benefits

### Performance Benefits

1. **Non-blocking Main Thread**: Main thread is always responsive to HTTP requests
2. **Parallel Processing**: Multiple consumers can process different queues simultaneously
3. **Isolation**: Each consumer is isolated in its own worker thread
4. **Scalability**: Easy to add more consumer types without affecting existing ones

### Monitoring Benefits

1. **Detailed Tracking**: Track exactly how many worker threads are created
2. **Real-time Statistics**: Monitor worker thread performance and health
3. **Individual Control**: Start/stop/restart individual consumers
4. **Health Monitoring**: Comprehensive health checks for all worker threads

### Reliability Benefits

1. **Auto-restart**: Failed worker threads are automatically restarted
2. **Graceful Shutdown**: Workers can be stopped gracefully
3. **Error Isolation**: Errors in one consumer don't affect others
4. **Resource Management**: Automatic cleanup of completed workers

## Worker Thread Lifecycle

### Consumer Worker Lifecycle

1. **Creation**: Worker thread created with dedicated connections
2. **Initialization**: Connects to MongoDB and RabbitMQ
3. **Ready**: Starts consuming messages from assigned queue
4. **Processing**: Creates processing workers for each batch
5. **Monitoring**: Reports status and statistics to main thread
6. **Shutdown**: Gracefully stops and cleans up resources

### Processing Worker Lifecycle

1. **Creation**: Created by consumer worker for each batch
2. **Processing**: Performs bulk database operations
3. **Completion**: Reports results back to consumer worker
4. **Cleanup**: Automatically terminated and removed from tracking

## Error Handling

### Consumer Worker Errors

-   Automatic restart after 5 seconds
-   Error reporting to main thread
-   Health status tracking
-   Manual restart capability

### Processing Worker Errors

-   Timeout protection (5 minutes)
-   Graceful error handling
-   Job status updates in database
-   Resource cleanup

## Example Usage

### Start All Consumers in Worker Threads

```bash
POST /consumers/start
```

### Get Detailed Worker Statistics

```bash
GET /consumers/workers/stats
```

### Switch to Main Thread Mode (Legacy)

```bash
PUT /consumers/mode
{
  "useWorkerThreads": false
}
```

### Monitor Worker Health

```bash
GET /consumers/workers/health
```

## Migration from Main Thread

The system supports both modes:

-   **Worker Thread Mode** (default): All consumers run in worker threads
-   **Main Thread Mode** (legacy): Consumers run in main thread

You can switch between modes at runtime (when consumers are stopped) using the `/consumers/mode` endpoint.

## Performance Monitoring

Monitor the following metrics:

-   `totalWorkersCreated`: Total consumer workers created since startup
-   `activeConsumerWorkers`: Currently running consumer workers
-   `messagesProcessed`: Messages processed by each consumer worker
-   `totalCreated`: Total processing workers created
-   `currentlyActive`: Currently active processing workers

This architecture ensures optimal performance while maintaining full visibility into worker thread usage and system health.
