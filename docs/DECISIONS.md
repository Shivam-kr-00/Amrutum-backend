# Architectural Decision Records (ADR)

This document explains the rationale behind key technical choices, software design decisions, and technology selections made during the development of the Amrutam Pharmaceuticals Telemedicine Platform.

---

## ADR 01: Node.js Runtime Platform
* **Context**: Choosing the base application runtime environment.
* **Decision**: We chose **Node.js (v22+)** as the backend runtime.
* **Rationale**: Node.js has a non-blocking, event-driven I/O model that makes it highly efficient for handling concurrent HTTP requests (such as scheduling slots and patient queries). The ecosystem (NPM) offers robust, mature libraries for database connectivity, security, validation, and logging.
* **Tradeoffs**: Node.js runs on a single-threaded event loop, meaning CPU-heavy tasks (like password hashing with Bcrypt) can block request processing if not scaled properly. We mitigate this by using horizontal container scaling.

---

## ADR 02: TypeScript Language Selection
* **Context**: Choice of language for application logic.
* **Decision**: We chose **TypeScript** over raw JavaScript.
* **Rationale**: TypeScript adds strict static typing, interfaces, and compile-time verification. This prevents runtime errors (such as accessing undefined attributes), ensures database models match ORM query outputs exactly, and improves IDE auto-completion.
* **Tradeoffs**: Requires a compilation build step (`tsc`) and increases initial development setup time. The safety benefits in production outweigh the minor compilation overhead.

---

## ADR 03: PostgreSQL Database Engine
* **Context**: Storing relational entities like users, profiles, bookings, consultations, and prescriptions.
* **Decision**: We selected **PostgreSQL** as the primary transactional database.
* **Rationale**: Telemedicine applications require strict ACID compliance to guarantee that bookings and payments are processed reliably without concurrency errors or state duplication. PostgreSQL provides transactional safety, support for complex relational mapping, high-performance indexing, and native support for Decimal data types (essential for payment processing).
* **Tradeoffs**: Scaling PostgreSQL horizontally (reads/writes) is more complex than scaling NoSQL databases (like MongoDB). We address this by using Redis for read-caching and pgBouncer for connection pooling.

---

## ADR 04: Prisma ORM (Object-Relational Mapping)
* **Context**: Accessing database entities inside the Node.js application code.
* **Decision**: We chose **Prisma ORM**.
* **Rationale**: Prisma automatically generates fully-typed database client interfaces based on `prisma/schema.prisma`. It eliminates raw SQL mapping overhead, supports clean relational joins, and handles migration generation safely.
* **Tradeoffs**: Prisma has some performance overhead compared to raw SQL query builders (like Knex) because of its Rust-based query engine. We address query latency using indexing and projection select objects.

---

## ADR 05: Redis Cache & Session Store
* **Context**: Caching high-read query results and session storage.
* **Decision**: We integrated **Redis**.
* **Rationale**: Offloading database query paths (like doctor profiles, availability slots, and access token validation states) to in-memory Redis keys reduces database load and lowers latency.
* **Tradeoffs**: Adds architectural complexity and cost to local and production deployments. Mitigated by containerizing Redis using Docker and using cloud-hosted instances (like Render Redis or Upstash).

---

## ADR 06: Docker Containerization
* **Context**: Packaging and deploying the application.
* **Decision**: Packaging using **Docker**.
* **Rationale**: Ensures the application runs identically across development, staging, and production environments. Docker isolates dependencies and facilitates rapid, automated deployments.
* **Tradeoffs**: Increases initial learning curve and local resource utilization (CPU/Memory).

---

## ADR 07: JWT Session Authentication
* **Context**: Securing client-server communication.
* **Decision**: We implemented **JSON Web Tokens (JWT)** with **Refresh Token Rotation (RTR)**.
* **Rationale**: JWTs enable stateless authentication, eliminating the need to query the database on every single API request. Adding RTR guarantees session validation security and immediate session termination in case of theft detection.
* **Tradeoffs**: JWTs cannot be easily revoked before their expiration time without creating blacklists. We address this by using short access token lifespans (15 mins) and storing refresh token status inside the database.

---

## ADR 08: REST Architecture over GraphQL
* **Context**: Choosing the communication protocol between clients and servers.
* **Decision**: We selected a **REST API** architecture.
* **Rationale**: REST APIs are simpler to implement, cache (at HTTP/CDN levels), rate limit, and document (via OpenAPI/Swagger). The client query patterns for this platform are well-defined, reducing the need for the query flexibility of GraphQL.
* **Tradeoffs**: Clients may over-fetch data occasionally. We mitigate this by using specific field projections in Prisma query arguments.

---

## ADR 09: Zod Schema Validation
* **Context**: Request payload sanitization and validation.
* **Decision**: We chose **Zod**.
* **Rationale**: Zod provides runtime schema validation while automatically exporting TypeScript types. It sanitizes inputs by stripping unrecognized fields, protecting the system from prototype pollution.
* **Tradeoffs**: Validation logic runs on the main thread, adding a minor processing cost.

---

## ADR 10: Winston Structured Logging
* **Context**: Application logging.
* **Decision**: We integrated **Winston**.
* **Rationale**: Standard `console.log` statements are synchronous and block the main thread. Winston logs asynchronously and outputs structured JSON, making log ingestion and search indexing in cloud SIEM systems clean and straightforward.
* **Tradeoffs**: Slightly more configuration boilerplate.

---

## ADR 11: Modular Directory Architecture
* **Context**: Project source code organization.
* **Decision**: We implemented **Modular Domain-driven organization** (e.g. `src/modules/auth`).
* **Rationale**: Organizing files by business domain (Controller, Service, Repository, Routes all in one folder) groups related files together. This facilitates maintenance and makes it easy to split domains into microservices in the future.
* **Tradeoffs**: Differs from standard Model-View-Controller layouts where all controllers are in a single directory. The separation of concerns makes this organization cleaner for large projects.
