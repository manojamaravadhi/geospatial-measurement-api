import logging
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import files

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.PROJECT_VERSION,
    description="""
# Geospatial File Measurement API
A production-ready service to process geospatial files (`.zip` Shapefiles and `.kml`),
extract geometric features, dynamically re-project coordinates into optimal projected CRS,
and calculate precise metric measurements (Area and Length).

### Supported Formats
* **Shapefile (.zip)**: ESRI Shapefile archive containing `.shp`, `.shx`, `.dbf`, `.prj`.
* **KML (.kml)**: Keyhole Markup Language with single or multi-layer geometries.

### CRS Handling Strategy
Calculations are never performed in angular degrees (EPSG:4326). Coordinates are dynamically
transformed to the optimal metric UTM zone or projected CRS before computing area and length.
    """,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware for open integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Routers
app.include_router(files.router, prefix=settings.API_PREFIX)

# Mount static assets
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/static", StaticFiles(directory=str(static_path)), name="static")

@app.get("/", tags=["Dashboard UI"])
async def dashboard_ui():
    """Serves the interactive Geospatial Measurement Studio UI."""
    index_file = static_path / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.PROJECT_VERSION,
        "status": "healthy",
        "docs_url": "/docs",
    }

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
