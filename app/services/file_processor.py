import logging
import os
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Tuple

import geopandas as gpd
import pandas as pd
import pyogrio

logger = logging.getLogger(__name__)

class FileProcessingError(Exception):
    """Custom exception raised when geospatial file processing encounters an error."""
    pass

class FileProcessorService:
    @classmethod
    def _safe_extract_zip(cls, zip_path: str, extract_dir: str) -> None:
        """
        Safely extracts zip contents preventing directory traversal (Zip Slip).
        """
        resolved_extract_dir = os.path.abspath(extract_dir)
        with zipfile.ZipFile(zip_path, 'r') as archive:
            for member in archive.namelist():
                # Avoid dangerous member paths
                member_target = os.path.abspath(os.path.join(resolved_extract_dir, member))
                if not member_target.startswith(resolved_extract_dir):
                    raise FileProcessingError(f"Security error: Archive member '{member}' attempts path traversal.")
            archive.extractall(resolved_extract_dir)

    @classmethod
    def load_shapefile_from_zip(cls, zip_file_path: str) -> gpd.GeoDataFrame:
        """
        Extracts zip file and parses the embedded ESRI Shapefile.
        """
        temp_dir = tempfile.mkdtemp(prefix="shp_extract_")
        try:
            cls._safe_extract_zip(zip_file_path, temp_dir)

            # Locate .shp file inside the extracted tree
            shp_files = list(Path(temp_dir).rglob("*.shp")) + list(Path(temp_dir).rglob("*.SHP"))
            if not shp_files:
                raise FileProcessingError("No .shp file found inside the uploaded ZIP archive.")

            target_shp = str(shp_files[0])
            logger.info("Reading shapefile: %s", target_shp)
            gdf = gpd.read_file(target_shp)

            if gdf is None or len(gdf) == 0:
                raise FileProcessingError("The shapefile contains 0 features.")

            return gdf
        except Exception as e:
            if isinstance(e, FileProcessingError):
                raise
            raise FileProcessingError(f"Failed to parse Shapefile archive: {str(e)}") from e
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    @classmethod
    def load_kml(cls, kml_file_path: str) -> gpd.GeoDataFrame:
        """
        Parses a KML file, inspecting all available layers to combine all features.
        """
        try:
            # Check available layers
            layers = pyogrio.list_layers(kml_file_path)
            if not len(layers):
                raise FileProcessingError("KML file contains no layers.")

            dfs = []
            for layer_info in layers:
                layer_name = layer_info[0]
                try:
                    df = pyogrio.read_dataframe(kml_file_path, layer=layer_name)
                    if len(df) > 0:
                        dfs.append(df)
                except Exception as layer_err:
                    logger.warning("Error reading KML layer '%s': %s", layer_name, layer_err)

            if not dfs:
                raise FileProcessingError("No valid features could be extracted from KML layers.")

            if len(dfs) == 1:
                combined_gdf = dfs[0]
            else:
                combined_gdf = pd.concat(dfs, ignore_index=True)

            if not isinstance(combined_gdf, gpd.GeoDataFrame):
                combined_gdf = gpd.GeoDataFrame(combined_gdf, geometry="geometry")

            # KML standard default CRS is EPSG:4326 if not explicitly set
            if combined_gdf.crs is None:
                combined_gdf.set_crs(epsg=4326, inplace=True)

            return combined_gdf
        except Exception as e:
            if isinstance(e, FileProcessingError):
                raise
            raise FileProcessingError(f"Failed to parse KML file: {str(e)}") from e

    @classmethod
    def process_file(cls, file_path: str, filename: str) -> gpd.GeoDataFrame:
        """
        Processes either a .zip containing a shapefile or a .kml file.
        """
        lower_name = filename.lower()
        if lower_name.endswith(".zip"):
            return cls.load_shapefile_from_zip(file_path)
        elif lower_name.endswith(".kml"):
            return cls.load_kml(file_path)
        else:
            raise FileProcessingError(
                f"Unsupported file format '{filename}'. Allowed formats: .zip (Shapefile) or .kml."
            )
