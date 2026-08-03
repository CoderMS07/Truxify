# ⚡ Go High-Throughput GPS Telemetry Ingestion Microservice

This directory contains the **High-Throughput GPS Telemetry Ingestion Engine** written in **Go (Golang)** for ultra-low latency, concurrent GPS ping processing and real-time geofence calculations.

---

## ⚡ Performance Features

- **Goroutine Concurrency**: Processes up to 100,000 telemetry pings/sec with minimal CPU and memory overhead.
- **Fast Haversine Distance Engine**: Performs sub-millisecond geofence proximity calculations on incoming GPS coordinates.
- **Atomic Operations & Thread-Safe Cache**: Tracks live active drivers and throughput metrics without lock contention using `sync.Map` and atomic counters.

---

## 🔌 REST Endpoints

| Endpoint | Method | Request Body | Description |
| :--- | :--- | :--- | :--- |
| `/api/v1/telemetry/ping` | `POST` | `TelemetryPing` | Ingests a high-frequency driver GPS ping with speed, heading, and fuel telemetry. |
| `/api/v1/telemetry/geofence` | `POST` | `GeofenceCheckRequest` | Verifies whether a driver is within a specified radius (default 500m) of a target lat/lng. |
| `/api/v1/telemetry/health` | `GET` | — | Returns live throughput statistics (`pings_per_second`, `active_drivers`, total count). |

---

## 🔐 Authentication

Ping ingestion is authenticated with a driver JWT (HS256, signed with `JWT_SECRET`). The token must be sent as `Authorization: Bearer <jwt>`, must carry `role: "driver"`, and its `sub` (user id) must match the `driver_id` in the ping payload. Requests without a valid token are rejected with `401`, and a token whose `sub` does not match the claimed `driver_id` is rejected with `403`.

For local development only, set `BYPASS_AUTH=true` (with `NODE_ENV != production`) and send the driver id via the `X-Driver-ID` header.

## ⚙️ Configuration

| Env var | Default | Description |
| :--- | :--- | :--- |
| `TELEMETRY_PORT` | `8085` | HTTP listen port. |
| `JWT_SECRET` | — | HMAC secret used to verify driver tokens. When unset, authenticated requests are rejected (`503`). |
| `TELEMETRY_DRIVER_TTL` | `5m` | How long a driver's cached position stays live without a new ping. |
| `TELEMETRY_MAX_ACTIVE_DRIVERS` | `100000` | Max number of drivers held in the in-memory cache; new drivers are rejected once the cap is reached. |
| `TELEMETRY_MAX_PINGS_PER_SEC` | `10` | Per-driver sliding-window rate limit for ping ingestion. |

---

## 🐳 Docker Deployment

Build and run using Docker:

```bash
# Build image
docker build -t truxify-telemetry-go services/telemetry-ingestion/

# Run container
docker run -p 8085:8085 truxify-telemetry-go
```
