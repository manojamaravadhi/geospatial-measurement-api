import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.config import settings
from app.models.schemas import (
    FileInfoResponse,
    FileMeasurementResponse,
    FileStatusEnum,
)
from app.services.crs_service import CRSService
from app.services.file_processor import FileProcessingError, FileProcessorService
from app.services.measurement_service import MeasurementService
from app.storage.file_store import file_store

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["Geospatial Files"])

def _process_and_store_file(file_path: Path, filename: str) -> FileInfoResponse:
    file_id = str(uuid.uuid4())[:8]
    try:
        # Process geospatial data
        original_gdf = FileProcessorService.process_file(str(file_path), filename)

        feature_count = len(original_gdf)
        detected_crs = original_gdf.crs.to_string() if original_gdf.crs else "EPSG:4326"

        # Transform to projected CRS for metric measurements
        projected_gdf, original_crs_str, projected_crs_str = CRSService.reproject_to_metric(original_gdf)

        # Calculate geometric measurements
        feature_measurements, summary = MeasurementService.calculate_measurements(
            original_gdf=original_gdf,
            projected_gdf=projected_gdf,
            projected_crs_str=projected_crs_str,
        )

        file_info = FileInfoResponse(
            id=file_id,
            filename=filename,
            feature_count=feature_count,
            crs=detected_crs,
            status=FileStatusEnum.COMPLETED,
            created_at=datetime.now(timezone.utc),
            error_message=None,
        )

        measurement_resp = FileMeasurementResponse(
            id=file_id,
            filename=filename,
            feature_count=feature_count,
            original_crs=original_crs_str,
            projected_crs=projected_crs_str,
            status=FileStatusEnum.COMPLETED,
            summary=summary,
            measurements=feature_measurements,
        )

        file_store.save_file_record(file_info, measurement_resp)
        return file_info

    except FileProcessingError as e:
        logger.error("Processing error for file %s: %s", filename, e)
        failed_info = FileInfoResponse(
            id=file_id,
            filename=filename,
            feature_count=0,
            crs=None,
            status=FileStatusEnum.FAILED,
            created_at=datetime.now(timezone.utc),
            error_message=str(e),
        )
        file_store.save_file_record(failed_info)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Geospatial processing failed: {str(e)}",
        )
    except Exception as e:
        logger.exception("Unexpected error processing file %s", filename)
        failed_info = FileInfoResponse(
            id=file_id,
            filename=filename,
            feature_count=0,
            crs=None,
            status=FileStatusEnum.FAILED,
            created_at=datetime.now(timezone.utc),
            error_message=str(e),
        )
        file_store.save_file_record(failed_info)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected internal error occurred: {str(e)}",
        )

@router.post(
    "/",
    response_model=FileInfoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload and process a geospatial file",
    description="Accepts a `.zip` containing an ESRI Shapefile or a `.kml` file. Processes features and computes measurements.",
)
@router.post(
    "",
    response_model=FileInfoResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def upload_geospatial_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    lower_name = filename.lower()

    if not (lower_name.endswith(".zip") or lower_name.endswith(".kml")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{filename}'. Please upload a .zip containing a Shapefile or a .kml file.",
        )

    file_id = str(uuid.uuid4())[:8]
    upload_dir = Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)

    temp_save_path = upload_dir / f"{file_id}_{filename}"

    try:
        # Save uploaded file
        with open(temp_save_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Check file size
        file_size = os.path.getsize(temp_save_path)
        if file_size > settings.MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_BYTES // (1024*1024)}MB.",
            )

        return _process_and_store_file(temp_save_path, filename)
    finally:
        # Clean up temporary uploaded file
        if temp_save_path.exists():
            temp_save_path.unlink()

@router.post(
    "/demo/{sample_type}",
    response_model=FileInfoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Quick demo loader for sample datasets",
    description="Loads built-in sample KML or Shapefile datasets for instant testing.",
)
async def load_demo_dataset(sample_type: str):
    root_dir = Path(__file__).resolve().parent.parent.parent
    sample_dir = root_dir / "sample_data"

    if sample_type.lower() in ("kml", "survey_kml"):
        sample_path = sample_dir / "survey_sample.kml"
        filename = "survey_sample.kml"
    elif sample_type.lower() in ("shapefile", "shp", "zip", "survey_shapes"):
        sample_path = sample_dir / "survey_shapes.zip"
        filename = "survey_shapes.zip"
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid sample type. Available options: 'kml' or 'shapefile'.",
        )

    if not sample_path.exists():
        # Auto-generate if missing
        import subprocess
        gen_script = sample_dir / "generate_samples.py"
        subprocess.run(["python", str(gen_script)], check=True)

    return _process_and_store_file(sample_path, filename)

@router.get(
    "/{id}/",
    response_model=FileInfoResponse,
    summary="Get file overview and status",
    description="Returns metadata, feature count, CRS, and status for the uploaded file ID.",
)
@router.get(
    "/{id}",
    response_model=FileInfoResponse,
    include_in_schema=False,
)
async def get_file_info(id: str):
    file_info = file_store.get_file(id)
    if not file_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File with ID '{id}' not found.",
        )
    return file_info

@router.get(
    "/{id}/measurements/",
    response_model=FileMeasurementResponse,
    summary="Get detailed feature measurements",
    description="Returns geometric measurements (Area for Polygons, Length for LineStrings) transformed into optimal metric projected CRS.",
)
@router.get(
    "/{id}/measurements",
    response_model=FileMeasurementResponse,
    include_in_schema=False,
)
async def get_file_measurements(id: str):
    file_info = file_store.get_file(id)
    if not file_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File with ID '{id}' not found.",
        )

    if file_info.status == FileStatusEnum.FAILED:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Measurements unavailable. File processing failed with error: {file_info.error_message}",
        )

    measurements = file_store.get_measurements(id)
    if not measurements:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Measurements for file ID '{id}' are not available.",
        )

    return measurements

@router.get(
    "/",
    response_model=List[FileInfoResponse],
    summary="List all uploaded files",
    description="Returns a list of all processed files.",
)
@router.get(
    "",
    response_model=List[FileInfoResponse],
    include_in_schema=False,
)
async def list_files():
    return list(file_store.list_files().values())
