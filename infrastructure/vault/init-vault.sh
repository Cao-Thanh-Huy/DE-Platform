#!/bin/sh
set -e

echo "⏳ Đợi Vault khởi động..."
until vault status 2>/dev/null; do
  sleep 2
done

echo "✅ Vault đã sẵn sàng. Ghi secrets..."

# --- MinIO credentials ---
vault kv put secret/minio \
  access_key="${MINIO_ROOT_USER}" \
  secret_key="${MINIO_ROOT_PASSWORD}" \
  endpoint="http://minio:9000"

# --- PostgreSQL credentials ---
vault kv put secret/postgres \
  username="${POSTGRES_USER}" \
  password="${POSTGRES_PASSWORD}" \
  host="postgres" \
  port="5432" \
  database="${POSTGRES_DB}"

# --- Trino credentials ---
vault kv put secret/trino \
  host="trino" \
  port="8080" \
  user="admin"

# --- Nessie credentials ---
vault kv put secret/nessie \
  uri="http://nessie:19120/api/v2"

echo "🎉 Vault secrets đã được khởi tạo!"
