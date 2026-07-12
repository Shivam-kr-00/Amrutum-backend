# Security Architecture & Controls

This document details the security configurations, coding practices, and architectural mitigations implemented in the Amrutam Pharmaceuticals Telemedicine Platform to protect patient data and maintain HIPAA/regulatory compliance.

---

## 1. Authentication & Session Security

### A. JWT Authentication
- The platform uses **JSON Web Tokens (JWT)** for session state transmission.
- Access tokens are short-lived (**15 minutes**) to minimize exposure window if a token is leaked.
- Access tokens are cryptographically signed using **HMAC SHA-256** using the `JWT_ACCESS_SECRET`.

### B. Refresh Token Rotation (RTR) & Theft Detection
To prevent persistent session hijacking:
- Every login generates a new `accessToken` and a unique `refreshToken`.
- Refresh tokens are stored in the database with their metadata (`expiresAt`, `revokedAt`, `replacedByToken`).
- **Rotation Mechanics**: When requesting a new access token, the client must submit the current `refreshToken`. The API revokes this old refresh token, marks it as replaced, and issues a brand-new token pair.
- **Theft / Reuse Detection**: If a revoked refresh token is submitted again, the system detects a breach (meaning a malicious actor has hijacked a previously used token). 
  - **Action**: The API instantly revokes *all active refresh tokens* linked to that user, forcing all active sessions to log out immediately. An audit log event is fired for high-priority security monitoring.

```text
               ┌───────────────────────────────┐
               │    Client requests rotation    │
               │   with Refresh Token (R1)     │
               └───────────────┬───────────────┘
                               │
                Is R1 already revoked?
               ┌───────────────┴───────────────┐
        [Yes] ──┤                               ├─► [No]
         │     └───────────────────────────────┘     │
         ▼                                           ▼
[Possible Theft!]                           [Normal Rotation]
- Revoke ALL user tokens                    - Revoke R1 (link to R2)
- Force Logout                              - Issue R2 + Access Token
- Log Security Audit
```

---

## 2. Authorization (RBAC)

- Access control is enforced using **Role-Based Access Control (RBAC)**.
- Roles are structured inside the database as an Enum: `PATIENT`, `DOCTOR`, `ADMIN`.
- The `requireRoles(...allowedRoles)` middleware secures routes at the router declaration level:
  ```typescript
  router.get('/admin/logs', authenticate, requireRoles(Role.ADMIN), getAuditLogs);
  ```

---

## 3. Cryptography & Hashing

- **Password Hashing**: User passwords are encrypted using **bcryptjs** with **12 salt rounds**. 
- Bcrypt applies a CPU-intensive key derivation algorithm that naturally mitigates brute-force attacks by slowing down hashing attempts.
- **Secret Management**: Application keys (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) are never hardcoded. They are loaded dynamically from server environment variables or injected via secure vault integrations (e.g. AWS Secrets Manager).

---

## 4. Middleware & HTTP Protections

* **Helmet**: Integrates standard HTTP headers using [helmet.js](https://helmetjs.github.io/) to secure requests:
  - Disables `X-Powered-By` header to hide server signatures.
  - Enforces `Strict-Transport-Security` (HSTS) to require HTTPS connections.
  - Implements `X-Content-Type-Options: nosniff` to prevent MIME-type sniffing.
* **CORS**: Configured with strict origin checks to prevent unauthorized cross-origin requests:
  ```typescript
  cors({
    origin: config.NODE_ENV === 'production' ? ['https://amrutam.co.in'] : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })
  ```
* **Rate Limiting**: Throttles incoming client request bursts using `express-rate-limit`:
  - **Global Limiter**: 100 requests per 15 minutes per IP address.
  - **Auth Limiter**: 15 registration or login attempts per 15 minutes per IP address (mitigates dictionary attacks).

---

## 5. Input Validation & Injection Prevention

* **Strict Schema Validation**: All incoming requests are validated against strict schemas using **Zod**. Input parsing strips away unrecognized properties before they reach execution contexts, preventing prototype pollution and parameter injection.
* **SQL Injection (SQLi) Prevention**: Prisma ORM executes parameterized queries under the hood. All queries automatically escape parameters, making SQL injection impossible even if users provide malicious input.
* **XSS Mitigation**: Express JSON body parsers are configured strictly. Output data containing user text is properly serialized, and front-end rendering engines escape expressions before writing to the DOM.
* **CSRF Mitigation**: Since the API is predominantly designed for stateless mobile and Web clients passing Bearer Authorization headers, standard CSRF exploits are mitigated because browsers do not attach Bearer headers automatically (unlike standard cookie attachments). For refresh cookies, cookies utilize `SameSite: Strict` and `Secure: true`.

---

## 6. Audit Logging

A dedicated transactional database logging pattern is implemented for compliance audits:
- Every registration, login, token rotation anomaly, or modification is recorded in the `audit_logs` table.
- Logs capture row-level changes (recording the JSON state before and after the modification), client IP address, and client User-Agent.
- Audit records utilize database foreign keys but set `onDelete: SetNull` for `userId` to preserve the audit trail if a user is deleted.
