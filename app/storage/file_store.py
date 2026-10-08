import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from app.config import settings
from app.models.schemas import (
    FileInfoResponse,
    FileMeasurementResponse,
    FileStatusEnum,
)

logger = logging.getLogger(__name__)

class FileStorage:
    def __init__(self, storage_dir: Optional[str] = None):
        self.storage_dir = Path(storage_dir or settings.UPLOAD_DIR)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        # In-memory dictionary for fast access
        self._files: Dict[str, FileInfoResponse] = {}
        self._measurements: Dict[str, FileMeasurementResponse] = {}
        self._load_existing()

    def _load_existing(self):
        """Loads previously saved records from storage directory if any."""
        try:
            for metadata_file in self.storage_dir.glob("*_meta.json"):
                with open(metadata_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    file_info = FileInfoResponse(**data)
                    self._files[file_info.id] = file_info

            for measurement_file in self.storage_dir.glob("*_measurements.json"):
                with open(measurement_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    measurement_info = FileMeasurementResponse(**data)
                    self._measurements[measurement_info.id] = measurement_info
        except Exception as e:
            logger.warning("Error loading existing storage files: %s", e)

    def save_file_record(
        self,
        file_info: FileInfoResponse,
        measurements: Optional[FileMeasurementResponse] = None,
    ) -> None:
        self._files[file_info.id] = file_info
        meta_path = self.storage_dir / f"{file_info.id}_meta.json"
        with open(meta_path, "w", encoding="utf-8") as f:
            f.write(file_info.model_dump_json(indent=2))

        if measurements:
            self._measurements[file_info.id] = measurements
            measure_path = self.storage_dir / f"{file_info.id}_measurements.json"
            with open(measure_path, "w", encoding="utf-8") as f:
                f.write(measurements.model_dump_json(indent=2))

    def get_file(self, file_id: str) -> Optional[FileInfoResponse]:
        return self._files.get(file_id)

    def get_measurements(self, file_id: str) -> Optional[FileMeasurementResponse]:
        return self._measurements.get(file_id)

    def list_files(self) -> Dict[str, FileInfoResponse]:
        return self._files

# Singleton store instance
file_store = FileStorage()
