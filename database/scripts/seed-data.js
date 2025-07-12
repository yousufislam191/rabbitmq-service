// MongoDB seed data script
db = db.getSiblingDB("rabbitmq_batch_db");

// Sample data for somemodels collection
db.somemodels.insertMany([
    {
        _id: ObjectId(),
        name: "Sample Model 1",
        status: "pending",
        data: {
            field1: "value1",
            field2: "value2",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        _id: ObjectId(),
        name: "Sample Model 2",
        status: "processing",
        data: {
            field1: "value3",
            field2: "value4",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        _id: ObjectId(),
        name: "Sample Model 3",
        status: "completed",
        data: {
            field1: "value5",
            field2: "value6",
        },
        createdAt: new Date(),
        updatedAt: new Date(),
    },
]);

// Sample data for jobcounters collection
db.jobcounters.insertMany([
    {
        jobId: "migration-001",
        totalRecords: 1000,
        processedRecords: 250,
        failedRecords: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
    {
        jobId: "migration-002",
        totalRecords: 500,
        processedRecords: 500,
        failedRecords: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
    },
]);

// Sample data for jobstatuses collection
db.jobstatuses.insertMany([
    {
        jobId: "migration-001",
        status: "running",
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        progress: 25,
        message: "Processing batch 3 of 10",
        createdAt: new Date(),
    },
    {
        jobId: "migration-002",
        status: "completed",
        startTime: new Date(Date.now() - 7200000), // 2 hours ago
        endTime: new Date(Date.now() - 3600000), // 1 hour ago
        progress: 100,
        message: "Migration completed successfully",
        createdAt: new Date(),
    },
]);

print("Database seeding completed successfully");
