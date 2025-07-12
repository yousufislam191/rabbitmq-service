# Database Scripts

This directory contains MongoDB initialization and management scripts for the RabbitMQ Batch Update application.

## Scripts Overview

### `mongo-init.js`

-   **Purpose**: Initial database setup and user creation
-   **Usage**: Automatically executed when MongoDB container starts
-   **Functions**:
    -   Creates the application database
    -   Creates application user with proper permissions
    -   Creates initial collections
    -   Sets up basic indexes

### `seed-data.js`

-   **Purpose**: Populate database with sample data for development
-   **Usage**: Run manually for testing and development
-   **Functions**:
    -   Inserts sample records into collections
    -   Provides realistic test data
    -   Useful for development and testing

### `migrations.js`

-   **Purpose**: Database schema migrations and optimizations
-   **Usage**: Run when updating database structure
-   **Functions**:
    -   Adds performance indexes
    -   Sets up TTL indexes for automatic cleanup
    -   Adds schema validation
    -   Optimizes query performance

## Usage

### Automatic Initialization

The `mongo-init.js` script runs automatically when the MongoDB Docker container starts for the first time.

### Manual Execution

To run other scripts manually:

```bash
# Connect to MongoDB container
docker exec -it mongodb-server mongosh

# Switch to the application database
use rabbitmq_batch_db

# Load and execute scripts
load('/docker-entrypoint-initdb.d/seed-data.js')
load('/docker-entrypoint-initdb.d/migrations.js')
```

### Using MongoDB Compass

You can also copy and paste the script contents into MongoDB Compass's query interface.

## Collections

### `somemodels`

-   Main data collection for batch processing
-   Indexes: \_id, status + createdAt, data.field1, text search

### `jobcounters`

-   Tracks job processing statistics
-   Indexes: jobId (unique)

### `jobstatuses`

-   Monitors job execution status
-   Indexes: status + createdAt, TTL for automatic cleanup
-   Schema validation for data integrity

## Environment Variables

Make sure these are set in your `.env` file:

-   `MONGODB_URI`: Connection string for the application
-   `MONGO_INITDB_ROOT_USERNAME`: Root username for MongoDB
-   `MONGO_INITDB_ROOT_PASSWORD`: Root password for MongoDB
-   `MONGO_INITDB_DATABASE`: Initial database name

## Best Practices

1. **Backup**: Always backup before running migrations
2. **Testing**: Test scripts in development environment first
3. **Monitoring**: Monitor performance after index changes
4. **Cleanup**: Use TTL indexes for automatic data cleanup
5. **Validation**: Use schema validation for data integrity
