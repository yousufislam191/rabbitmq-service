# Archive Flow Testing Guide

## Overview

This guide explains how to test the complete bulk data migration flow from `SomeModel` collection to `SomeModelArchive` collection through RabbitMQ queues.

## Architecture

```
[SomeModel] → [Fetch & Publish] → [Archive Queue] → [Archive Worker] → [SomeModelArchive]
```

### Components Created:

1. **SomeModelArchive Model** (`models/someModelArchive.js`)

    - Archive collection schema with original document data
    - Archive-specific metadata fields
    - Indexes for efficient querying

2. **Archive Worker** (`workers/archiveWorker.js`)

    - Processes individual archive messages
    - Moves data from SomeModel to SomeModelArchive
    - Handles bulk insertion with error handling

3. **Archive Consumer Worker** (`workers/consumers/ArchiveConsumerWorker.js`)

    - Consumes messages from archive queue
    - Manages multiple processing workers
    - Provides load balancing and error recovery

4. **Archive Queue Configuration** (`config/queues.js`)

    - Dedicated archive queue with specific settings
    - Optimized for bulk operations

5. **Test Archive Flow Endpoint** (`POST /api/seed/test-archive-flow`)
    - End-to-end testing endpoint
    - Orchestrates the complete flow

## Testing Instructions

### 1. Start the Application

```bash
npm start
# or
npm run dev
```

### 2. Run the Archive Flow Test

#### Option A: Using the Test Script

```bash
node test-archive-flow.js
```

#### Option B: Using HTTP API

```bash
curl -X POST http://localhost:3000/api/seed/test-archive-flow \
  -H "Content-Type: application/json" \
  -d '{
    "insertCount": 500,
    "batchSize": 100,
    "clearExisting": true,
    "archiveQueueType": "archive",
    "priority": 0,
    "testMode": true
  }'
```

#### Option C: Using Manual Steps

1. **Insert Test Data:**

```bash
curl -X POST http://localhost:3000/api/seed/insert-batch \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "someModel",
    "totalCount": 1000,
    "batchSize": 200,
    "clearExisting": true
  }'
```

2. **Fetch and Publish to Archive Queue:**

```bash
curl -X POST http://localhost:3000/api/seed/fetch-and-publish \
  -H "Content-Type: application/json" \
  -d '{
    "collection": "someModel",
    "batchSize": 100,
    "limit": 1000,
    "priority": 0,
    "queueType": "archive"
  }'
```

### 3. Monitor the Process

#### Check Queue Status:

```bash
curl http://localhost:3000/api/queue/status
```

#### Check Consumer Workers:

```bash
curl http://localhost:3000/api/queue/consumers
```

#### Check Health:

```bash
curl http://localhost:3000/api/health
```

## Expected Flow

1. **Data Insertion**: Test data is inserted into `SomeModel` collection
2. **Publishing**: Data is fetched in batches and published to the archive queue
3. **Archive Processing**: Archive consumer workers process messages from the queue
4. **Data Migration**: Each message is processed by an archive worker that:
    - Extracts original document data
    - Adds archive metadata
    - Inserts into `SomeModelArchive` collection
    - Optionally removes original documents (currently disabled)

## Verification

### Check Collections in MongoDB:

```javascript
// Connect to MongoDB
use your_database_name

// Check SomeModel collection (source)
db.somemodels.count()
db.somemodels.findOne()

// Check SomeModelArchive collection (target)
db.somemodelarchives.count()
db.somemodelarchives.findOne()

// Verify archive metadata
db.somemodelarchives.find({}, {
  originalId: 1,
  archiveBatch: 1,
  archivedAt: 1,
  archivedBy: 1
}).limit(5)
```

### Expected Results:

-   Documents in `SomeModelArchive` should contain all original data plus archive metadata
-   Archive documents should have `originalId` matching `_id` from source collection
-   All documents should have proper `archiveBatch` identifiers
-   Archive timestamps should be recent

## Configuration Options

### Test Configuration:

```javascript
{
  insertCount: 500,        // Number of documents to insert
  batchSize: 100,          // Batch size for operations
  clearExisting: true,     // Clear existing data first
  archiveQueueType: "archive", // Queue type for publishing
  priority: 0,             // Message priority
  testMode: true           // Enable test mode logging
}
```

### Queue Configuration:

```javascript
ARCHIVE: {
  name: "app.archive.queue",
  description: "Archive queue for bulk data migration operations",
  type: "archive",
  options: {
    durable: true,
    prefetch: 1,           // Process one batch at a time
    retry: true,
    maxRetries: 3,
    retryDelayMs: 15000,   // Longer retry delay for archive operations
  },
}
```

## Performance Considerations

-   **Batch Size**: Adjust based on document size and memory constraints
-   **Worker Concurrency**: Archive consumer can handle up to 3 concurrent processing workers
-   **Queue Prefetch**: Set to 1 to ensure proper load distribution
-   **Retry Logic**: Configured for reliable processing with exponential backoff

## Troubleshooting

### Common Issues:

1. **Queue Not Processing**:

    - Check if archive consumer worker is running
    - Verify queue configuration and bindings
    - Check RabbitMQ connection status

2. **Archive Worker Errors**:

    - Check MongoDB connection
    - Verify SomeModelArchive model is properly imported
    - Check for document validation errors

3. **Memory Issues**:
    - Reduce batch size
    - Monitor worker memory usage
    - Adjust prefetch settings

### Debug Commands:

```bash
# Check application logs
npm start 2>&1 | grep -E "(Archive|archive)"

# Monitor queue in RabbitMQ Management UI
# http://localhost:15672 (if RabbitMQ management plugin is enabled)

# Check MongoDB operations
mongosh --eval "db.runCommand({currentOp: true})"
```

## Cleanup

### Clear Test Data:

```bash
curl -X DELETE http://localhost:3000/api/seed/clear-all \
  -H "Content-Type: application/json" \
  -d '{"confirmation": "DELETE_ALL_DATA"}'
```

### Purge Queue:

```bash
curl -X POST http://localhost:3000/api/queue/purge \
  -H "Content-Type: application/json" \
  -d '{"queueName": "app.archive.queue"}'
```
