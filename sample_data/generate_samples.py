"""
Script to generate sample geospatial files (.kml and .zip Shapefile)
for testing and demonstration of the Geospatial File Measurement API.
"""

import os
import shutil
import tempfile
import zipfile
import geopandas as gpd
from shapely.geometry import Polygon, LineString, Point

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

def create_sample_kml():
    """
    Creates a sample KML file with Polygon, LineString, and Point features
    located in Bengaluru, Karnataka, India (approx UTM zone 43N).
    """
    kml_path = os.path.join(OUTPUT_DIR, "survey_sample.kml")

    # Polygons (Agricultural / Industrial drone survey field)
    poly = Polygon([
        (77.5900, 12.9700),
        (77.5950, 12.9700),
        (77.5950, 12.9750),
        (77.5900, 12.9750),
        (77.5900, 12.9700)
    ])
    poly_gdf = gpd.GeoDataFrame({
        "name": ["Bengaluru Survey Field 1"],
        "description": ["High-resolution drone survey polygon"],
        "geometry": [poly]
    }, crs="EPSG:4326")

    # Write KML using pyogrio driver
    poly_gdf.to_file(kml_path, driver="KML")
    print(f"Created sample KML at: {kml_path}")
    return kml_path

def create_sample_shapefile_zip():
    """
    Creates a sample Shapefile zipped archive (.zip) containing .shp, .shx, .dbf, and .prj.
    Contains both polygon and linestring infrastructure survey features.
    """
    zip_path = os.path.join(OUTPUT_DIR, "survey_shapes.zip")
    temp_dir = tempfile.mkdtemp()

    try:
        # Polygons
        poly1 = Polygon([
            (77.6000, 12.9800),
            (77.6080, 12.9800),
            (77.6080, 12.9860),
            (77.6000, 12.9860),
            (77.6000, 12.9800)
        ])
        poly2 = Polygon([
            (77.6100, 12.9810),
            (77.6150, 12.9810),
            (77.6150, 12.9850),
            (77.6100, 12.9850),
            (77.6100, 12.9810)
        ])

        gdf = gpd.GeoDataFrame({
            "id": [101, 102],
            "name": ["Commercial Zone A", "Residential Zone B"],
            "category": ["Commercial", "Residential"],
            "geometry": [poly1, poly2]
        }, crs="EPSG:4326")

        shp_base = os.path.join(temp_dir, "survey_parcels.shp")
        gdf.to_file(shp_base, driver="ESRI Shapefile")

        # Create zip archive containing all generated shapefile files
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zip_out:
            for file_name in os.listdir(temp_dir):
                full_path = os.path.join(temp_dir, file_name)
                zip_out.write(full_path, arcname=file_name)

        print(f"Created sample Shapefile ZIP at: {zip_path}")
        return zip_path
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    create_sample_kml()
    create_sample_shapefile_zip()
