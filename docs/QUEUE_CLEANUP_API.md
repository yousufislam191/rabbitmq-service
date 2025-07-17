# Queue Cleanup API

## Overview

The queue cleanup functionality has been moved from a standalone script to an API endpoint for better integration and control.

## Endpoint

**DELETE** `/api/queues/cleanup-all`

## Usage

### Request

```http
DELETE /api/queues/cleanup-all
Content-Type: application/json

{
  "confirm": "DELETE_ALL_QUEUES"
}
```

### Example with curl

```bash
curl -X DELETE http://localhost:3000/api/queues/cleanup-all \
  -H "Content-Type: application/json" \
  -d '{"confirm": "DELETE_ALL_QUEUES"}'
```

### Example with PowerShell

```powershell
$body = @{
    confirm = "DELETE_ALL_QUEUES"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:3000/api/queues/cleanup-all" `
  -Method DELETE `
  -ContentType "application/json" `
  -Body $body
```

## Response

### Success Response (200)

```json
{
    "success": true,
    "data": {
        "message": "Queue cleanup completed",
        "summary": {
            "total": 4,
            "deleted": 3,
            "notFound": 1,
            "errors": 0
        },
        "results": {
            "deletedQueues": ["app.processing.queue", "app.priority.queue", "app.deadletter.queue"],
            "notFoundQueues": ["app.retry.queue"],
            "errors": []
        },
        "recommendation": "Restart your application to recreate the infrastructure"
    },
    "timestamp": "2025-07-16T21:55:00.000Z"
}
```

### Error Response - Missing Confirmation (400)

```json
{
    "success": false,
    "error": {
        "message": "Cleanup requires explicit confirmation. Send { \"confirm\": \"DELETE_ALL_QUEUES\" } in request body.",
        "type": "CONFIRMATION_REQUIRED"
    },
    "timestamp": "2025-07-16T21:55:00.000Z"
}
```

## Safety Features

1. **Explicit Confirmation Required**: You must send `"confirm": "DELETE_ALL_QUEUES"` in the request body
2. **Detailed Results**: The response shows exactly which queues were deleted, not found, or had errors
3. **Non-blocking**: If some queues fail to delete, the operation continues with others
4. **Comprehensive Logging**: All operations are logged to the console

## Warning

⚠️ **This is a destructive operation that will delete all configured queues and their data. Use with caution!**

## When to Use

-   When you need to reset your RabbitMQ infrastructure
-   When resolving exchange type conflicts (like the PRECONDITION_FAILED errors)
-   During development when you need a clean slate
-   Before deploying configuration changes that affect queue structures

## After Cleanup

After running the cleanup, restart your application to recreate all queues and exchanges with the current configuration.
