# System Scalability Documentation

This document explains the technical architectures, configurations, and strategies for scaling the Amrutam Pharmaceuticals Telemedicine Platform to support **100,000+ consultations per day** and high concurrent throughput.

---

## 1. Capacity Planning for 100,000 Consultations/Day

To process 100k consultations daily, we must size the infrastructure to handle both average loads and peak spikes:

* **Average Rate**: `100,000 consultations / 86,400 seconds ≈ 1.16 consultations/second`.
* **Peak Loading (10x multiplier)**: Telemedicine traffic is highly bursty (usually concentrated in morning and evening slots). Sizing for peak loads requires processing **12 to 15 bookings/consultations per second**.
* **Associated API Calls**: Every booking action generates multiple supplementary reads/writes (checking slots, processing payments, updating audit logs, sending notifications). This equates to **150 to 200 database queries per second** at peak, which easily runs within database capacity when optimized.

---

## 2. Horizontal Scaling & Stateless Services

To handle fluctuating loads dynamically, the API service layer is designed to be **completely stateless**:

* **No Server Sessions**: All session contexts are stored client-side via cryptographically signed JWT tokens or offloaded to a Redis session cache.
* **Shared Storage**: Local server files are avoided. Assets (e.g. prescription PDFs, medical documents) are uploaded directly to S3-compatible object storage.
* **Load Balancing**: Multiple instances of the API container can run behind a Round-Robin Application Load Balancer (ALB) or Nginx gateway. Containers can scale out horizontally using auto-scaling groups based on CPU/Memory thresholds.

---

## 3. Database Optimizations (PostgreSQL)

The primary database remains the ultimate bottleneck in relational database architectures. We apply the following scaling strategies:

### A. Connection Pooling
* **The Problem**: Node.js is single-threaded but uses asynchronous event loops. Each API instance establishes multiple database connections. Under high scaling, the PostgreSQL connection limit (default 100) will be exhausted.
* **The Solution**: We deploy **pgBouncer** in front of PostgreSQL.
  - **Transaction Mode** is utilized to reuse database connections immediately after a transaction block completes, reducing connection overhead and enabling thousands of concurrent client connections.
  - Prisma connection limits are limited using variables: `DATABASE_URL="postgresql://...:5432/amrutam?connection_limit=10&pgbouncer=true"`.

### B. Indexing Strategy
To prevent full table scans on large tables (e.g. `bookings`, `audit_logs`), specific multi-column and single-column indices are defined in the Prisma schema:

| Table | Index Target | Query Pattern Optimized |
| :--- | :--- | :--- |
| `users` | `email` (Unique) | User Login & Authentication checks |
| `refresh_tokens` | `token` (Index) | Session verification and rotation validation |
| `availability_slots` | `[doctorId, date]` (Composite Index) | Fetching doctor schedules for patients |
| `bookings` | `patientId`, `doctorId` (Indices) | Listing patient history and doctor queues |
| `audit_logs` | `userId`, `createdAt` (Indices) | Security audit trail lookups |

### C. Partitioning Strategy
For long-term storage scaling, the `audit_logs` table accumulates millions of rows. We implement **Range Partitioning** on the `createdAt` column:
- Database partitions are split monthly (e.g., `audit_logs_2026_07`, `audit_logs_2026_08`).
- Older partitions can be detached and archived to cold storage (e.g. AWS S3 or Snowflake) to keep the primary transactional index lightweight.

---

## 4. Caching Architecture (Redis)

Caching is implemented to intercept read queries before they hit the database:

```text
[API Request]
      │
      ├─► [1. Check Redis Cache] ── (Hit) ──► [Return Cached JSON Data]
      │
      ▼ (Miss)
[2. Query PostgreSQL Database]
      │
      ├─► [3. Write JSON Data to Redis (with TTL)]
      │
      ▼
[4. Return Fresh Data to Client]
```

* **Caching Targets**:
  - **Doctor Profiles & Services**: High-read, low-write data cached with a Time-To-Live (TTL) of 1 hour.
  - **Availability Slots**: Cached dynamically. Any booking action invalidates the cache.
* **Cache Eviction**: Uses Least Recently Used (LRU) policy with a maximum memory limit to prevent memory exhaustion.

---

## 5. Async Processing & Background Queues (BullMQ)

High-latency tasks (like processing payments, generating PDF prescriptions, and sending transactional emails) are decoupled from the request-response thread:

* **Queue System**: Built on top of **BullMQ** using Redis.
* **Worker Pools**: Dedicated background worker processes consume jobs from the Redis queue.
* **Benefits**: The API returns a `202 Accepted` status instantly to the user, improving responsiveness, while workers process heavy tasks reliably in the background.

---

## 6. Concurrency & Write Optimizations

### A. Optimistic Locking
To prevent two patients from booking the same doctor availability slot simultaneously:
1. Every availability slot contains a `version` integer column.
2. When booking, the system fetches the slot details: `SELECT version, isBooked FROM availability_slots WHERE id = :id`.
3. The booking service updates the slot state: `UPDATE availability_slots SET isBooked = true, version = version + 1 WHERE id = :id AND version = :currentVersion AND isBooked = false`.
4. If `0` rows are modified, a concurrency conflict has occurred, and the transaction aborts (returning a `409 Conflict` error to the client).

### B. Idempotency Key Mechanics
For payment and booking operations, patients might double-submit because of poor network connections:
- Booking requests require an `Idempotency-Key` header (usually a UUID generated client-side).
- The API records the key in a Redis store or the `bookings` table.
- If a subsequent request arrives with the same key within 24 hours, the API skips execution and returns the cached response from the first request.

### C. Retry Strategies
All micro-services or external API calls (e.g. Payment Gateway APIs) utilize an **Exponential Backoff Retry Strategy**:
- Initial failure retries after `2^0 = 1` second.
- Subsequent retries at 2s, 4s, and 8s, up to a maximum limit of 5 retries.
- Utilizes jitter (random variance) to prevent thundering herd problems on third-party gateways.

---

## 7. Performance Bottlenecks & Mitigations

| Identified Bottleneck | Mitigation Strategy |
| :--- | :--- |
| **Bcrypt Overhead** | Hashing passwords takes ~80ms to prevent brute-force attacks, which is CPU-heavy. We isolate authentication routes to specific server resources or scale nodes horizontally under heavy traffic. |
| **Prisma Query Batching** | Prisma generates multiple SQL statements for deep relationship inclusions. We use manual SQL joins or optimize queries using select projections (`select: { id: true, email: true }`) instead of loading full objects. |
| **Queue Backpressure** | If background workers crash, Redis memory could fill up. We configure BullMQ alert thresholds for queue size, and implement dead-letter queues (DLQ) for failing jobs. |
