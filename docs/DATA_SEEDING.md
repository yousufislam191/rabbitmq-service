# Data Seeding Documentation

This document explains how to use the data seeding functionality to generate dummy data for testing your RabbitMQ Batch Update application.

## Overview

The data seeding system allows you to:

-   Generate realistic dummy data for testing
-   Insert thousands of documents quickly using bulk operations
-   Control batch sizes for optimal performance
-   Clear existing data when needed
-   Get statistics about your collections

## Available Endpoints

### 📚 Documentation

-   **GET** `/seed/docs` - Get complete API documentation with examples

### 📊 Statistics

-   **GET** `/seed/stats` - Get current collection statistics and document counts

### 🌱 Data Creation

-   **POST** `/seed/some-model` - Seed SomeModel collection
-   **POST** `/seed/job-status` - Seed JobStatus collection
-   **POST** `/seed/all` - Seed all collections at once

### 🗑️ Data Management

-   **DELETE** `/seed/clear` - Clear all test data (requires confirmation)

## Quick Start

### 1. Check Current Data

```bash
GET http://localhost:3000/seed/stats
```

### 2. Create 1000 Test Documents

```bash
POST http://localhost:3000/seed/some-model
Content-Type: application/json

{
  "count": 1000,
  "clearExisting": false,
  "batchSize": 1000
}
```

### 3. Create Large Dataset for Performance Testing

```bash
POST http://localhost:3000/seed/some-model
Content-Type: application/json

{
  "count": 10000,
  "clearExisting": true,
  "batchSize": 2000
}
```

### 4. Seed All Collections

```bash
POST http://localhost:3000/seed/all
Content-Type: application/json

{
  "someModelCount": 5000,
  "jobStatusCount": 500,
  "clearExisting": true,
  "batchSize": 1000
}
```

## Request Parameters

### SomeModel Seeding (`/seed/some-model`)

| Parameter       | Type    | Default | Description                               |
| --------------- | ------- | ------- | ----------------------------------------- |
| `count`         | number  | 1000    | Number of documents to create (1-100,000) |
| `clearExisting` | boolean | false   | Clear existing data before seeding        |
| `batchSize`     | number  | 1000    | Batch size for insertion (max 5,000)      |

### JobStatus Seeding (`/seed/job-status`)

| Parameter       | Type    | Default | Description                              |
| --------------- | ------- | ------- | ---------------------------------------- |
| `count`         | number  | 100     | Number of documents to create (1-10,000) |
| `clearExisting` | boolean | false   | Clear existing data before seeding       |
| `batchSize`     | number  | 500     | Batch size for insertion (max 1,000)     |

### All Collections (`/seed/all`)

| Parameter        | Type    | Default | Description                        |
| ---------------- | ------- | ------- | ---------------------------------- |
| `someModelCount` | number  | 1000    | SomeModel documents to create      |
| `jobStatusCount` | number  | 100     | JobStatus documents to create      |
| `clearExisting`  | boolean | false   | Clear existing data before seeding |
| `batchSize`      | number  | 1000    | Batch size for insertion           |

## Generated Data Structure

### SomeModel Documents

```javascript
{
  name: "John Smith",                    // Random first + last name
  email: "john.smith123@gmail.com",      // Generated email
  status: "pending",                     // Random: pending, processing, success, failed
  updateFields: {
    priority: 2,                         // Random 1-5
    category: "normal",                  // Random category
    department: "marketing",             // Random department
    lastModified: "2025-07-12T10:30:00Z",
    version: 3,                          // Random 1-10
    notes: "Generated test data for John Smith",
    metadata: {
      source: "seed-service",
      batch: "batch-1736689200000",
      region: "US"                       // Random: US, EU, ASIA
    }
  },
  createdAt: "2025-04-15T08:20:00Z",     // Random within last 90 days
  updatedAt: "2025-07-12T10:30:00Z"
}
```

### JobStatus Documents

```javascript
{
  correlationId: "job-1736689200000-000001",
  status: "success",                     // Random: pending, processing, success, failed
  createdAt: "2025-06-20T14:15:00Z",     // Random within last 30 days
  completedAt: "2025-06-20T15:45:00Z",   // Set for completed jobs
  totalItems: 542,                       // Random 1-1000
  error: null                            // Set for failed jobs
}
```

## Performance Tips

1. **Start Small**: Test with 100-1000 documents first
2. **Batch Size**: Use larger batches (2000-5000) for better performance with large datasets
3. **Memory**: Monitor memory usage when creating 10,000+ documents
4. **Clear Data**: Use `clearExisting: true` when you want fresh test data
5. **Statistics**: Check `/seed/stats` to monitor your data growth

## Using with Postman

Import the provided Postman collection which includes:

-   Pre-configured requests for all seeding operations
-   Examples for different dataset sizes
-   Automatic response validation
-   Collection variables for dynamic data

## Error Handling

The seeding service includes comprehensive error handling:

-   Input validation (count limits, batch size limits)
-   Database connection checks
-   Bulk insertion error recovery
-   Performance monitoring and logging

## Clearing Data

To clear all test data:

```bash
DELETE http://localhost:3000/seed/clear
Content-Type: application/json

{
  "confirm": "DELETE_ALL_DATA"
}
```

⚠️ **Warning**: This will permanently delete all documents from SomeModel and JobStatus collections.

## Integration with Migration Testing

After seeding data, you can test the migration functionality:

1. Seed 5000+ documents: `POST /seed/some-model`
2. Check data distribution: `GET /seed/stats`
3. Start migration: `POST /migrate`
4. Monitor progress: `GET /migrate/status/:id`
5. Check queue stats: `GET /queue/stats`

This provides a realistic testing environment for your batch processing system.
