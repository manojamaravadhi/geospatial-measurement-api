# Geospatial File Measurement API

A high-performance backend REST API built with **FastAPI**, **GeoPandas**, **PyOGRio**, and **Shapely** to ingest geospatial files (ESRI Shapefile archives and KML files), extract geometries and attributes, re-project them into optimal metric coordinate reference systems, and calculate precise geometric measurements (Area and Length).

---

## Table of Contents
1. [Overview & Features](#overview--features)
2. [Project Structure](#project-structure)
3. [Setup & Installation](#setup--installation)
4. [Running the Application](#running-the-application)
5. [API Documentation](#api-documentation)
   - [Interactive Swagger UI](#interactive-swagger-ui)
   - [Endpoints Specification](#endpoints-specification)
   - [Example Requests & Responses](#example-requests--responses)
6. [Architecture & Pipeline](#architecture--pipeline)
   - [File Processing Flow](#file-processing-flow)
   - [Measurement Calculation Flow](#measurement-calculation-flow)
   - [CRS Handling Strategy](#crs-handling-strategy)
7. [Design Decisions & Alternatives](#design-decisions--alternatives)
8. [Testing](#testing)
9. [Learnings & Future Scope](#learnings--future-scope)

---

## Overview & Features

- **Multi-Format Ingestion**: Supports `.zip` containing complete ESRI Shapefiles (`.shp`, `.shx`, `.dbf`, `.prj`) and `.kml` files (including multi-layer documents).
- **Accurate Metric Calculations**:
  - **Polygon / MultiPolygon**: Area in square meters ($m^2$), hectares ($ha$), and square kilometers ($km^2$).
  - **LineString / MultiLineString**: Length in meters ($m$) and kilometers ($km$).
  - **Point / MultiPoint**: Gracefully handled with descriptive metadata.
  - **Unsupported Geometries**: Handled gracefully without service interruptions.
- **Dynamic CRS Re-projection**: Solves the angular degree problem (EPSG:4326 / WGS84) by automatically calculating the appropriate Universal Transverse Mercator (UTM) zone based on feature bounds and re-projecting geometries before measurement.
- **Security & Integrity**: Protected against Zip Slip directory traversal vulnerabilities, enforces file size validation, and cleans up temporary extraction paths.
- **Automated Test Suite**: 100% pass rate with unit and integration tests across CRS projections, geometries, and REST endpoints.

---

## Project Structure

```text
ASUS_proj/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI application entrypoint & middleware
│   ├── config.py                # Configuration and environment settings
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py           # Pydantic request/response schemas
│   ├── services/
│   │   ├── __init__.py
│   │   ├── crs_service.py       # Dynamic UTM projection & CRS transformations
│   │   ├── file_processor.py    # Shapefile extraction & KML multi-layer parser
│   │   └── measurement_service.py # Area, length, and attribute sanitation
│   ├── routers/
│   │   ├── __init__.py
│   │   └── files.py             # File upload and measurement endpoints
│   └── storage/
│       ├── __init__.py
│       └── file_store.py        # Metadata & measurement persistence store
├── sample_data/
│   ├── generate_samples.py      # Script generating sample .kml and .zip data
│   ├── survey_sample.kml        # Sample KML survey dataset
│   └── survey_shapes.zip        # Sample ESRI Shapefile zipped dataset
├── tests/
│   ├── __init__.py
│   ├── conftest.py              # Test client fixtures and sample paths
│   ├── test_api.py              # End-to-end endpoint tests
│   ├── test_crs.py              # CRS re-projection and unit tests
│   └── test_measurements.py     # Geometry measurement unit tests
├── requirements.txt             # Python dependencies
├── .gitignore                   # Git ignore patterns
└── README.md                    # Project documentation
```

---

## Setup & Installation

### Prerequisites
- Python 3.10+ (tested on Python 3.13)
- `pip` package manager

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd ASUS_proj
```

### 2. Create and activate a virtual environment
```bash
python3 -m venv .venv

# On macOS/Linux:
source .venv/bin/activate

# On Windows:
.venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

---

## Running the Application

### Start the development server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The service will be accessible at:
- **API Base URL**: `http://localhost:8000`
- **Interactive Swagger UI**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`

---

## API Documentation

### Interactive Swagger UI
FastAPI automatically exposes an interactive OpenAPI Swagger UI at `http://localhost:8000/docs`, allowing direct file uploads and live testing from your browser.

---

### Endpoints Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check endpoint |
| `POST` | `/api/files/` | Uploads and processes a `.zip` (Shapefile) or `.kml` |
| `GET` | `/api/files/{id}` | Retrieves file overview, status, feature count, and CRS |
| `GET` | `/api/files/{id}/measurements` | Retrieves per-feature measurements and totals |
| `GET` | `/api/files/` | Lists all uploaded and processed files |

---

### Example Requests & Responses

#### 1. Upload Geospatial File (`POST /api/files/`)
Upload a `.zip` or `.kml` file using `multipart/form-data`:

```bash
curl -X POST "http://localhost:8000/api/files/" \
  -H "accept: application/json" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@sample_data/survey_sample.kml"
```

**Response (`201 Created`):**
```json
{
  "id": "e4f8d9b2",
  "filename": "survey_sample.kml",
  "feature_count": 1,
  "crs": "EPSG:4326",
  "status": "COMPLETED",
  "created_at": "2026-10-08T14:40:00Z",
  "error_message": null
}
```

---

#### 2. Get File Information (`GET /api/files/{id}`)
```bash
curl -X GET "http://localhost:8000/api/files/e4f8d9b2"
```

**Response (`200 OK`):**
```json
{
  "id": "e4f8d9b2",
  "filename": "survey_sample.kml",
  "feature_count": 1,
  "crs": "EPSG:4326",
  "status": "COMPLETED",
  "created_at": "2026-10-08T14:40:00Z",
  "error_message": null
}
```

---

#### 3. Get Feature Measurements (`GET /api/files/{id}/measurements`)
```bash
curl -X GET "http://localhost:8000/api/files/e4f8d9b2/measurements"
```

**Response (`200 OK`):**
```json
{
  "id": "e4f8d9b2",
  "filename": "survey_sample.kml",
  "feature_count": 1,
  "original_crs": "EPSG:4326",
  "projected_crs": "EPSG:32643",
  "status": "COMPLETED",
  "summary": {
    "total_features": 1,
    "geometry_breakdown": {
      "Polygon": 1
    },
    "total_area_sq_meters": 305822.41,
    "total_area_hectares": 30.5822,
    "total_length_meters": 0.0,
    "total_length_kilometers": 0.0
  },
  "measurements": [
    {
      "feature_id": 0,
      "geometry_type": "Polygon",
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [77.59, 12.97],
            [77.595, 12.97],
            [77.595, 12.975],
            [77.59, 12.975],
            [77.59, 12.97]
          ]
        ]
      },
      "crs": "EPSG:32643",
      "properties": {
        "name": "Bengaluru Survey Field 1",
        "description": "High-resolution drone survey polygon"
      },
      "measurement_type": "area",
      "value": 305822.41,
      "unit": "sq_meters",
      "formatted_values": {
        "sq_meters": 305822.41,
        "hectares": 30.5822,
        "sq_kilometers": 0.305822
      },
      "note": null
    }
  ]
}
```

---

## Architecture & Pipeline

### File Processing Flow
1. **Validation**: Checks file extension (`.zip` or `.kml`) and validates file size.
2. **Safe Extraction / Loading**:
   - For `.zip`: Safely extracted to a sandboxed temporary directory with canonical path checks preventing directory traversal (Zip Slip). Finds and parses `.shp` components.
   - For `.kml`: Inspects all internal layers using PyOGRio to ensure multi-folder/multi-layer documents are completely captured.
3. **Attribute Sanitization**: Cleans NumPy types, timestamps, and metadata to ensure compliant JSON serializability.
4. **Cleanup**: Temporary extraction files and disk caches are removed after processing.

### Measurement Calculation Flow
1. **Geometry Inspection**: Checks geometry types for each feature (Polygon, LineString, Point, or unsupported types).
2. **Projected Computation**:
   - Polygon / MultiPolygon $\rightarrow$ Projected planar area in $m^2$.
   - LineString / MultiLineString $\rightarrow$ Projected planar length in meters.
   - Point / MultiPoint $\rightarrow$ Marked as `none` (no measurement required).
   - Unsupported / Corrupted Geometries $\rightarrow$ Handled gracefully with descriptive messages without failing the request.
3. **Unit Conversion**: Converts metrics to customary geospatial units ($ha$, $km^2$, $km$).

### CRS Handling Strategy
#### The Angular Coordinates Problem
Geographic coordinate systems (such as `EPSG:4326 - WGS84`) define locations in angular degrees (latitude and longitude). Computing Euclidean area ($\Delta x \cdot \Delta y$) directly on degree values yields meaningless figures (square degrees vary drastically depending on distance from the equator).

#### The Solution: Dynamic UTM Re-Projection
1. If the input dataset already uses a metric projected coordinate system (e.g., local state plane or UTM), the service preserves it.
2. If the data is geographic (EPSG:4326 or unspecified):
   - Computes the bounding box and centroid of the dataset.
   - Identifies the optimal **Universal Transverse Mercator (UTM)** zone:
     $$\text{zone} = \left\lfloor \frac{\text{longitude} + 180}{6} \right\rfloor + 1$$
     $$\text{EPSG Code} = \begin{cases} 32600 + \text{zone} & \text{if latitude} \ge 0 \text{ (Northern Hemisphere)} \\ 32700 + \text{zone} & \text{if latitude} < 0 \text{ (Southern Hemisphere)} \end{cases}$$
   - Uses `pyproj` and `geopandas.to_crs()` to re-project geometries into the selected Cartesian coordinate system.
   - Fallback: In cases of extreme planetary extents, falls back to equal-area projections (e.g., EPSG:6933).

---

## Design Decisions & Alternatives

1. **FastAPI vs. Django REST Framework**:
   - *Chosen*: FastAPI.
   - *Rationale*: Higher throughput, native async support, automated OpenAPI/Swagger documentation, and minimal boilerplate compared to Django.
2. **PyOGRio & GeoPandas vs. Direct GDAL Bindings**:
   - *Chosen*: GeoPandas backed by PyOGRio.
   - *Rationale*: Modern pre-compiled binary wheels with built-in GDAL/GEOS support, eliminating brittle C++ system-level compilation dependencies while maintaining native C-level I/O speeds.
3. **File Storage Architecture**:
   - A dual-layer persistence strategy: in-memory caching for immediate fast retrieval alongside lightweight structured JSON metadata persistence in `uploads/`. This avoids heavyweight database overhead while remaining simple to inspect and portable.

---

## Testing

Execute the test suite with `pytest`:
```bash
pytest -v
```

### Test Coverage includes:
- **Endpoint Tests**: `POST /api/files/`, `GET /api/files/{id}`, `GET /api/files/{id}/measurements`, 400 Bad Request, 404 Not Found.
- **CRS Projection Tests**: Northern hemisphere UTM, Southern hemisphere UTM, and degree vs. meter area comparison.
- **Measurement Logic**: Polygons, LineStrings, Points, and graceful handling of unsupported geometry types.

---

## Learnings & Future Scope

### Key Learnings
- **Geospatial Precision**: Reinforcing the distinction between ellipsoidal geodesy and planar conformal projections (such as UTM), and the necessity of re-projection prior to computing physical measurements.
- **Robust File Ingestion**: Real-world KML files often contain heterogeneous geometry layers across nested folder trees, requiring layer iteration rather than assuming a single flat layer.
- **Defensive API Design**: Designing geospatial endpoints to gracefully handle corrupted shapes or non-measureable types without failing the entire batch upload.

### Future Scope
- **Asynchronous Task Queue**: Integrate Celery or Redis Queue for processing large geospatial archives (>100MB / millions of vertices) asynchronously.
- **Geodesic Calculations**: Support direct ellipsoidal geodesic area calculations (using Karney's algorithms via GeographicLib) alongside UTM planar projections.
- **Cloud Object Storage**: Add S3/GCS blob adapters for file ingestion and PostGIS database integration for spatial indexing and querying.
- **Raster File Support**: Expand support to GeoTIFF elevation and orthomosaic raster files to compute volume and slope measurements.
