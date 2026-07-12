# API Documentation Reference

This document provides request/response contracts, authorization parameters, and payload schemas for the Amrutam Pharmaceuticals Telemedicine API.

---

## 1. Response Formats

All API responses return a structured JSON body.

### A. Success Format
All successful operations return a standard status alongside the payload:
```json
{
  "status": "success",
  "data": { ... }
}
```

### B. Error Format
Failed requests (including validation errors and runtime exceptions) return a unified schema:
```json
{
  "status": "error",
  "message": "Detailed error message describing the failure",
  "requestId": "d22b1bcd-b6b8-4f95-9499-95c9586b5308",
  "details": { ... }
}
```
- `requestId`: Trace ID that can be used to search server logs.
- `details`: Zod validation failure matrices or specific database codes.

---

## 2. API Endpoints

### A. Authentication & Onboarding

#### 1. User Registration
* **Endpoint**: `POST /api/auth/register`
* **Description**: Registers a new Patient or Doctor profile.
* **Payload Schema (Zod Checked)**:
  ```json
  {
    "email": "john@example.com",
    "password": "Password123!",
    "role": "PATIENT",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+919876543210",
    "gender": "MALE",
    "dateOfBirth": "1995-10-15"
  }
  ```
  *For Doctors, `specialization`, `experience` (int), and `consultationFee` (decimal) must also be passed.*
* **Response (201 Created)**:
  ```json
  {
    "status": "success",
    "data": {
      "id": "e4b4458f-2878-4339-a5e2-e1d5a7ad86b5",
      "email": "john@example.com",
      "role": "PATIENT",
      "profile": {
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  }
  ```

#### 2. User Login
* **Endpoint**: `POST /api/auth/login`
* **Description**: Verifies credentials and issues a JWT token pair.
* **Payload**:
  ```json
  {
    "email": "john@example.com",
    "password": "Password123!"
  }
  ```
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": {
      "user": {
        "id": "e4b4458f-2878-4339-a5e2-e1d5a7ad86b5",
        "email": "john@example.com",
        "role": "PATIENT"
      },
      "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30...",
      "refreshToken": "7c1c7ba7-ed09-4d69-bbc3-954975514441"
    }
  }
  ```
  *Note: The Refresh Token is also returned in an HTTP-only secure cookie named `refreshToken`.*

#### 3. Token Rotation
* **Endpoint**: `POST /api/auth/refresh`
* **Description**: Rotates refresh and access tokens. Prevents token theft.
* **Payload**:
  ```json
  {
    "refreshToken": "7c1c7ba7-ed09-4d69-bbc3-954975514441"
  }
  ```
* **Response (200 OK)**:
  Same structure as login payload (new tokens).

---

### B. Appointments & Bookings (Design Specification)

#### 1. Retrieve Available Doctors
* **Endpoint**: `GET /api/doctors`
* **Headers**: `Authorization: Bearer <accessToken>`
* **Query Parameters**:
  - `specialty` (optional): Filter by medical specialty (e.g., `Ayurveda`).
  - `limit` (optional): Pagination limit (default 10).
* **Response (200 OK)**:
  ```json
  {
    "status": "success",
    "data": [
      {
        "id": "doctor-uuid",
        "specialization": "Ayurveda",
        "consultationFee": "500.00",
        "user": { "profile": { "firstName": "Aarav", "lastName": "Sharma" } }
      }
    ]
  }
  ```

#### 2. Create Appointment Booking
* **Endpoint**: `POST /api/bookings`
* **Headers**: 
  - `Authorization: Bearer <accessToken>`
  - `Idempotency-Key: <unique-uuid>` (Required for retry safety)
* **Payload**:
  ```json
  {
    "doctorId": "doctor-uuid",
    "slotId": "slot-uuid"
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "status": "success",
    "data": {
      "bookingId": "booking-uuid",
      "status": "PENDING",
      "amount": "500.00",
      "slot": { "startTime": "2026-07-15T10:00:00Z" }
    }
  }
  ```

---

### C. Consultations & Prescriptions (Design Specification)

#### 1. Generate Prescription
* **Endpoint**: `POST /api/consultations/:id/prescription`
* **Headers**: `Authorization: Bearer <doctorAccessToken>`
* **Payload**:
  ```json
  {
    "doctorNotes": "Take rest for 2 days. Drink warm water.",
    "items": [
      {
        "medicineName": "Amrutam Ashwagandha",
        "dosage": "500mg",
        "frequency": "Once daily",
        "duration": "1 month"
      }
    ]
  }
  ```
* **Response (201 Created)**:
  ```json
  {
    "status": "success",
    "data": {
      "prescriptionId": "prescription-uuid",
      "consultationId": "consultation-uuid",
      "createdAt": "2026-07-12T10:00:00Z"
    }
  }
  ```

---

## 3. HTTP Status Codes

The API maps operations to standard HTTP status codes:

| Code | Label | Usage |
| :--- | :--- | :--- |
| **200** | OK | Query requests or update actions completed successfully. |
| **201** | Created | Resource (user profile, booking, prescription) created. |
| **400** | Bad Request | Syntactically incorrect request or parameter mismatch. |
| **401** | Unauthorized | Bearer token missing, expired, or invalid. |
| **403** | Forbidden | User does not have the required role (RBAC blocks). |
| **404** | Not Found | Resource not found in the database. |
| **409** | Conflict | Optimistic lock failure or unique email validation violation. |
| **422** | Unprocessable Entity | Payload validation check failed (Zod validation matrix). |
| **500** | Internal Error | Runtime engine crash or database availability outage. |

---

## 4. Swagger Documentation Screenshot Placeholder

Interactive developer sandbox is available at:
`http://localhost:3000/api/docs`

![Swagger UI Placeholder](https://raw.githubusercontent.com/swagger-api/swagger-ui/master/flavicon.png)
*(Run the application locally and browse the endpoint definitions inside the Swagger Interactive UI Sandbox)*
