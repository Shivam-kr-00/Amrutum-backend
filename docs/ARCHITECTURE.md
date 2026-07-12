# High-Level Architecture Documentation

This document describes the architectural layout, components, data flows, and workflow patterns for the Amrutam Pharmaceuticals Telemedicine Platform.

---

## 1. High-Level System Architecture

The platform is designed around a clean three-tier architecture (Client-API-Data), which separates concerns and enables separate scalability across the application stack.

```mermaid
graph TD
    %% Clients
    BrowserClient["Web Browser Client"]
    MobileClient["Mobile Client (iOS/Android)"]
    
    %% Gateway/API Entry
    LoadBalancer["Application Load Balancer / Nginx"]
    
    %% API Services
    subgraph Express_App["API Service Layer (Node.js/Express)"]
        API_App["Express Application Instance"]
        Middlewares["Middlewares (Helmet, CORS, Rate Limit)"]
        AuthMiddleware["Auth Middleware (JWT Verify)"]
        Routes["Router Layer"]
        Controllers["Controllers (HTTP/JSON Serialization)"]
        Services["Services (Business Logic Layer)"]
        Repositories["Repositories (Prisma DB Gateway)"]
    end
    
    %% Caching and Logging
    Redis["Redis Caching & Session Storage"]
    Winston["Winston Logger System"]
    
    %% Primary Storage
    PostgreSQL["PostgreSQL Primary Database"]
    
    %% Connections
    BrowserClient --> LoadBalancer
    MobileClient --> LoadBalancer
    LoadBalancer --> API_App
    
    API_App --> Middlewares
    Middlewares --> AuthMiddleware
    AuthMiddleware --> Routes
    Routes --> Controllers
    Controllers --> Services
    Services --> Repositories
    
    %% External dependencies
    Services -.-> Redis
    Repositories --> PostgreSQL
    API_App -.-> Winston
```

---

## 2. Component Responsibilities

The system adopts a modular clean architecture where each folder layer has strict boundaries and single responsibility:

| Layer | Responsibility | Details |
| :--- | :--- | :--- |
| **Server/App** (`server.ts`, `app.ts`) | Initialization & Server Boot | Mounts global middleware, handles DB/Redis connections, handles OS signals for graceful shutdown, and opens HTTP ports. |
| **Middlewares** (`src/middlewares/`) | Request preprocessing and filters | Standardizes security modifications (Helmet/CORS), checks throttling policies (Rate Limiter), assigns correlation metadata, and intercept errors. |
| **Validators** (`src/validators/`) | Request Schema validation | Validates raw payload shapes (body, query, params) using `Zod` schemas before letting requests hit the controller layer. |
| **Controllers** (`src/modules/*/auth.controller.ts`) | Payload Serialization | Parses validated HTTP request bodies, interacts with service classes, and serializes JS objects to outgoing JSON responses. |
| **Services** (`src/modules/*/auth.service.ts`) | Core Business Logic | Orchestrates domain validation, triggers audit logs, handles token generation mechanics, and manages transaction boundaries. |
| **Repositories** (`src/modules/*/auth.repository.ts`) | Data Gateway (ORM isolation) | Performs queries/mutations to PostgreSQL via the Prisma Client. Isolates business rules from raw database queries. |
| **Prisma Engine** (`prisma/schema.prisma`) | Data persistence layer | Orchestrates physical schema updates, constraints, and models. |

---

## 3. Data Flow & Request Lifecycle

Every HTTP request sent to the API follows a deterministic structural journey:

```text
[HTTP Request] 
      │
      ▼
1. Security & Rate-Limit Middlewares (Helmet / CORS / express-rate-limit)
      │
      ▼
2. Correlation ID Middleware (Generates x-request-id & x-correlation-id)
      │
      ▼
3. JWT Authentication Middleware (Checks Bearer token & blacklist/revocation)
      │
      ▼
4. Validation Middleware (Runs input schemas via Zod)
      │
      ▼
5. Controller Layer (Maps request parameters, forwards to Service)
      │
      ▼
6. Service Layer (Executes transactional business logic, updates state)
      │
      ▼
7. Repository Layer (Executes SQL query via Prisma Client)
      │
      ▼
8. Database (State updated / fetched)
      │
      ▼
[HTTP Response Serialized as JSON]
```

---

## 4. Primary Workflows

### A. Authentication & Session Flow

The platform utilizes a secure JWT-based authentication system with Refresh Token Rotation. This allows patients and doctors to maintain sessions safely without sending passwords repeatedly.

```mermaid
sequenceDiagram
    autonumber
    actor User as Patient/Doctor Client
    participant API as Express API
    participant DB as PostgreSQL Database
    participant Cache as Redis Cache

    User->>API: POST /api/auth/login (email, password)
    API->>DB: Query User & Profile by email
    DB-->>API: User details + Password Hash
    API->>API: Verify Password using bcrypt
    API->>API: Generate Access Token (15m) & Refresh Token (7d)
    API->>DB: Save new Refresh Token in Database
    API-->>User: Return Tokens (Access in JSON, Refresh in HTTP-Only Cookie)

    Note over User, API: Accessing Protected Endpoints
    User->>API: GET /api/auth/me (Bearer Access Token)
    API->>API: Decode and verify JWT signature
    API->>Cache: Check user cache / active sessions
    API-->>User: Return 200 OK + User Context
```

---

### B. Booking & Availability Workflow

The telemedicine application implements a multi-step booking sequence that guarantees safety against race conditions (double booking) using **Optimistic Locking** on availability slots.

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant API as Express API
    participant DB as PostgreSQL Database

    Patient->>API: GET /api/doctors?specialty=Ayurveda (Find slots)
    API->>DB: Query doctors + availability slots where isBooked = false
    DB-->>API: List of available slots
    API-->>Patient: Display slots

    Patient->>API: POST /api/bookings (slotId, doctorId)
    API->>DB: Start database transaction
    API->>DB: Fetch slot by slotId & verify isBooked = false (reads slot version)
    
    alt Slot is already booked
        API-->>Patient: 409 Conflict: Slot is already taken
    else Slot is free
        API->>DB: Update slot isBooked = true where version = currentVersion
        alt Version changed (Concurrent booking won)
            DB-->>API: 0 rows updated
            API-->>Patient: 409 Conflict: Slot changed, please retry
        else Successfully updated
            API->>DB: Create Booking record (Status: PENDING)
            API->>DB: Create Payment record (Status: PENDING)
            DB-->>API: Commit Transaction
            API-->>Patient: Return Booking confirmation & payment details
        end
    end
```

---

## 5. Entity-Relationship Diagram (ERD)

The database schema, implemented in PostgreSQL via Prisma, supports full referential integrity and is diagrammed below:

```mermaid
erDiagram
    users ||--o| profiles : "has one"
    users ||--o| doctors : "has one"
    users ||--o{ refresh_tokens : "has many"
    users ||--o{ audit_logs : "creates"
    
    profiles ||--o{ bookings : "creates"
    
    doctors ||--o{ availability_slots : "manages"
    doctors ||--o{ bookings : "has"
    
    availability_slots ||--o| bookings : "associates"
    
    bookings ||--o| consultations : "initiates"
    bookings ||--o| payments : "has one"
    
    consultations ||--o| prescriptions : "receives"
    
    prescriptions ||--|{ prescription_items : "contains"

    users {
        string id PK
        string email UK
        string passwordHash
        enum role
        datetime createdAt
        datetime updatedAt
    }

    profiles {
        string id PK
        string userId FK
        string firstName
        string lastName
        string phone
        string gender
        datetime dateOfBirth
        datetime createdAt
    }

    doctors {
        string id PK
        string userId FK
        string specialization
        int experience
        decimal consultationFee
        enum status
        string bio
        datetime createdAt
    }

    availability_slots {
        string id PK
        string doctorId FK
        datetime date
        datetime startTime
        datetime endTime
        boolean isBooked
        int version
        datetime createdAt
    }

    bookings {
        string id PK
        string patientId FK
        string doctorId FK
        string slotId FK
        enum status
        string idempotencyKey UK
        datetime createdAt
    }

    consultations {
        string id PK
        string bookingId FK
        enum status
        datetime startedAt
        datetime completedAt
        datetime createdAt
    }

    prescriptions {
        string id PK
        string consultationId FK
        string doctorNotes
        string patientNotes
        datetime createdAt
    }

    prescription_items {
        string id PK
        string prescriptionId FK
        string medicineName
        string dosage
        string frequency
        string duration
        datetime createdAt
    }

    payments {
        string id PK
        string bookingId FK
        decimal amount
        enum status
        string transactionId UK
        string provider
        json rawResponse
        datetime createdAt
    }

    refresh_tokens {
        string id PK
        string userId FK
        string token UK
        datetime expiresAt
        datetime revokedAt
        string replacedByToken
        datetime createdAt
    }

    audit_logs {
        string id PK
        string userId FK
        string action
        string targetTable
        string recordId
        json oldValue
        json newValue
        string ipAddress
        string userAgent
        datetime createdAt
    }
```

---

## 6. Architectural Tradeoffs & Design Decisions

### Monolithic Modular Design vs Microservices
* **Decision**: We opted for a modular monolithic directory structure.
* **Why**: The project scale does not warrant the overhead, complex networking, and operational costs of microservices. By enforcing strict boundaries (e.g. `src/modules/auth`), we can transition specific domains into separate services in the future if they develop distinct scaling profiles.
* **Tradeoff**: While code resides in one repository, deployment scaling is performed horizontally as a single unit rather than isolated components.

### ORM vs Raw SQL
* **Decision**: Use **Prisma ORM** for database interaction.
* **Why**: Provides strict compile-time TypeScript type safety for database models, fast migrations, and high developer efficiency.
* **Tradeoff**: Prisma is historically known for higher engine overhead and query-generation complexities compared to raw SQL queries or lightweight query builders (like Knex). We mitigate this by using connection poolers (pgBouncer) and adding manual indexing on query-intensive columns (like `doctorId`, `patientId`, `token`).
