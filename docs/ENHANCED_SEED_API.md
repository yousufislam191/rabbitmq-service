# Enhanced Seed Service API Documentation

## Overview

The enhanced seed service provides powerful endpoints for database management and batch processing operations, including data clearing, batch insertion, and queue publishing capabilities.

## New Endpoints

### 1. Clear All Data

**Endpoint:** `DELETE /seed/clear-all`
**Description:** Clears all data from all collections in the database

**Request Body:**

```json
{
    "confirmation": "DELETE_ALL_DATA"
}
```

**Response:**

```json
{
    "success": true,
    "message": "All data cleared successfully",
    "statistics": {
        "collectionsCleared": 3,
        "totalDocumentsDeleted": 200,
        "durationSeconds": 0.146
    },
    "timestamp": "2025-07-16T23:54:42.054Z"
}
```

**Features:**

-   ✅ Requires explicit confirmation to prevent accidental data loss
-   ✅ Clears all collections (except system collections)
-   ✅ Provides detailed statistics on cleared data
-   ✅ Performance metrics included

---

### 2. Insert Batch Data

**Endpoint:** `POST /seed/insert-batch`
**Description:** Inserts dummy data into database collections in configurable batches

**Request Body:**

```json
{
    "collection": "someModel", // "someModel" or "jobStatus"
    "totalCount": 1000, // Total documents to insert (1-1,000,000)
    "batchSize": 100, // Documents per batch (1-5,000)
    "clearExisting": false // Whether to clear existing data first
}
```

**Response:**

```json
{
    "success": true,
    "message": "Batch data insertion completed for someModel",
    "statistics": {
        "collection": "someModel",
        "totalDocuments": 200,
        "batchesProcessed": 4,
        "batchSize": 50,
        "durationSeconds": 0.47,
        "documentsPerSecond": 426
    },
    "timestamp": "2025-07-16T23:53:19.865Z"
}
```

**Features:**

-   ✅ Support for multiple collections (someModel, jobStatus)
-   ✅ Configurable batch sizes for performance optimization
-   ✅ Optional clearing of existing data
-   ✅ Performance monitoring with documents/second metrics
-   ✅ Progress logging during insertion

---

### 3. Fetch and Publish Batches

**Endpoint:** `POST /seed/fetch-and-publish`
**Description:** Fetches data from database collections and publishes to RabbitMQ queues in batches

**Request Body:**

```json
{
    "collection": "someModel", // "someModel" or "jobStatus"
    "batchSize": 100, // Documents per batch (1-1,000)
    "limit": null, // Max documents to process (null = all)
    "priority": 0, // Message priority (0-10)
    "queueType": "processing", // "processing", "priority", or "deadletter"
    "filter": {} // MongoDB filter query
}
```

**Response:**

```json
{
    "success": true,
    "message": "Fetch and publish completed for someModel",
    "statistics": {
        "collection": "someModel",
        "totalDocuments": 100,
        "batchesPublished": 4,
        "batchSize": 25,
        "queueType": "processing",
        "priority": 3,
        "filter": {},
        "durationSeconds": 0.347,
        "documentsPerSecond": 288
    },
    "timestamp": "2025-07-16T23:53:49.045Z"
}
```

**Features:**

-   ✅ Flexible database querying with MongoDB filters
-   ✅ Multiple queue type support (processing, priority, deadletter)
-   ✅ Configurable message priority levels
-   ✅ Batch size optimization for queue performance
-   ✅ Document limit controls for large datasets
-   ✅ Detailed publishing statistics

## Usage Examples

### Example 1: Clear All Data (with confirmation)

```bash
curl -X DELETE -H "Content-Type: application/json" \\
  -d '{"confirmation":"DELETE_ALL_DATA"}' \\
  http://localhost:3000/seed/clear-all
```

### Example 2: Insert Test Data in Batches

```bash
curl -X POST -H "Content-Type: application/json" \\
  -d '{
    "collection": "someModel",
    "totalCount": 5000,
    "batchSize": 500,
    "clearExisting": true
  }' \\
  http://localhost:3000/seed/insert-batch
```

### Example 3: Publish High-Priority Data to Queue

```bash
curl -X POST -H "Content-Type: application/json" \\
  -d '{
    "collection": "someModel",
    "batchSize": 50,
    "limit": 1000,
    "priority": 9,
    "queueType": "priority",
    "filter": {"status": "pending"}
  }' \\
  http://localhost:3000/seed/fetch-and-publish
```

### Example 4: Process Failed Jobs to Dead Letter Queue

```bash
curl -X POST -H "Content-Type: application/json" \\
  -d '{
    "collection": "jobStatus",
    "batchSize": 25,
    "priority": 1,
    "queueType": "deadletter",
    "filter": {"status": "failed"}
  }' \\
  http://localhost:3000/seed/fetch-and-publish
```

## Performance Considerations

### Batch Size Guidelines

-   **Insert Operations**: 100-1000 documents per batch for optimal performance
-   **Queue Publishing**: 25-100 documents per batch to avoid queue overload
-   **Large Datasets**: Use smaller batches (50-100) to maintain responsiveness

### Memory Management

-   The service uses `lean()` queries for better memory efficiency
-   Automatic delays between batches prevent system overload
-   Progress logging helps monitor long-running operations

### Queue Integration

-   Messages include comprehensive metadata for processing
-   Correlation IDs enable message tracking
-   Routing keys support different queue types and priorities

## Error Handling

All endpoints include comprehensive error handling:

-   ✅ Input validation with clear error messages
-   ✅ Database connection verification
-   ✅ Queue service initialization checks
-   ✅ Graceful handling of partial failures
-   ✅ Detailed error reporting with timestamps

## Monitoring

The service provides detailed statistics for all operations:

-   Document counts and processing rates
-   Batch processing metrics
-   Performance timing data
-   Queue publishing confirmations
-   Error tracking and reporting

## Security

### Data Protection

-   Clear all data requires explicit confirmation string
-   Input validation prevents invalid operations
-   Reasonable limits on batch sizes and document counts

### Queue Security

-   Messages include source identification
-   Correlation IDs enable audit trails
-   Priority controls prevent queue flooding
