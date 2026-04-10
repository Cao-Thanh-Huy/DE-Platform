# DE Platform — Tài liệu kỹ thuật chi tiết

> **Đọc file này là đủ.** Mọi quyết định kiến trúc, cấu hình, flow dữ liệu, và cách extend platform đều có ở đây.

---

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Stack công nghệ](#2-stack-công-nghệ)
3. [Cấu trúc thư mục](#3-cấu-trúc-thư-mục)
4. [Hướng dẫn khởi động](#4-hướng-dẫn-khởi-động)
   - **4.1 ⭐ [Bootstrap Script `start.sh`](#41--cách-nhanh-nhất--bootstrap-script-startsh) ← Bắt đầu từ đây**
   - 4.2 [Cách thủ công](#42-cách-thủ-công-nếu-cần-kiểm-soát-từng-bước)
5. [Chi tiết từng Service](#5-chi-tiết-từng-service)
   - 5.1 PostgreSQL
   - 5.2 MinIO
   - 5.3 Nessie
   - 5.4 Trino
   - 5.5 HashiCorp Vault
   - 5.6 Dagster
   - 5.7 FastAPI Backend
   - 5.8 Frontend DE Studio
6. [Luồng dữ liệu (Data Flow)](#6-luồng-dữ-liệu-data-flow)
7. [API Reference](#7-api-reference)
8. [Pipeline Studio — Cách tạo Pipeline động](#8-pipeline-studio--cách-tạo-pipeline-động)
9. [Data Model Manager — Quản lý vòng đời Iceberg](#9-data-model-manager--quản-lý-vòng-đời-iceberg)
10. [Catalog Health Center — Giám sát & dọn dẹp Catalog](#10-catalog-health-center--giám-sát--dọn-dẹp-catalog)
11. [Nessie Git — Data Versioning](#11-nessie-git--data-versioning)
12. [Quản lý tài nguyên RAM](#12-quản-lý-tài-nguyên-ram)
13. [Biến môi trường (.env)](#13-biến-môi-trường-env)
14. [Troubleshooting](#14-troubleshooting)
15. [Roadmap mở rộng](#15-roadmap-mở-rộng)

---

## 1. Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│                    DE Studio (localhost:3000)                 │
│              React SPA — quản lý toàn bộ platform           │
└─────────────────────┬──────────────────────────────────────┘
                       │ HTTP (REST API)
┌─────────────────────▼──────────────────────────────────────┐
│               FastAPI Backend (localhost:8000)               │
│  /api/models │ /api/pipelines │ /api/nessie │ /api/query   │
│           /api/storage │ /api/maintenance │ /api/health      │
└──┬──────────┬────────┬────────┬──────────────────┬─────────┘
   │          │        │        │                  │
   ▼          ▼        ▼        ▼                  ▼
Trino       Nessie  MinIO   Dagster            Vault
:8080      :19120   :9000  Webserver:3001      :8200
   │          │        │
   └──────────┴────────┘
         Lakehouse Core
         (Iceberg tables lưu trên MinIO,
          metadata quản lý Nessie catalog)
```

### Nguyên lý hoạt động

| Thành phần | Vai trò |
|-----------|---------|
| **MinIO** | Lưu trữ thực tế — Parquet files của Iceberg tables, raw data. Tương đương S3. |
| **Nessie** | Catalog cho Iceberg (biết table nào ở đâu trên MinIO) + Git versioning cho data (branches, commits, tags). |
| **Trino** | Query engine — nhận SQL, đọc catalog từ Nessie, đọc/ghi Parquet files trên MinIO. |
| **Dagster** | Orchestration engine — chạy pipeline jobs theo schedule hoặc manual trigger. |
| **Vault** | Quản lý secrets (passwords, API keys) tập trung. |
| **FastAPI** | Proxy/API layer cho DE Studio — không expose internal services ra ngoài. |
| **DE Studio** | UI để tạo bảng, pipeline, xem git history, browse storage. |

---

## 2. Stack công nghệ

| Công nghệ | Version | Docker Image |
|-----------|---------|-------------|
| Trino | 480 | `trinodb/trino:480` |
| MinIO | latest | `minio/minio:latest` |
| Nessie | latest | `projectnessie/nessie:latest` |
| PostgreSQL | 15-alpine | `postgres:15-alpine` |
| Dagster | 1.7.4 | `lakehouse-dagster-webserver:latest` |
| Vault | latest | `hashicorp/vault:latest` |
| FastAPI | 0.115 | Build từ `python:3.13-alpine3.21` |
| React | 18.3 | Build từ `node:20-alpine` |
| Nginx | alpine | `nginx:alpine` |

**Định dạng dữ liệu:** Apache Iceberg (v2) trên Parquet files  
**Table format:** PARQUET (default)  
**Catalog type:** Nessie (REST catalog)  
**Storage type:** MinIO S3-compatible  

---

## 3. Cấu trúc thư mục

```
DE-Platform-1/
│
├── start.sh                    ← ⭐ Bootstrap script — chạy 1 lần, dựng toàn bộ platform
├── docker-compose.yml          ← Orchestration chính (đọc đây trước)
├── .env                        ← Biến môi trường (passwords, ports)
├── README.md                   ← File này
│
├── infrastructure/             ← Configs cho dịch vụ hạ tầng
│   ├── trino/
│   │   └── etc/
│   │       ├── config.properties     ← Trino server: port, memory limits
│   │       ├── jvm.config            ← JVM heap: max 1GB
│   │       ├── node.properties       ← Node id, data dir
│   │       └── catalog/
│   │           └── iceberg.properties ← Kết nối Nessie + MinIO
│   ├── minio/
│   │   └── init-buckets.sh     ← Script tạo bucket "warehouse" và "raw-data"
│   └── vault/
│       └── init-vault.sh       ← Script ghi secrets ban đầu vào Vault
│
├── dagster/                    ← Dagster configuration + Python code
│   ├── dagster.yaml            ← Storage, scheduler, run coordinator config
│   ├── workspace.yaml          ← Khai báo load từ module "repository"
│   └── app/
│       ├── repository.py       ← Entry point: load static + dynamic pipelines
│       ├── resources.py        ← Dagster resources: TrinoConnection
│       └── pipeline_factory.py ← Load JSON defs → tạo Dagster jobs + schedules
│
├── backend/                    ← FastAPI Python backend
│   ├── Dockerfile              ← python:3.13-alpine3.21, uvicorn 1 worker
│   ├── requirements.txt        ← fastapi, trino, minio, hvac, httpx, pydantic
│   └── app/
│       ├── main.py             ← FastAPI entry: CORS + mount routers
│       ├── config.py           ← Pydantic settings đọc từ env vars
│       ├── routers/
│       │   ├── models.py       ← CRUD Iceberg tables qua Trino SQL
│       │   ├── pipelines.py    ← CRUD pipeline JSON defs + trigger + runs
│       │   ├── nessie.py       ← Branch/tag/merge/diff qua Nessie REST v2
│       │   ├── query.py        ← Execute SQL trên Trino
│       │   ├── storage.py      ← Browse/upload/delete files trên MinIO
│       │   └── maintenance.py  ← [NEW] Catalog Health: SSE scan, optimize, vacuum, orphan cleanup
│       └── services/
│           ├── trino_service.py    ← trino-python-client wrapper
│           ├── nessie_service.py   ← Nessie REST API v2 async client
│           ├── minio_service.py    ← minio-py SDK wrapper
│           ├── dagster_service.py  ← Dagster GraphQL client
│           └── vault_service.py    ← hvac (Vault KV v2) client
│
└── frontend/                   ← React + Vite DE Studio
    ├── Dockerfile              ← Multi-stage: node build → nginx serve
    ├── nginx.conf              ← SPA routing + proxy /api/ → backend:8000
    ├── package.json            ← react, react-router-dom, lucide-react, vite
    ├── vite.config.js          ← Proxy /api → localhost:8000 (dev mode)
    ├── index.html              ← Entry HTML, font Inter
    └── src/
        ├── main.jsx            ← React entry point
        ├── App.jsx             ← Layout: Sidebar + Routes
        ├── api/
        │   └── client.js       ← Tất cả API calls đến FastAPI
        ├── styles/
        │   └── index.css       ← Design system: dark theme, glassmorphism
        └── pages/
            ├── Dashboard.jsx       ← Tổng quan, stats, service list
            ├── ModelManager.jsx    ← CRUD Iceberg tables: Schema Explorer, 5 Tabs per table
            ├── PipelineStudio.jsx  ← Tạo/chạy/xem logs pipeline (như Glue)
            ├── GitExplorer.jsx     ← Nessie branches, commits, merge, tags
            ├── QueryEditor.jsx     ← SQL editor + execute + export CSV
            ├── StorageBrowser.jsx  ← Duyệt MinIO buckets/folders/files
            └── CatalogHealth.jsx   ← [NEW] Giám sát toàn catalog: orphan files, snapshot stats, cleanup
```

---

## 4. Hướng dẫn khởi động

### 4.1 ⭐ Cách nhanh nhất — Bootstrap Script (`start.sh`)

> Đây là cách **khuyến nghị**. Chỉ cần 1 lệnh duy nhất, script tự làm tất cả.

```bash
cd /home/ubuntu_main/bitex/DE-Platform-1
bash start.sh
```

**Script `start.sh` tự động thực hiện 7 bước:**

| Bước | Công việc |
|------|-----------|
| **1 — Prerequisites** | Kiểm tra Docker, Docker Compose, RAM còn đủ không |
| **2 — Images** | Kiểm tra tất cả Docker images; tự `docker pull` nếu thiếu |
| **3 — Build** | Build FastAPI backend + React frontend thành Docker images |
| **4 — Start** | Khởi động **10 services** đúng thứ tự, chờ từng service healthy |
| **5 — Wait** | Kiểm tra response thực sự từng service (Trino/Nessie/API/UI) |
| **6 — Init Schemas** | Tự tạo schemas `bronze`, `silver`, `gold` trong Iceberg catalog |
| **7 — Health Check** | Báo cáo trạng thái tất cả services + in bảng URLs |

**Output khi hoàn thành:**
```
🚀 DE Platform đã sẵn sàng!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  🖥️  DE Studio (Main UI)     → http://localhost:3000
  📡 FastAPI (Swagger docs)   → http://localhost:8000/docs
  🔍 Trino Query UI           → http://localhost:8080
  💾 MinIO Console            → http://localhost:9001
  🌿 Nessie REST API          → http://localhost:19120/api/v2
  📊 Dagster Pipelines        → http://localhost:3001
  🔐 Vault Secrets            → http://localhost:8200
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Các trường hợp đặc biệt:**

```bash
# Chạy lại script nếu có service lỗi (idempotent — an toàn khi chạy nhiều lần)
bash start.sh

# Xem logs chi tiết khi script chạy
docker compose logs -f

# Nếu một service không healthy, xem log riêng
docker compose logs -f trino
docker compose logs -f nessie
docker compose logs -f backend
```

**Script xử lý thông minh:**
- Nếu containers đang chạy → tự `docker compose down` trước khi boot lại
- Nếu image thiếu → tự `docker pull`
- Nếu schema đã tồn tại → bỏ qua (không lỗi)
- Nếu RAM < 6GB → cảnh báo nhưng vẫn tiếp tục

---

### 4.2 Cách thủ công (nếu cần kiểm soát từng bước)

```bash
cd /home/ubuntu_main/bitex/DE-Platform-1

# Build backend + frontend rồi start toàn bộ
docker compose up -d --build

# Xem logs
docker compose logs -f trino
docker compose logs -f nessie
docker compose logs -f backend
```

### Thứ tự khởi động (Docker tự xử lý qua `depends_on`)

```
postgres (healthy)
  ├── nessie (healthy)
  │     └── trino (healthy)
  └── dagster-webserver
        └── dagster-daemon
minio (healthy)
  └── minio-init
vault (healthy)
  └── vault-init
trino + nessie + minio + vault + dagster-webserver
  └── backend
        └── frontend
```

### Dừng và xóa

```bash
# Dừng nhưng giữ dữ liệu
docker compose down

# Dừng và XÓA toàn bộ dữ liệu (volume)
docker compose down -v

# Chạy lại từ đầu (clean start)
docker compose down -v && bash start.sh
```

### URLs truy cập

| Service | URL | Ghi chú |
|---------|-----|---------|
| **DE Studio** | http://localhost:3000 | Main UI |
| **FastAPI Swagger** | http://localhost:8000/docs | API documentation |
| **Trino UI** | http://localhost:8080 | Query monitoring |
| **MinIO Console** | http://localhost:9001 | user: admin / minio123456 |
| **Nessie API** | http://localhost:19120/api/v2 | REST CRUD |
| **Dagster UI** | http://localhost:3001 | Pipeline runs, schedules |
| **Vault UI** | http://localhost:8200 | Token: dev-root-token |
| **PostgreSQL** | localhost:5432 | deplatform / deplatform123 |

---

## 5. Chi tiết từng Service

### 5.1 PostgreSQL

**Vai trò:** Database metadata cho Nessie (lưu commit log, refs) và Dagster (lưu run history, schedules).

**Config quan trọng:**
```yaml
POSTGRES_USER: deplatform
POSTGRES_PASSWORD: deplatform123
POSTGRES_DB: deplatform
```

**Dữ liệu:** Volume `postgres_data` — persistent, không mất khi restart.  
**RAM limit:** 256MB

---

### 5.2 MinIO

**Vai trò:** Object storage S3-compatible — lưu actual Parquet files của Iceberg tables.

**Buckets (được tạo tự động bởi `minio-init`):**

| Bucket | Mục đích |
|--------|---------|
| `warehouse` | Iceberg table files (dùng bởi Trino catalog `iceberg`) |
| `raw-data` | Raw data upload (CSV, JSON, Parquet thô) |

**Cấu trúc data trên MinIO:**
```
warehouse/
├── bronze/
│   └── orders/           ← Iceberg table "iceberg.bronze.orders"
│       ├── data/         ← Parquet files
│       └── metadata/     ← Iceberg metadata JSON
└── silver/
    └── processed_orders/
        ├── data/
        └── metadata/
```

**API MinIO S3:** `http://minio:9000` (dùng nội bộ bởi Trino)  
**Console UI:** `http://localhost:9001`  
**RAM limit:** 256MB

---

### 5.3 Nessie (Iceberg Catalog + Git)

**Vai trò kép:**
1. **Iceberg REST Catalog** — Trino hỏi Nessie để biết table nào tương ứng với file nào trên MinIO
2. **Git for Data** — Theo dõi lịch sử thay đổi schema/data theo model commit-branch-tag

**Config kết nối Trino → Nessie** (`infrastructure/trino/etc/catalog/iceberg.properties`):
```properties
iceberg.catalog.type=nessie
iceberg.nessie-catalog.uri=http://nessie:19120/api/v2
iceberg.nessie-catalog.default-warehouse=warehouse
iceberg.nessie-catalog.ref=main
```

**API REST Nessie v2** (dùng bởi FastAPI backend):
```
GET  /api/v2/trees              → List branches + tags
GET  /api/v2/trees/{branch}     → Chi tiết branch
POST /api/v2/trees              → Tạo branch mới
GET  /api/v2/trees/{branch}/log → Commit log
GET  /api/v2/trees/{branch}/entries → Bảng trên branch
POST /api/v2/trees/{to}/merge   → Merge branches
GET  /api/v2/trees/{from}/diff/{to} → Diff 2 branches
```

**Storage backend:** PostgreSQL (Nessie lưu metadata vào `postgres:5432/deplatform`)  
**RAM limit:** 384MB (bao gồm JVM)

---

### 5.4 Trino

**Vai trò:** Distributed SQL query engine — người dùng viết SQL, Trino đọc/ghi Iceberg tables trên MinIO.

**Config files:**

| File | Nội dung |
|------|---------|
| `config.properties` | Port 8080, max memory 512MB/node |
| `jvm.config` | JVM heap max 1GB, G1GC |
| `node.properties` | Node ID, data dir `/data/trino` |
| `catalog/iceberg.properties` | Kết nối Nessie catalog + MinIO S3 |

**Cách Trino kết nối MinIO (S3):**
```properties
fs.native-s3.enabled=true
s3.endpoint=http://minio:9000
s3.region=us-east-1
s3.path-style-access=true        ← Quan trọng! MinIO dùng path-style
s3.aws-access-key=admin
s3.aws-secret-key=minio123456
```

**Ví dụ SQL thường dùng:**
```sql
-- Xem schemas
SHOW SCHEMAS FROM iceberg;

-- Tạo schema
CREATE SCHEMA IF NOT EXISTS iceberg.bronze
WITH (location = 's3a://warehouse/bronze/');

-- Tạo Iceberg table
CREATE TABLE iceberg.bronze.orders (
    id BIGINT,
    customer_id BIGINT,
    amount DOUBLE,
    order_date DATE,
    status VARCHAR
)
WITH (
    format = 'PARQUET',
    partitioning = ARRAY['month(order_date)']
);

-- Query data
SELECT * FROM iceberg.silver.processed_orders LIMIT 100;

-- Snapshot history
SELECT * FROM "iceberg"."bronze"."orders$snapshots";

-- Time travel
SELECT * FROM iceberg.bronze.orders FOR VERSION AS OF 12345678;
```

**RAM limit:** 1536MB (cần nhất vì là query engine nặng nhất)

---

### 5.5 HashiCorp Vault

**Vai trò:** Quản lý secrets tập trung, tránh hardcode passwords trong code.

**Mode:** Dev mode (không cần unseal) — phù hợp cho development.  
> ⚠️ **Production:** Dùng production mode với `vault operator init` + HA backend.

**Root Token:** `dev-root-token` (đặt trong `.env`)

**Secrets được khởi tạo bởi `vault-init`:**
```
secret/minio     → access_key, secret_key, endpoint
secret/postgres  → username, password, host, port, database
secret/trino     → host, port, user
secret/nessie    → uri
```

**Cách FastAPI đọc secret:**
```python
# vault_service.py
secret = vault_service.read_secret("minio")
access_key = secret["access_key"]
```

**KV Engine:** version 2 (hỗ trợ versioning secrets)  
**RAM limit:** 128MB

---

### 5.6 Dagster

**Vai trò:** Pipeline orchestration — chạy pipeline jobs theo schedule hoặc trigger thủ công.

**2 containers:**
- `dagster-webserver`: UI (:3001) + GraphQL API
- `dagster-daemon`: Background process chạy schedules, launcha runs

**Volume chia sẻ quan trọng: `pipeline_definitions`**
```
/opt/dagster/pipelines/          ← Volume Docker (shared)
├── bronze_to_silver_orders.json
├── silver_to_gold_kpis.json
└── ...
```
- **FastAPI** ghi JSON files vào volume này khi user tạo pipeline trong DE Studio
- **Dagster** (`pipeline_factory.py`) đọc JSON files này và tạo Dagster jobs + schedules tương ứng

**Pipeline JSON format:**
```json
{
    "id": "uuid",
    "name": "bronze_to_silver_orders",
    "description": "Transform raw orders to silver layer",
    "schedule": "0 */6 * * *",
    "branch": "main",
    "steps": [
        {
            "name": "create_schema",
            "type": "sql",
            "sql": "CREATE SCHEMA IF NOT EXISTS iceberg.silver WITH (location='s3a://warehouse/silver/')"
        },
        {
            "name": "transform_orders",
            "type": "sql",
            "sql": "CREATE TABLE iceberg.silver.orders AS SELECT id, customer_id, amount FROM iceberg.bronze.raw_orders WHERE status = 'CONFIRMED'"
        }
    ],
    "created_at": "2026-04-09T16:00:00",
    "updated_at": "2026-04-09T16:00:00",
    "status": "active"
}
```

**Dagster config (`dagster/dagster.yaml`):**
```yaml
storage:
  postgres:               ← Lưu run history, logs
    postgres_db: ...

run_coordinator:
  class: QueuedRunCoordinator
  config:
    max_concurrent_runs: 1  ← Giới hạn 1 job chạy cùng lúc (tiết kiệm RAM)

schedule_storage:
  module: dagster_postgres  ← Schedules persistent qua restart
```

**Dagster `repository.py` — cơ chế load:**
```python
@repository
def lakehouse_repository():
    base_jobs = [health_check_job]
    dynamic_jobs, dynamic_schedules = build_all_dynamic_pipelines()
    return base_jobs + dynamic_jobs + dynamic_schedules
```

**Cron schedule examples:**
```
0 */6 * * *   → Mỗi 6 tiếng
0 2 * * *     → 2h sáng mỗi ngày
0 2 * * 1     → 2h sáng thứ Hai hàng tuần
*/30 * * * *  → Mỗi 30 phút
```

**RAM limit:** Webserver 512MB, Daemon 384MB

---

### 5.7 FastAPI Backend

**Vai trò:** API gateway duy nhất cho DE Studio — tất cả calls từ frontend đi qua đây.

**Base URL:** `http://localhost:8000`  
**Docs:** `http://localhost:8000/docs` (Swagger UI tự động)

**Routers:**

| Router | Prefix | Mô tả |
|--------|--------|-------|
| `models.py` | `/api/models` | CRUD Iceberg tables qua Trino |
| `pipelines.py` | `/api/pipelines` | Tạo/sửa/xóa/run pipeline definitions |
| `nessie.py` | `/api/nessie` | Git operations: branch, tag, merge, diff |
| `query.py` | `/api/query` | Execute SQL trên Trino |
| `storage.py` | `/api/storage` | Browse/upload/delete MinIO objects |
| `maintenance.py` | `/api/maintenance` | Catalog Health: scan SSE, optimize, vacuum, orphan cleanup |

**Services layer** (logic tách riêng):
```
trino_service.py   → trino-python-client (sync)
nessie_service.py  → httpx AsyncClient → Nessie REST v2
minio_service.py   → minio-py SDK
dagster_service.py → httpx → Dagster GraphQL
vault_service.py   → hvac → Vault KV v2
```

**Config** (`app/config.py` đọc từ env vars):
```python
class Settings(BaseSettings):
    trino_host: str = "trino"
    trino_port: int = 8080
    minio_endpoint: str = "minio:9000"
    nessie_uri: str = "http://nessie:19120/api/v2"
    vault_addr: str = "http://vault:8200"
    dagster_graphql_url: str = "http://dagster-webserver:3000/graphql"
    pipeline_definitions_dir: str = "/opt/dagster/pipelines"
```

**CORS:** Allow all origins (dev mode) — chỉnh lại cho production.

**RAM limit:** 256MB

---

### 5.8 Frontend DE Studio

**Vai trò:** Single Page Application — giao diện quản lý toàn bộ platform.

**Tech:** React 18 + React Router 6 + Lucide Icons + Vite  
**Design:** Dark theme, glassmorphism, Inter font  
**Build:** Multi-stage Docker: Node build → Nginx serve

**Pages:**

| Page | Route | Chức năng |
|------|-------|-----------|
| Dashboard | `/` | Stats tổng, health check, danh sách services |
| Model Manager | `/models` | Schema Explorer + 6 tabs per table: Overview, Schema, Preview, Snapshots, DDL, Optimize |
| Pipeline Studio | `/pipelines` | Tạo pipeline (name + steps + schedule + branch) → Run |
| Git Explorer | `/git` | Branches list, commit log, tạo/xóa branch, merge |
| SQL Editor | `/query` | Viết SQL → Chạy (Ctrl+Enter) → Xem kết quả → Export CSV |
| Storage Browser | `/storage` | Duyệt buckets → folders → files → delete |
| Catalog Health | `/catalog-health` | Scan orphan files + snapshots toàn catalog, cleanup hàng loạt |

**API Client** (`src/api/client.js`):  
- Tất cả requests đều prefix `/api` → Nginx proxy → `http://backend:8000`
- Dev mode: Vite proxy `/api` → `http://localhost:8000`

**Nginx config** phục vụ 2 vai trò:
1. SPA: Mọi URL đều trả về `index.html` (React Router xử lý)
2. Proxy: `/api/*` → `http://backend:8000`

**RAM limit:** 64MB (chỉ Nginx serve static files)

---

## 6. Luồng dữ liệu (Data Flow)

### 6.1 Ingest raw data (Upload file)
```
User upload CSV → DE Studio
→ POST /api/storage/upload/raw-data
→ FastAPI (minio_service.put_object)
→ MinIO bucket "raw-data"
```
### 6.2 Tạo bảng Iceberg (Bronze layer)
```
User tạo bảng → DE Studio
→ POST /api/models/tables
→ FastAPI (trino_service.execute)
→ Trino: "CREATE TABLE iceberg.bronze.orders (...)"
→ Trino hỏi Nessie: "Tạo entry cho table này"
→ Trino tạo metadata files trên MinIO bucket "warehouse/bronze/orders/"
→ Nessie commit thay đổi vào branch "main"
```

### 6.3 Chạy Pipeline (Transform data)
```
User click "Run" → DE Studio
→ POST /api/pipelines/{name}/run
→ FastAPI (dagster_service.trigger_job via GraphQL)
→ Dagster Webserver → Dagster Daemon launch run
→ Dagster job thực thi từng SQL step qua TrinoConnection
→ Trino thực thi transform (ví dụ: INSERT INTO silver.orders SELECT...)
→ Kết quả ghi vào MinIO "warehouse/silver/"
→ Nessie commit snapshot mới
```

### 6.4 Query data
```
User viết SQL → DE Studio (SQL Editor)
→ POST /api/query/execute { sql: "SELECT..." }
→ FastAPI (trino_service.execute)
→ Trino → Nessie (tìm table metadata) → MinIO (đọc Parquet)
→ Kết quả rows trả về → Frontend hiển thị bảng
```

### 6.5 Branching workflow (Dev → Prod)
```
User tạo branch "feature/new-schema" từ "main"
→ POST /api/nessie/branches { name: "feature/new-schema" }
→ FastAPI → Nessie tạo branch mới

User tạo pipeline chạy trên branch "feature/new-schema"
→ Pipeline step SQL: CREATE TABLE iceberg.silver.new_table
→ Nessie ghi commit trên branch "feature/new-schema", không ảnh hưởng "main"

Sau khi validate xong:
→ POST /api/nessie/merge { from_branch: "feature/new-schema", to_branch: "main" }
→ Nessie merge → "main" có schema mới
```

---

## 7. API Reference

### Data Models

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/models/schemas` | Liệt kê schemas trong catalog iceberg |
| POST | `/api/models/schemas` | Tạo schema mới |
| DELETE | `/api/models/schemas/{name}` | Xóa schema (phải empty) |
| GET | `/api/models/tables/{schema}` | Liệt kê tables trong schema |
| POST | `/api/models/tables` | Tạo Iceberg table mới (có support UUID/partition) |
| DELETE | `/api/models/tables/{schema}/{table}` | Drop table |
| POST | `/api/models/tables/{schema}/{table}/rename` | Rename table |
| GET | `/api/models/tables/{schema}/{table}/columns` | Describe table structure |
| POST | `/api/models/tables/{schema}/{table}/alter` | Add/Drop/Rename columns |
| GET | `/api/models/tables/{schema}/{table}/stats` | Row count, total size, file count |
| GET | `/api/models/tables/{schema}/{table}/preview` | Preview top rows của table (có time travel) |
| GET | `/api/models/tables/{schema}/{table}/properties` | Get table properties & generated DDL |
| GET | `/api/models/tables/{schema}/{table}/snapshots` | Iceberg snapshot history |

**POST /api/models/tables body:**
```json
{
    "schema_name": "bronze",
    "table_name": "orders",
    "columns": [
        {"name": "id", "type": "BIGINT"},
        {"name": "customer_id", "type": "BIGINT"},
        {"name": "amount", "type": "DOUBLE"},
        {"name": "order_date", "type": "DATE"}
    ],
    "partition_by": ["month(order_date)"],
    "comment": "Raw orders table"
}
```

---

### Pipelines

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/pipelines/` | Liệt kê tất cả pipelines |
| GET | `/api/pipelines/{name}` | Chi tiết pipeline |
| POST | `/api/pipelines/` | Tạo pipeline mới |
| PUT | `/api/pipelines/{name}` | Cập nhật pipeline |
| DELETE | `/api/pipelines/{name}` | Xóa pipeline |
| POST | `/api/pipelines/{name}/run` | Trigger chạy ngay |
| GET | `/api/pipelines/{name}/runs` | Lịch sử runs |

---

### Nessie Git

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/nessie/branches` | List branches |
| POST | `/api/nessie/branches` | Tạo branch |
| DELETE | `/api/nessie/branches/{name}` | Xóa branch |
| GET | `/api/nessie/branches/{name}/log` | Commit log |
| GET | `/api/nessie/branches/{name}/contents` | Bảng trên branch |
| POST | `/api/nessie/merge` | Merge branches |
| GET | `/api/nessie/diff/{from}/{to}` | Diff 2 branches |
| GET | `/api/nessie/tags` | List tags |
| POST | `/api/nessie/tags` | Tạo tag |

---

### Query Engine

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/api/query/execute` | Chạy SQL query |
| GET | `/api/query/catalogs` | List catalogs |

**POST /api/query/execute body:**
```json
{
    "sql": "SELECT * FROM iceberg.bronze.orders LIMIT 100",
    "catalog": "iceberg",
    "schema_name": "bronze",
    "limit": 1000
}
```

---

### Storage

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/storage/buckets` | List buckets |
| GET | `/api/storage/objects/{bucket}?prefix=folder/` | List objects |
| POST | `/api/storage/upload/{bucket}?path=folder` | Upload file |
| DELETE | `/api/storage/objects/{bucket}/{object}` | Delete object |

---

## 8. Pipeline Studio — Cách tạo Pipeline động

### Cơ chế hoạt động

```
DE Studio UI
    ↓  User điền form: name, steps (SQL), schedule, branch
POST /api/pipelines/
    ↓  FastAPI lưu JSON vào /opt/dagster/pipelines/<name>.json
    ↓  FastAPI gọi Dagster GraphQL reloadRepositoryLocation
Dagster Webserver reload workspace
    ↓  pipeline_factory.py đọc lại tất cả JSON files
    ↓  Tạo Dagster job cho mỗi pipeline
    ↓  Nếu có schedule → tạo ScheduleDefinition
Dagster Daemon start schedules
```

### Ví dụ pipeline 3 bước (Bronze → Silver → Gold)

```json
{
    "name": "etl_orders_full",
    "description": "ETL toàn bộ orders từ raw lên gold",
    "schedule": "0 2 * * *",
    "branch": "main",
    "steps": [
        {
            "name": "ensure_schemas",
            "type": "sql",
            "sql": "CREATE SCHEMA IF NOT EXISTS iceberg.silver WITH (location='s3a://warehouse/silver/'); CREATE SCHEMA IF NOT EXISTS iceberg.gold WITH (location='s3a://warehouse/gold/')"
        },
        {
            "name": "bronze_to_silver",
            "type": "sql",
            "sql": "CREATE OR REPLACE TABLE iceberg.silver.orders AS SELECT id, customer_id, CAST(amount AS DECIMAL(18,2)) AS amount, order_date, UPPER(status) AS status FROM iceberg.bronze.raw_orders WHERE amount > 0"
        },
        {
            "name": "silver_to_gold_daily_kpis",
            "type": "sql",
            "sql": "CREATE OR REPLACE TABLE iceberg.gold.daily_revenue AS SELECT order_date, COUNT(*) AS order_count, SUM(amount) AS total_revenue, AVG(amount) AS avg_order_value FROM iceberg.silver.orders WHERE status = 'CONFIRMED' GROUP BY order_date"
        }
    ]
}
```

---

## 9. Data Model Manager — Quản lý vòng đời Iceberg

Giao diện **Model Manager** trong DE Studio cung cấp khả năng quản lý hoàn thiện Data Models trọn đời (tương đương AWS Glue Catalog nhưng chuyên sâu cho Iceberg).

### Tính năng chính

- **Schema Explorer:** Giao diện dạng Tree Panel bên trái hỗ trợ phân mục schemas (`bronze`, `silver`, `gold`, `system`) và view nhanh danh sách tables.
- **Wizard 3 bước tạo Table:**
  - **Info:** Schema, Table Name, Comment
  - **Columns:** Typed column builder, auto generate comment & types (hỗ trợ Iceberg datatypes)
  - **Advanced:** Custom format (PARQUET/ORC/AVRO), Partition By, Sort By, Table Properties. Dynamic generation *CREATE TABLE SQL* ngay trên giao diện.
- **Table Overview (Trang chủ bảng):**
  - **Stats Card:** Tổng số dòng, số files parquet, kích thước dữ liệu vật lý trên MinIO và tổng số snapshot versions đếm real-time.
  - **Properties Box:** Đường dẫn `s3a://`, định dạng, key-val prop configs.
- **Schema Evolution (Alter Table):** Hỗ trợ đổi tên bảng, thêm column mới, sửa đổi tên column (RENAME), và xóa column (DROP COLUMN). Mọi thao tác Alter Table cập nhật trực tiếp catalog Iceberg mà không cần viết lệnh SQL thủ công.
- **Data Preview:** Trực tiếp SELECT preview rows. Có Input Time-travel cho phép nhập `Snapshot ID` để preview dữ liệu tại một thời điểm trong quá khứ!
- **Table Snapshots Timeline:** Hiển thị timeline log snapshot lịch sử với badge phân loại (APPEND, OVERWRITE, REPLACE, DELETE) để xem dòng đời table.

---

## 11. Nessie Git — Data Versioning

### Khái niệm chính

| Khái niệm | Tương đương Git | Trong DE Platform |
|-----------|----------------|-----------------|
| Branch | Branch | Môi trường phát triển riêng (dev, staging, prod) |
| Commit | Commit | Snapshot sau mỗi DDL/DML operation |
| Tag | Tag | Đánh dấu data tại một thời điểm cụ thể (e.g., report_2026_Q1) |
| Merge | Merge | Đưa schema/data từ dev branch vào main |

### Workflow đề xuất

```
main             ← Production branch
  ├── dev        ← Development branch
  └── staging    ← Testing branch
```

### Ví dụ sử dụng

```bash
# Tạo branch mới cho sprint
POST /api/nessie/branches
{ "name": "sprint-42", "source_branch": "main" }

# Tạo pipeline chạy trên branch sprint-42
POST /api/pipelines/
{ "name": "test_new_schema", "branch": "sprint-42", "steps": [...] }

# Kiểm tra commit log
GET /api/nessie/branches/sprint-42/log

# So sánh với main
GET /api/nessie/diff/sprint-42/main

# Merge vào main khi okay
POST /api/nessie/merge
{ "from_branch": "sprint-42", "to_branch": "main", "message": "Add new silver layer" }

# Tag production milestone
POST /api/nessie/tags
{ "name": "v2026-Q1-release", "branch": "main" }
```

---

## 12. Quản lý tài nguyên RAM

**Tổng RAM limit: ~3.8GB** (để lại ~4.2GB cho OS + overhead)

| Service | RAM Limit | Lý do |
|---------|-----------|-------|
| Trino | 1536MB | Query engine nặng nhất, JVM heap 1GB |
| Dagster Webserver | 512MB | Web UI + GraphQL server |
| Dagster Daemon | 384MB | Background scheduler |
| Nessie | 384MB | JVM (max 256MB heap) |
| PostgreSQL | 256MB | Shared metadata |
| MinIO | 256MB | Object storage |
| FastAPI Backend | 256MB | Python async server |
| HashiCorp Vault | 128MB | Secrets manager |
| Frontend (Nginx) | 64MB | Static file server |
| minio-init | - | One-shot, tắt sau khởi tạo |
| vault-init | - | One-shot, tắt sau khởi tạo |

**Nếu bị OOM (Out of Memory):**

1. Giảm Dagster xuống còn một container (tắt daemon, dùng manual trigger):
   - Comment out `dagster-daemon` trong `docker-compose.yml`
2. Giảm Trino heap: Sửa `jvm.config` → `-Xmx768m`
3. Dùng `trinodb/trino:435` thay vì `480` (nhẹ hơn ~150MB)

---

## 13. Biến môi trường (.env)

```bash
# PostgreSQL
POSTGRES_USER=deplatform
POSTGRES_PASSWORD=deplatform123    ← Đổi khi production!
POSTGRES_DB=deplatform

# MinIO
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=minio123456    ← Đổi khi production!

# Nessie
NESSIE_PORT=19120

# Trino  
TRINO_PORT=8080
TRINO_USER=admin

# Vault
VAULT_DEV_ROOT_TOKEN_ID=dev-root-token  ← Dùng production mode khi deploy!

# Dagster
DAGSTER_POSTGRES_USER=deplatform        ← Phải khớp POSTGRES_USER
DAGSTER_POSTGRES_PASSWORD=deplatform123
DAGSTER_POSTGRES_HOST=postgres
DAGSTER_POSTGRES_DB=deplatform
DAGSTER_WEBSERVER_PORT=3001

# Ports
BACKEND_PORT=8000
FRONTEND_PORT=3000
```

> **Lưu ý:** Khi thay đổi passwords trong `.env`:
> 1. Cập nhật cả `infrastructure/trino/etc/catalog/iceberg.properties` (minio credentials)
> 2. Xóa volumes và khởi động lại: `docker compose down -v && docker compose up -d`

---

## 14. Troubleshooting

### Trino không kết nối được Nessie

```bash
docker compose logs trino | grep -i "nessie\|error\|failed"

# Kiểm tra Nessie có healthy không
curl http://localhost:19120/api/v2/config

# Thử query đơn giản
docker exec de-trino trino --execute "SHOW SCHEMAS FROM iceberg"
```

### MinIO buckets chưa được tạo

```bash
docker compose logs minio-init

# Tạo thủ công
docker exec de-minio mc alias set local http://localhost:9000 admin minio123456
docker exec de-minio mc mb local/warehouse
docker exec de-minio mc mb local/raw-data
```

### Dagster không load pipeline mới

```bash
# Kiểm tra file JSON đã được ghi chưa
docker exec de-backend ls /opt/dagster/pipelines/

# Restart dagster-webserver để reload
docker compose restart dagster-webserver

# Xem logs
docker compose logs dagster-webserver | grep -i "pipeline\|error"
```

### Backend không kết nối Trino

```bash
# Kiểm tra Trino có running không
curl http://localhost:8080/v1/info

# Test từ trong backend container
docker exec de-backend python3 -c "
import trino
conn = trino.dbapi.connect(host='trino', port=8080, user='admin')
cur = conn.cursor()
cur.execute('SELECT 1')
print(cur.fetchall())
"
```

### Nessie lỗi kết nối PostgreSQL

```bash
docker compose logs nessie | grep -i "error\|postgres"

# Kiểm tra postgres
docker exec de-postgres pg_isready -U deplatform
```

### Reset toàn bộ dữ liệu

```bash
docker compose down -v
rm -rf ./data  # nếu có mount local
docker compose up -d
```

---

## 15. Roadmap mở rộng

### ✅ Đã hoàn thành
- [x] Data Model Manager: CRUD table, Schema Evolution, DDL viewer
- [x] Tab Overview với Stats real-time
- [x] Tab Preview với Time Travel qua Snapshot ID
- [x] Tab Snapshots: Timeline, CURRENT badge, Rollback, View direct to Preview
- [x] Tab Optimize: File Compaction + Vacuum (Expire Snapshots) với retention configurable
- [x] Catalog Health Center: SSE streaming scan, Orphan Files detection, Bulk cleanup
- [x] Catalog Health: Branch selector, Progress bar, Summary Cards, per-table cleanup

### Ngắn hạn
- [ ] Thêm xác thực (JWT auth) cho FastAPI + DE Studio
- [ ] Python pipeline steps (không chỉ SQL) trong Dagster
- [ ] Upload file raw → parse CSV → tự động ingest vào Bronze layer
- [ ] Alerts khi pipeline fail (webhook/email qua Dagster sensor)
- [ ] Catalog Health: Schedule tự động cleanup (Dagster job hàng tuần)
- [ ] Catalog Health: Ước tính dung lượng có thể giải phóng trước khi dọn

### Trung hạn
- [ ] dbt integration: Viết models dbt, chạy qua Dagster, kết quả lưu Iceberg
- [ ] Data quality checks (Great Expectations) tích hợp vào pipeline steps
- [ ] Lineage graph: Xem pipeline nào tạo ra bảng nào

### Dài hạn
- [ ] Multi-user: Workspace per user/team với RBAC
- [ ] Production mode: Vault production, TLS, external Postgres
- [ ] Spark integration: Thêm Spark để xử lý large-scale batch
- [ ] Streaming: Kafka + Flink cho real-time ingestion

---

*Tài liệu cập nhật ngày 2026-04-10 | DE Platform v1.1 — Data Model Studio + Catalog Health Center*