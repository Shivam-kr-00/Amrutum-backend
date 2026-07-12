# Production Deployment & Operations Guide

This document describes the building, containerization, orchestration, continuous integration, hosting, and disaster recovery strategies for the Amrutam Pharmaceuticals Telemedicine Platform.

---

## 1. Containerization (Docker)

### A. Multi-Stage Dockerfile
The system utilizes a multi-stage Docker build process (configured in [Dockerfile](file:///c:/Users/shiva/OneDrive/Desktop/Amrutam%20Pharmaceuticals/Dockerfile)) that segregates compiler utilities from runtime dependencies:

1. **Builder Stage**: Builds source TS files into JS inside a transient, isolated build container. Generates the Prisma JS client code.
2. **Runner Stage**: Uses a clean, stripped `node:22-alpine` footprint, copying only the compiled JS bundle (`dist/`), schema migrations (`prisma/`), and production dependencies (`node_modules/`).
- **Benefit**: Keeps image sizes small (<200MB) for fast container pull times, reduces attack surfaces by eliminating build-time dependencies, and avoids bundling development tooling.

### B. Execution Command
To build and run the image standalone:
```bash
# Build image
docker build -t amrutam-api:latest .

# Run image
docker run -p 3000:3000 --env-file .env amrutam-api:latest
```

---

## 2. Orchestration (Docker Compose)

For running self-contained environments locally or on a VPS:
- [docker-compose.yml](file:///c:/Users/shiva/OneDrive/Desktop/Amrutam%20Pharmaceuticals/docker-compose.yml) orchestrates three distinct services:
  1. `api`: Node.js Express server.
  2. `db`: PostgreSQL database container (persisting data to `pgdata` volume).
  3. `redis`: Redis cache/queue storage container (persisting data to `redisdata` volume).
- **Service Dependency & Health checks**: The API service relies on health checks (`condition: service_healthy`) to guarantee Postgres and Redis are fully ready before starting the API process, preventing startup failures.

```bash
# Deploy stack
docker compose up -d

# View service logs
docker compose logs -f api
```

---

## 3. Render Cloud Deployment

Render is a modern cloud platform suitable for hosting Node.js web applications, PostgreSQL databases, and Redis clusters.

### A. PostgreSQL Instance Setup
1. Create a new **PostgreSQL Database** on Render.
2. Choose your tier (e.g. Free or Starter).
3. Retrieve the **Internal Database URL** (e.g. `postgresql://user:password@dpg-xxxxxx:5432/db`) for connection inside the private Render network.

### B. Redis Instance Setup
1. Create a new **Redis** instance on Render.
2. Copy the **Internal Redis Connection URL** (e.g. `redis://red-xxxxxx:6379`).

### C. Web Service Setup
1. Create a new **Web Service** on Render.
2. Connect your Git repository.
3. Configure build parameters:
   - **Environment**: `Node`
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npx prisma migrate deploy && node dist/server.js`
4. Configure Environment Variables:
   - `DATABASE_URL`: *Insert Render Postgres connection URL*
   - `REDIS_URL`: *Insert Render Redis connection URL*
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`: *Insert secure secrets*
   - `NODE_ENV`: `production`

---

## 4. CI/CD Deployment Pipeline

The platform utilizes a **GitHub Actions** workflow script for automated verification on every branch check-in:

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Type Checking
        run: npx tsc --noEmit

      - name: Run Tests
        run: npm test

      - name: Build Code
        run: npm run build
```

---

## 5. Operations & Disaster Recovery

### A. Database Backups
- **Frequency**: Automatic daily snapshot backups of PostgreSQL.
- **Utility**: Use standard `pg_dump` to capture snapshots:
  ```bash
  pg_dump -U postgres -d amrutam -F c -b -v -f "/backups/amrutam_$(date +%Y%m%d).backup"
  ```
- **Storage**: Store backups in S3-compatible cloud storage with an automated 30-day lifecycle retention policy.

### B. Rollback Strategy
If a deployment fails in production:
1. **Container Rollback**: Instantly point the load balancer back to the previous stable Docker image tag (e.g. `v1.2.1` instead of `v1.2.2`).
2. **Database Rollback**: If the new release introduced database migrations, evaluate if rollback is required.
   - If backward-compatible (recommended): Leave the database schema as-is.
   - If not backward-compatible: Restore PostgreSQL using the backup snapshot captured right before deployment.

### C. Disaster Recovery (DR) Plan
- **RTO (Recovery Time Objective)**: 1 hour.
- **RPO (Recovery Point Objective)**: 24 hours (based on daily database backup intervals).
- **Process**: In the event of primary datacenter failure, spin up duplicate API, Redis, and Database services in a secondary cloud region, restore the latest PostgreSQL database backup, and update global DNS records (Cloudflare) to point to the new API instances.
