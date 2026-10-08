import os
from pydantic import BaseModel

class Settings(BaseModel):
    PROJECT_NAME: str = "Geospatial File Measurement API"
    PROJECT_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")
    MAX_FILE_SIZE_BYTES: int = 50 * 1024 * 1024  # 50 MB

settings = Settings()
