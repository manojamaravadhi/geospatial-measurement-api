from enum import Enum
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field
from datetime import datetime

class FileStatusEnum(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class MeasurementTypeEnum(str, Enum):
    AREA = "area"
    LENGTH = "length"
    NONE = "none"
    UNSUPPORTED = "unsupported"

class FeatureMeasurement(BaseModel):
    feature_id: Union[int, str] = Field(..., description="Unique index or ID of the feature")
    geometry_type: str = Field(..., description="Type of geometry (e.g. Polygon, LineString, Point)")
    geometry: Optional[Dict[str, Any]] = Field(None, description="GeoJSON geometry representation")
    crs: Optional[str] = Field(None, description="CRS associated with this feature")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Attributes and metadata of the feature")
    measurement_type: MeasurementTypeEnum = Field(..., description="Type of measurement computed")
    value: Optional[float] = Field(None, description="Primary calculated metric value")
    unit: Optional[str] = Field(None, description="Unit of the primary value (e.g. sq_meters, meters)")
    formatted_values: Optional[Dict[str, float]] = Field(
        None, description="Formatted measurement conversions (e.g., hectares, kilometers)"
    )
    note: Optional[str] = Field(None, description="Additional context or graceful degradation notice")

class FileInfoResponse(BaseModel):
    id: str = Field(..., description="Unique file upload identifier")
    filename: str = Field(..., description="Original name of the uploaded file")
    feature_count: int = Field(..., description="Total count of geospatial features parsed")
    crs: Optional[str] = Field(None, description="Identified Coordinate Reference System of the file")
    status: FileStatusEnum = Field(..., description="Processing status")
    created_at: Optional[datetime] = Field(None, description="Upload timestamp")
    error_message: Optional[str] = Field(None, description="Error details if processing failed")

class MeasurementSummary(BaseModel):
    total_features: int
    geometry_breakdown: Dict[str, int]
    total_area_sq_meters: Optional[float] = None
    total_area_hectares: Optional[float] = None
    total_length_meters: Optional[float] = None
    total_length_kilometers: Optional[float] = None

class FileMeasurementResponse(BaseModel):
    id: str
    filename: str
    feature_count: int
    original_crs: Optional[str]
    projected_crs: Optional[str]
    status: FileStatusEnum
    summary: MeasurementSummary
    measurements: List[FeatureMeasurement]
