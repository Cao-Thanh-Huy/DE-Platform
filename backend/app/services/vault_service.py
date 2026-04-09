"""
Vault Service — Đọc/ghi secrets từ HashiCorp Vault.
"""
import hvac
from app.config import settings


class VaultService:
    def __init__(self):
        self.client = hvac.Client(
            url=settings.vault_addr,
            token=settings.vault_token,
        )

    def is_authenticated(self) -> bool:
        return self.client.is_authenticated()

    def read_secret(self, path: str) -> dict:
        """Đọc secret từ Vault KV v2."""
        try:
            result = self.client.secrets.kv.v2.read_secret_version(path=path)
            return result.get("data", {}).get("data", {})
        except Exception as e:
            raise Exception(f"Lỗi đọc secret '{path}': {e}")

    def write_secret(self, path: str, data: dict):
        """Ghi secret vào Vault KV v2."""
        try:
            self.client.secrets.kv.v2.create_or_update_secret(path=path, secret=data)
        except Exception as e:
            raise Exception(f"Lỗi ghi secret '{path}': {e}")

    def list_secrets(self, path: str = "") -> list:
        """Liệt kê secrets tại path."""
        try:
            result = self.client.secrets.kv.v2.list_secrets(path=path)
            return result.get("data", {}).get("keys", [])
        except Exception as e:
            return []
