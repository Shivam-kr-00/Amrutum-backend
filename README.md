# Amrutam Pharmaceuticals Telemedicine Backend

Production-ready backend API service for the Amrutam Pharmaceuticals Telemedicine Platform. Designed to handle doctor consultations, patient onboarding, booking scheduling, prescription generation, audit logging, and payment processing under highly scalable, secure, and observable environments.

---

## Features

- **Robust Authentication & Security**: JWT Access & Refresh token rotation with token-theft reuse detection. Secure cookie options and strict payload validations with Zod.
- **Role-Based Access Control (RBAC)**: Fine-grained permissions matching roles like `PATIENT`, `DOCTOR`, and `ADMIN`.
- **Doctor Consultation Booking**: Manage doctor specialties, availability slots, and patient booking flow with optimistic locking to prevent double bookings.
- **Audit Logging**: Comprehensive internal auditing system capturing row-level changes (Old Value vs New Value), IP addresses, and user agents for audit compliance.
- **Payment Processing**: Integrated structures for capturing transactions, recording states (paid, failed, refunded), and verifying payments.
- **Production Observability**: Structured JSON logging using Winston, request correlation tracking, custom liveness, readiness, and health checks.
- **Docker Ready**: Standard multi-stage build setup with standalone production runner stages.

---

## Tech Stack

* **Runtime**: [Node.js (v22+)](https://nodejs.org/)
* **Language**: [TypeScript (v5+)](https://www.typescriptlang.org/)
* **Web Framework**: [Express (v5+)](https://expressjs.com/)
* **ORM**: [Prisma](https://www.prisma.io/)
* **Database**: [PostgreSQL (v15+)](https://www.postgresql.org/)
* **Caching & Queueing**: [Redis](https://redis.io/)
* **Validation**: [Zod](https://zod.dev/)
* **Logging**: [Winston](https://github.com/winstonjs/winston)
* **Testing**: [Jest](https://jestjs.io/) & [ts-jest](https://kulshekhar.github.io/ts-jest/)
* **Documentation**: [Swagger UI / OpenAPI 3.0](https://swagger.io/)

---

## Folder Structure

```text
├── .gemini/                 # Internal IDE configs
├── dist/                    # Compiled JavaScript files (build target)
├── docs/                    # Professional documentation resources
│   ├── ARCHITECTURE.md      # High-level architecture, flow, & ERDs
│   ├── SCALABILITY.md       # High throughput scaling strategies
│   ├── SECURITY.md          # Security systems, policies, & compliance
│   ├── THREAT_MODEL.md      # Security threat matrices & STRIDE audits
│   ├── OBSERVABILITY.md     # Logging format, metrics, & tracing checks
│   ├── API.md               # API signature and contract references
│   ├── DEPLOYMENT.md        # Operations & hosting runbooks
│   └── DECISIONS.md         # Architectural Decision Records (ADRs)
├── prisma/                  # Prisma schema and migration scripts
│   ├── migrations/          # SQL database migrations
│   └── schema.prisma        # Prisma Data Model definition
├── src/                     # Application source code
│   ├── config/              # Central configurations & loaders
│   ├── docs/                # Swagger specification configs
│   ├── middlewares/         # Express request/error pipeline modifiers
│   ├── modules/             # Business modules (Clean Architecture layout)
│   │   └── auth/            # Auth Controller, Service, Repository, Routes
│   ├── utils/               # Common helper utilities (Logger, Errors)
│   ├── validators/          # Zod request validation schemas
│   ├── app.ts               # App startup config and middleware setup
│   └── server.ts            # Entrypoint file for listening on ports
├── tests/                   # Jest unit and integration tests
├── Dockerfile               # Production Docker configuration
├── docker-compose.yml       # Dev/Prod self-contained compose configurations
└── package.json             # NPM dependencies and project scripts
```

---

## Prerequisites

Ensure you have the following installed on your machine:
- Node.js (v22.0.0 or higher)
- NPM (v10.0.0 or higher)
- PostgreSQL (v15 or higher)
- Redis Server (v7 or higher)
- Docker & Docker Compose (optional, for containerized run)

---

## Environment Variables

Copy the example environment file and configure the settings:
```bash
cp .env.example .env
```

| Variable | Description | Example |
| :--- | :--- | :--- |
| `PORT` | Local service port | `3000` |
| `NODE_ENV` | Application environment status | `development` / `production` |
| `DATABASE_URL` | Prisma PostgreSQL database URI | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret key for access token signing | Use a long random cryptokey (min 32 chars) |
| `JWT_REFRESH_SECRET`| Secret key for refresh token signing| Use a long random cryptokey (min 32 chars) |
| `JWT_ACCESS_EXPIRY` | Access token lifespan | `15m` |
| `JWT_REFRESH_EXPIRY`| Refresh token lifespan | `7d` |
| `BCRYPT_SALT_ROUNDS`| Hashing workload coefficient | `12` |

---

## Local Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Setup Database Schema (Prisma)**:
   Ensure your local PostgreSQL database is running, then execute:
   ```bash
   # Run migrations and sync schema
   npx prisma migrate dev
   ```
3. **Run Development Server**:
   ```bash
   npm run dev
   ```
   The backend will be running at `http://localhost:3000`.

---

## Docker Setup

To run a fully isolated, self-contained development stack (including PostgreSQL and Redis containers):

1. **Build and Run Containers**:
   ```bash
   docker compose up --build
   ```
2. **Verify Containers are Healthy**:
   The containers will verify health checks automatically before booting downstream layers:
   - PostgreSQL runs: `pg_isready`
   - Redis runs: `redis-cli ping`
   - API boots on: `http://localhost:3000`

---

## Database Migration

When updating the data model inside `prisma/schema.prisma`:
```bash
# Create and apply a new migration
npx prisma migrate dev --name <migration-name>

# Apply pending migrations to production/staging
npx prisma migrate deploy
```

---

## Running Tests

The test suite runs against the codebase using [Jest](https://jestjs.io/) and [ts-jest](https://kulshekhar.github.io/ts-jest/):

```bash
# Run all tests
npm test

# Run tests with coverage reports
npm run test:coverage
```

---

## Swagger Documentation

The interactive OpenAPI/Swagger documentation compiles dynamically from JSDoc comments inside the route files:
- **Swagger UI URL**: `http://localhost:3000/api/docs`

---

## API Endpoints Summary

### Authentication APIs
* `POST /api/auth/register` - Create patient/doctor profiles.
* `POST /api/auth/login` - Validate credentials, return tokens.
* `POST /api/auth/refresh` - Rotate JWT access and refresh tokens.
* `GET /api/auth/me` - Retrieve authenticated user context.

Refer to [API.md](file:///c:/Users/shiva/OneDrive/Desktop/Amrutam%20Pharmaceuticals/docs/API.md) for full parameters and JSON payload schemas.

---

## CI/CD Overview

The platform uses a GitHub Actions workflow to automate quality control:
- **Build Step**: Ensures TS compilation completes without errors (`npm run build`).
- **Linter & Type checks**: Runs validation checks (`npx tsc --noEmit`).
- **Tests**: Runs the entire test suite on check-in.
- **Docker Validation**: Builds target runner stages to verify Docker configuration matches deployment variables.

---

## Deployment Instructions

For general deployments (e.g. Render, AWS, Heroku):
1. Configure env variables on host environment.
2. Run database migration deployment step: `npx prisma migrate deploy`.
3. Start the build task: `npm run build` followed by `npm start`.

Detailed instructions are available in [DEPLOYMENT.md](file:///c:/Users/shiva/OneDrive/Desktop/Amrutam%20Pharmaceuticals/docs/DEPLOYMENT.md).

---

## Assumptions

- **Timezone**: All booking slot times are handled in UTC timezone format.
- **Database Engine**: Relies on PostgreSQL features (e.g., Decimal type fields) that are not present in simpler SQLite targets.
- **Redis Security**: Development configuration assumes standard non-TLS connection fallback, while production setups require secure URLs.

---

## Future Improvements

1. **Multifactor Authentication (MFA)**: Integrate time-based OTP workflows for enhanced account security.
2. **WebSocket Integration**: Establish real-time consultation state updates (e.g. consultation started/completed).
3. **Advanced Audit Retention**: Offload log records periodically to secure storage objects (e.g. AWS S3) for long-term archiving.
