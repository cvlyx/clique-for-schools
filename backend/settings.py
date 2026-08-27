from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = "sqlite:///clique.db"
    jwt_secret: str = "change-me"
    jwt_minutes: int = 720  # 12 hours

    platform_admin_username: str = "clique-admin"
    platform_admin_password: str = "change-me"

    allowed_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,"
        "http://127.0.0.1:5174,http://localhost:8787"
    )
