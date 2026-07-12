# Threat Modeling & Security Risk Assessment

This threat model outlines the security assets, potential threat actors, trust boundaries, attack vectors, and specific STRIDE/OWASP mitigations configured for the Amrutam Pharmaceuticals Telemedicine Platform.

---

## 1. System Scope & Assets

We protect the following critical assets:

1. **Patient Protected Health Information (PHI)**: Medical history, consultation records, prescription details (HIPAA regulated).
2. **Personally Identifiable Information (PII)**: Full name, DOB, phone number, gender, physical addresses.
3. **Credentials & Secrets**: Password hashes, JWT secrets, database credentials, third-party payment keys.
4. **Financial Transaction Records**: Payment histories, transaction references.
5. **System Availability**: Ensuring platform uptime for consultation scheduling.

---

## 2. Threat Actors & Boundaries

### Actors
- **External Attacker**: Attempts credential stuffing, API manipulation, database extraction, or denial-of-service.
- **Malicious Patient**: Attempts to access other patients' records or bypass payment checks.
- **Compromised Doctor Account**: Attempts unauthorized prescription modifications.
- **Insider Threat**: System administrator with raw database access attempting data extraction.

### Trust Boundaries
* **Client / Internet Boundary**: Demarcates the unsafe client environment from the API Gateway.
* **API / Database Boundary**: Demarcates the application server from primary databases (PostgreSQL/Redis) inside an isolated private VPC.

---

## 3. STRIDE Analysis

We apply the **STRIDE** methodology to systematically evaluate threats at the API boundary:

| Threat | Risk Profile | Mitigation Implemented |
| :--- | :--- | :--- |
| **S**poofing | Accessing system using another user's identity. | - Strict JWT validation on request headers.<br>- Unique UUID primary keys to prevent numerical enumeration.<br>- Bcrypt hashing to protect credentials. |
| **T**ampering | Unauthorized modification of prescriptions or bookings. | - Use of relational constraints in PostgreSQL (Cascade/Restrict rules).<br>- Input validation using Zod.<br>- Optimistic Locking version checks on availability slots. |
| **R**epudiation | User denies creating a booking or modifying a record. | - Internal `audit_logs` table tracking detailed row-level mutations.<br>- Correlation IDs attached to incoming requests and logged downstream. |
| **I**nformation Disclosure | Leaking patient health records or JWT secrets. | - Short access token lifespan (15m).<br>- Encryption in transit (HTTPS/TLS) and database-level encryption (TDE).<br>- Strip password hashes from active database responses. |
| **D**enial of Service | Exhausting server resources or DB connections. | - Global and route-specific rate-limiting (100 reqs/15m).<br>- pgBouncer transaction pooling to handle connection spikes.<br>- Redis cache layers to offload database reads. |
| **E**levation of Privilege | Patient modifying system roles or editing admin logs. | - Strict Role-Based Access Control (`requireRoles` middleware).<br>- Zod schema stripping to prevent role payload injection. |

---

## 4. OWASP Top 10 (2021) Mitigations

The system directly implements coding patterns to counter the most common web application vulnerabilities:

### A01: Broken Access Control
- **Mitigation**: Standardized middleware (`authenticate`, `requireRoles`) runs on every protected endpoint. Direct Object Reference (IDOR) attacks are mitigated by validating that the authenticated user ID (`req.user.id`) matches the owner of the record being queried or updated.

### A03: Injection
- **Mitigation**: Database interactions run exclusively through **Prisma ORM** which parameterizes and escapes all SQL variables automatically. All REST paths run under schema checks using Zod to sanitize payload inputs.

### A07: Identification and Authentication Failures
- **Mitigation**: 
  - **Refresh Token Rotation (RTR)** instantly invalidates all sessions for a user if a refresh token reuse anomaly is detected.
  - Rate limiting protects authentication paths (`/api/auth/register`, `/api/auth/login`) from brute-force dictionary attacks.

### A09: Security Logging and Monitoring Failures
- **Mitigation**: Structured JSON logging using winston exports comprehensive contextual telemetry (Correlation IDs, error traces, HTTP methods, status codes) to external SIEM/analytics engines.

---

## 5. Security Abuse Cases

### Case 1: Refresh Token Theft
* **Attack**: Attacker intercepts a user's active refresh token and attempts to request a new access token.
* **Mitigation**: The system detects that the token is being reused (because the legitimate client already rotated it). The API instantly revokes *all refresh tokens* associated with the user, forcing both the legitimate client and the attacker to re-authenticate.

### Case 2: Booking Slot Race Condition
* **Attack**: Attacker script attempts to spam concurrency booking requests on the same availability slot.
* **Mitigation**: Database-level **Optimistic Locking** validates the slot `version` during update. Only one transaction succeeds; subsequent write requests fail and roll back safely.

---

## 6. Risk Scoring & Residual Risks

### Risk Matrix

| Vulnerability Threat | Impact | Likelihood | Risk Score | Mitigation Status |
| :--- | :--- | :--- | :--- | :--- |
| **Brute-Force Login Spams** | Medium | High | **Medium-High** | Resolved via route rate limiting (15 requests/15 mins). |
| **JWT Secret Leakage** | Critical | Low | **Medium** | Mitigated by using external secret managers (e.g. AWS Secrets). |
| **SQL Injection** | Critical | Low | **Low** | Resolved via Prisma parameterized queries. |
| **XSS Attacks** | High | Medium | **Medium** | Mitigated by using Helmet headers and input sanitization. |

### Residual Risks
- **Client Compromise**: If the client's host OS is compromised, local storage tokens can still be read. We minimize this by setting short JWT lifespans (15 mins) and enforcing `SameSite: Strict` / `HttpOnly` cookie flags on refresh tokens.
- **Third-Party Gateway Outages**: Relying on external payment processors (e.g., Stripe/Razorpay) introduces network availability risks. We mitigate this using background task retry logic and transactional state reconciliation.
