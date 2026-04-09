#!/bin/sh
set -e

echo "⏳ Đợi MinIO khởi động..."
until mc alias set myminio http://minio:9000 "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null; do
  sleep 2
done

echo "✅ MinIO đã sẵn sàng. Tạo buckets..."

# Tạo bucket warehouse cho Iceberg tables
mc mb --ignore-existing myminio/warehouse
echo "  📦 Bucket 'warehouse' đã tạo"

# Tạo bucket raw-data cho raw files
mc mb --ignore-existing myminio/raw-data
echo "  📦 Bucket 'raw-data' đã tạo"

# Set policy public read (cho dev)
mc anonymous set download myminio/warehouse
mc anonymous set download myminio/raw-data

echo "🎉 Khởi tạo MinIO hoàn tất!"
