import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.include_router(files.router, prefix=settings.API_PREFIX)

@app.get("/", tags=["Health"])
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.PROJECT_VERSION,
        "status": "healthy",
        "docs_url": "/docs",
    }

@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "ok"}
