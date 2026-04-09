#!/usr/bin/env bash
# ================================================================
# DE Platform — Bootstrap Script
# Chạy một lần duy nhất, tự động dựng toàn bộ Data Platform.
# Usage: bash start.sh
# ================================================================
set -euo pipefail

# ── Màu sắc terminal ────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helper functions ─────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()    { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $*${NC}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════${NC}"; }
banner()  {
  echo -e "${CYAN}"
  echo "  ██████╗ ███████╗    ██████╗ ██╗      █████╗ ████████╗███████╗ ██████╗ ██████╗ ███╗   ███╗"
  echo "  ██╔══██╗██╔════╝    ██╔══██╗██║     ██╔══██╗╚══██╔══╝██╔════╝██╔═══██╗██╔══██╗████╗ ████║"
  echo "  ██║  ██║█████╗      ██████╔╝██║     ███████║   ██║   █████╗  ██║   ██║██████╔╝██╔████╔██║"
  echo "  ██║  ██║██╔══╝      ██╔═══╝ ██║     ██╔══██║   ██║   ██╔══╝  ██║   ██║██╔══██╗██║╚██╔╝██║"
  echo "  ██████╔╝███████╗    ██║     ███████╗██║  ██║   ██║   ██║     ╚██████╔╝██║  ██║██║ ╚═╝ ██║"
  echo "  ╚═════╝ ╚══════╝    ╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝"
  echo -e "${NC}"
  echo -e "  ${BOLD}Data Engineering Platform — Auto Bootstrap${NC}"
  echo -e "  Lakehouse: Trino + MinIO + Nessie + Iceberg"
  echo -e "  Orchestration: Dagster | Secrets: Vault | UI: DE Studio\n"
}

# ── Bắt lỗi và hiển thị ─────────────────────────────────────────
trap 'error "Script bị dừng tại dòng $LINENO. Xem logs: docker compose logs"' ERR

# Biến cấu hình (có thể override qua env)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"

# Load env vars
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

TRINO_HOST="${TRINO_HOST:-localhost}"
TRINO_PORT="${TRINO_PORT:-8080}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-admin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-minio123456}"
NESSIE_PORT="${NESSIE_PORT:-19120}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
DAGSTER_WEBSERVER_PORT="${DAGSTER_WEBSERVER_PORT:-3001}"
VAULT_PORT=8200

# ── Hàm chờ service ─────────────────────────────────────────────
wait_for_url() {
  local name=$1 url=$2 max=${3:-120} interval=${4:-5}
  local elapsed=0
  info "Đợi ${name} sẵn sàng tại ${url} ..."
  while ! curl -sf "$url" > /dev/null 2>&1; do
    if [[ $elapsed -ge $max ]]; then
      error "${name} không sẵn sàng sau ${max}s!"
      docker compose logs --tail=20 2>/dev/null || true
      return 1
    fi
    printf "."
    sleep $interval
    elapsed=$((elapsed + interval))
  done
  echo ""
  success "${name} sẵn sàng! (${elapsed}s)"
}

wait_for_container_healthy() {
  local name=$1 max=${2:-120}
  local elapsed=0
  info "Đợi container ${name} healthy ..."
  while [[ "$(docker inspect --format='{{.State.Health.Status}}' "$name" 2>/dev/null)" != "healthy" ]]; do
    if [[ $elapsed -ge $max ]]; then
      warn "${name} chưa healthy sau ${max}s, tiếp tục..."
      return 0
    fi
    printf "."
    sleep 5
    elapsed=$((elapsed + 5))
  done
  echo ""
  success "Container ${name} healthy!"
}

run_trino_sql() {
  local sql=$1
  docker exec de-trino trino \
    --output-format ALIGNED \
    --execute "$sql" 2>/dev/null
}

# ================================================================
# MAIN
# ================================================================
banner

# ── BƯỚC 1: Kiểm tra prerequisites ──────────────────────────────
step "Bước 1/7: Kiểm tra Prerequisites"

# Docker
if ! command -v docker &>/dev/null; then
  error "Docker chưa được cài đặt!"
  exit 1
fi
success "Docker: $(docker --version | head -1)"

# Docker Compose
if ! docker compose version &>/dev/null; then
  error "Docker Compose plugin chưa được cài!"
  exit 1
fi
success "Docker Compose: $(docker compose version --short)"

# docker-compose.yml
if [[ ! -f "$COMPOSE_FILE" ]]; then
  error "Không tìm thấy $COMPOSE_FILE"
  exit 1
fi
success "docker-compose.yml tồn tại: $COMPOSE_FILE"

# Kiểm tra RAM
TOTAL_RAM_MB=$(free -m | awk '/^Mem:/{print $2}')
AVAIL_RAM_MB=$(free -m | awk '/^Mem:/{print $7}')
info "RAM: Total=${TOTAL_RAM_MB}MB | Available=${AVAIL_RAM_MB}MB"
if [[ $TOTAL_RAM_MB -lt 6000 ]]; then
  warn "RAM < 6GB, có thể bị OOM. Khuyến nghị ít nhất 7GB."
fi

# ── BƯỚC 2: Kiểm tra Docker images ─────────────────────────────
step "Bước 2/7: Kiểm tra Docker Images"

REQUIRED_IMAGES=(
  "trinodb/trino:480"
  "minio/minio:latest"
  "minio/mc:latest"
  "projectnessie/nessie:latest"
  "postgres:15-alpine"
  "lakehouse-dagster-webserver:latest"
  "lakehouse-dagster-daemon:latest"
  "hashicorp/vault:latest"
  "nginx:alpine"
)

MISSING_IMAGES=()
for img in "${REQUIRED_IMAGES[@]}"; do
  if docker image inspect "$img" &>/dev/null; then
    success "Image found: $img"
  else
    warn "Image missing: $img"
    MISSING_IMAGES+=("$img")
  fi
done

if [[ ${#MISSING_IMAGES[@]} -gt 0 ]]; then
  warn "Một số images chưa có. Đang pull..."
  for img in "${MISSING_IMAGES[@]}"; do
    info "Pulling $img ..."
    docker pull "$img" || warn "Không pull được $img, sẽ thử tiếp"
  done
fi

# ── BƯỚC 3: Build backend + frontend ────────────────────────────
step "Bước 3/7: Build Backend & Frontend"

info "Building FastAPI backend..."
docker compose build backend 2>&1 | tail -5
success "Backend build xong"

info "Building DE Studio frontend..."
docker compose build frontend 2>&1 | tail -5
success "Frontend build xong"

# ── BƯỚC 4: Khởi động core services ─────────────────────────────
step "Bước 4/7: Khởi động Core Services"

# Dừng các containers cũ nếu đang chạy
info "Dừng containers cũ (nếu có)..."
docker compose down --remove-orphans 2>/dev/null || true

# Khởi động theo thứ tự
info "Khởi động PostgreSQL..."
docker compose up -d postgres
wait_for_container_healthy "de-postgres" 60

info "Khởi động MinIO..."
docker compose up -d minio
wait_for_container_healthy "de-minio" 60

info "Khởi động Vault..."
docker compose up -d vault
wait_for_container_healthy "de-vault" 30

info "Khởi động init jobs (MinIO buckets + Vault secrets)..."
docker compose up -d minio-init vault-init
info "Đợi init jobs hoàn tất..."
sleep 8

info "Khởi động Nessie..."
docker compose up -d nessie
wait_for_container_healthy "de-nessie" 90

info "Khởi động Trino..."
docker compose up -d trino
sleep 10  # Trino cần thêm thời gian khởi động JVM

info "Khởi động Dagster..."
docker compose up -d dagster-webserver dagster-daemon
sleep 5

info "Khởi động Backend & Frontend..."
docker compose up -d backend frontend

success "Tất cả containers đã được khởi động!"

# ── BƯỚC 5: Chờ services sẵn sàng ────────────────────────────────
step "Bước 5/7: Chờ Services sẵn sàng"

wait_for_url "Trino"           "http://localhost:${TRINO_PORT}/v1/info"    180 10
wait_for_url "Nessie"          "http://localhost:${NESSIE_PORT}/api/v2/config" 120 5
wait_for_url "FastAPI Backend" "http://localhost:${BACKEND_PORT}/api/health"   120 5
wait_for_url "DE Studio"       "http://localhost:${FRONTEND_PORT}"              60 5
wait_for_url "Dagster"         "http://localhost:${DAGSTER_WEBSERVER_PORT}"     90 5

# ── BƯỚC 6: Khởi tạo Lakehouse Schemas ───────────────────────────
step "Bước 6/7: Khởi tạo Lakehouse Schemas"

info "Tạo schemas Bronze / Silver / Gold trong Iceberg catalog..."

# Tạo Bronze schema
info "Tạo schema: iceberg.bronze"
run_trino_sql "CREATE SCHEMA IF NOT EXISTS iceberg.bronze
  WITH (location = 's3a://warehouse/bronze/')" && success "Schema 'bronze' OK" || warn "Bronze schema lỗi (có thể đã tồn tại)"

# Tạo Silver schema
info "Tạo schema: iceberg.silver"
run_trino_sql "CREATE SCHEMA IF NOT EXISTS iceberg.silver
  WITH (location = 's3a://warehouse/silver/')" && success "Schema 'silver' OK" || warn "Silver schema lỗi (có thể đã tồn tại)"

# Tạo Gold schema
info "Tạo schema: iceberg.gold"
run_trino_sql "CREATE SCHEMA IF NOT EXISTS iceberg.gold
  WITH (location = 's3a://warehouse/gold/')" && success "Schema 'gold' OK" || warn "Gold schema lỗi (có thể đã tồn tại)"

# Tạo bảng health check mẫu
info "Tạo bảng health check mẫu trong bronze..."
run_trino_sql "CREATE TABLE IF NOT EXISTS iceberg.bronze._platform_health (
  check_time TIMESTAMP,
  status     VARCHAR,
  message    VARCHAR
) WITH (format = 'PARQUET')" && success "Health check table OK" || warn "Health table lỗi"

run_trino_sql "INSERT INTO iceberg.bronze._platform_health VALUES
  (NOW(), 'healthy', 'DE Platform bootstrapped successfully')" && true || true

# Verify
info "Kiểm tra SCHEMAS..."
SCHEMAS=$(run_trino_sql "SHOW SCHEMAS FROM iceberg" 2>/dev/null | grep -E "bronze|silver|gold" | wc -l || echo "0")
if [[ "$SCHEMAS" -ge 3 ]]; then
  success "3 schemas (bronze/silver/gold) đã được tạo!"
else
  warn "Schemas có thể chưa đầy đủ, kiểm tra thủ công: SHOW SCHEMAS FROM iceberg"
fi

# ── BƯỚC 7: Health Check tổng thể ────────────────────────────────
step "Bước 7/7: Final Health Check"

ALL_OK=true

check_service() {
  local name=$1 url=$2
  if curl -sf "$url" > /dev/null 2>&1; then
    success "$name ✓"
  else
    warn "$name ✗ (không response)"
    ALL_OK=false
  fi
}

check_service "FastAPI Backend" "http://localhost:${BACKEND_PORT}/api/health"
check_service "Trino UI"        "http://localhost:${TRINO_PORT}/v1/info"
check_service "Nessie REST"     "http://localhost:${NESSIE_PORT}/api/v2/config"
check_service "Dagster UI"      "http://localhost:${DAGSTER_WEBSERVER_PORT}"
check_service "MinIO Console"   "http://localhost:9001"
check_service "Vault UI"        "http://localhost:${VAULT_PORT}"
check_service "DE Studio"       "http://localhost:${FRONTEND_PORT}"

# Container status
echo ""
info "Trạng thái containers:"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null || docker compose ps

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  🚀 DE Platform đã sẵn sàng!${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}🖥️  DE Studio (Main UI)${NC}"
echo -e "     ${CYAN}http://localhost:${FRONTEND_PORT}${NC}"
echo ""
echo -e "  ${BOLD}📡 FastAPI (Swagger docs)${NC}"
echo -e "     ${CYAN}http://localhost:${BACKEND_PORT}/docs${NC}"
echo ""
echo -e "  ${BOLD}🔍 Trino Query UI${NC}"
echo -e "     ${CYAN}http://localhost:${TRINO_PORT}${NC}"
echo ""
echo -e "  ${BOLD}💾 MinIO Console${NC}  (admin / ${MINIO_ROOT_PASSWORD})"
echo -e "     ${CYAN}http://localhost:9001${NC}"
echo ""
echo -e "  ${BOLD}🌿 Nessie REST API${NC}"
echo -e "     ${CYAN}http://localhost:${NESSIE_PORT}/api/v2${NC}"
echo ""
echo -e "  ${BOLD}📊 Dagster Pipelines${NC}"
echo -e "     ${CYAN}http://localhost:${DAGSTER_WEBSERVER_PORT}${NC}"
echo ""
echo -e "  ${BOLD}🔐 Vault Secrets${NC}  (token: dev-root-token)"
echo -e "     ${CYAN}http://localhost:${VAULT_PORT}${NC}"
echo ""
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${BOLD}Lệnh hữu ích:${NC}"
echo -e "  docker compose logs -f           ${YELLOW}# xem tất cả logs${NC}"
echo -e "  docker compose logs -f trino     ${YELLOW}# xem log Trino${NC}"
echo -e "  docker compose down              ${YELLOW}# dừng platform${NC}"
echo -e "  docker compose down -v           ${YELLOW}# dừng + xóa data${NC}"
echo -e "  bash start.sh                    ${YELLOW}# chạy lại script này${NC}"
echo -e "${BOLD}${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [[ "$ALL_OK" == "false" ]]; then
  echo ""
  warn "Một số services chưa lớn response. Kiểm tra logs:"
  echo -e "  ${CYAN}docker compose logs --tail=50${NC}"
else
  echo ""
  success "Tất cả services healthy! Mở trình duyệt và truy cập DE Studio! 🎉"
fi
