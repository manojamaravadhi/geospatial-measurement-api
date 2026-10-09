import logging
import os
import shutil
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple

import geopandas as gpd
import pandas as pd
import pyogrio
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Point, Polygon

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

    @staticmethod
    def _parse_coords_string(text: Optional[str]) -> List[Tuple[float, float]]:
        if not text:
            return []
        coords: List[Tuple[float, float]] = []
        for raw in text.strip().split():
            parts = raw.split(',')
            if len(parts) >= 2:
                try:
                    lon = float(parts[0])
                    lat = float(parts[1])
                    coords.append((lon, lat))
                except (ValueError, TypeError):
                    continue
        return coords

    @classmethod
    def _parse_kml_via_xml(cls, kml_file_path: str) -> Optional[gpd.GeoDataFrame]:
        """
        Robust XML fallback parser that extracts all Placemarks and geometric features
        directly from the XML tree without relying on GDAL layer drivers.
        """
        try:
            tree = ET.parse(kml_file_path)
            root = tree.getroot()
        except Exception as e:
            logger.warning("XML parse error on %s: %s", kml_file_path, e)
            return None

        features = []

        # Find all Placemark tags regardless of XML namespace
        for elem in root.iter():
            tag = elem.tag.split('}')[-1]
            if tag != 'Placemark':
                continue

            name = ""
            desc = ""
            props = {}
            geom = None

            # Extract basic metadata
            for child in elem:
                ctag = child.tag.split('}')[-1]
                if ctag == 'name' and child.text and not name:
                    name = child.text.strip()
                elif ctag == 'description' and child.text and not desc:
                    desc = child.text.strip()
                elif ctag == 'ExtendedData':
                    for data in child.iter():
                        dtag = data.tag.split('}')[-1]
                        if dtag in ('Data', 'SimpleData'):
                            dname = data.get('name') or dtag
                            dval = data.find('{*}value') if data.find('{*}value') is not None else data
                            if dname and dval.text:
                                props[dname] = dval.text.strip()

            # 1. Search for Polygon
            for sub in elem.iter():
                stag = sub.tag.split('}')[-1]
                if stag == 'Polygon':
                    outer_coords = []
                    for ob in sub.iter():
                        if ob.tag.split('}')[-1] == 'outerBoundaryIs':
                            for crd in ob.iter():
                                if crd.tag.split('}')[-1] == 'coordinates':
                                    outer_coords = cls._parse_coords_string(crd.text)
                                    break
                    if len(outer_coords) >= 3:
                        geom = Polygon(outer_coords)
                        break

            # 2. Search for LineString if no polygon
            if geom is None:
                for sub in elem.iter():
                    stag = sub.tag.split('}')[-1]
                    if stag == 'LineString':
                        for crd in sub.iter():
                            if crd.tag.split('}')[-1] == 'coordinates':
                                coords = cls._parse_coords_string(crd.text)
                                if len(coords) >= 2:
                                    geom = LineString(coords)
                                    break
                        if geom is not None:
                            break

            # 3. Search for Point if no line
            if geom is None:
                for sub in elem.iter():
                    stag = sub.tag.split('}')[-1]
                    if stag == 'Point':
                        for crd in sub.iter():
                            if crd.tag.split('}')[-1] == 'coordinates':
                                coords = cls._parse_coords_string(crd.text)
                                if len(coords) >= 1:
                                    geom = Point(coords[0])
                                    break
                        if geom is not None:
                            break

            if geom is not None:
                row_data = {
                    "geometry": geom,
                    "name": name or f"Feature {len(features) + 1}",
                }
                if desc:
                    row_data["description"] = desc
                row_data.update(props)
                features.append(row_data)

        if not features:
            return None

        gdf = gpd.GeoDataFrame(features, crs="EPSG:4326")
        return gdf

    @classmethod
    def load_kml(cls, kml_file_path: str) -> gpd.GeoDataFrame:
        """
        Parses a KML file with multi-strategy resilience:
        1. Checks for KMZ (zipped archive)
        2. Inspects pyogrio OGR layers
        3. Attempts direct geopandas read
        4. Employs pure XML ElementTree fallback
        """
        # Step 0: Check if file is a KMZ disguised as .kml
        if zipfile.is_zipfile(kml_file_path):
            temp_kmz_dir = tempfile.mkdtemp(prefix="kmz_extract_")
            try:
                cls._safe_extract_zip(kml_file_path, temp_kmz_dir)
                kml_in_zip = list(Path(temp_kmz_dir).rglob("*.kml")) + list(Path(temp_kmz_dir).rglob("*.KML"))
                if kml_in_zip:
                    return cls.load_kml(str(kml_in_zip[0]))
            finally:
                shutil.rmtree(temp_kmz_dir, ignore_errors=True)

        # Strategy 1: pyogrio layer discovery
        try:
            layers = pyogrio.list_layers(kml_file_path)
            if len(layers) > 0:
                dfs = []
                for layer_info in layers:
                    layer_name = layer_info[0]
                    try:
                        df = pyogrio.read_dataframe(kml_file_path, layer=layer_name)
                        if len(df) > 0:
                            dfs.append(df)
                    except Exception as layer_err:
                        logger.debug("Error reading layer %s: %s", layer_name, layer_err)

                if dfs:
                    combined = dfs[0] if len(dfs) == 1 else pd.concat(dfs, ignore_index=True)
                    if not isinstance(combined, gpd.GeoDataFrame):
                        combined = gpd.GeoDataFrame(combined, geometry="geometry")
                    if combined.crs is None:
                        combined.set_crs(epsg=4326, inplace=True)
                    if len(combined) > 0:
                        return combined
        except Exception as pyogrio_err:
            logger.debug("Strategy 1 (pyogrio) failed: %s", pyogrio_err)

        # Strategy 2: Direct geopandas read
        try:
            gdf_direct = gpd.read_file(kml_file_path)
            if gdf_direct is not None and len(gdf_direct) > 0:
                if gdf_direct.crs is None:
                    gdf_direct.set_crs(epsg=4326, inplace=True)
                return gdf_direct
        except Exception as direct_err:
            logger.debug("Strategy 2 (geopandas direct) failed: %s", direct_err)

        # Strategy 3: Native XML Placemark Parser
        xml_gdf = cls._parse_kml_via_xml(kml_file_path)
        if xml_gdf is not None and len(xml_gdf) > 0:
            return xml_gdf

        # If all strategies found no features
        raise FileProcessingError(
            "The uploaded KML file contains no valid geographic features or placemarks. "
            "Please check that the file includes polygon, line, or point geometries."
        )

    @classmethod
    def process_file(cls, file_path: str, filename: str) -> gpd.GeoDataFrame:
        """
        Processes either a .zip containing a shapefile or a .kml file.
        """
        lower_name = filename.lower()
        if lower_name.endswith(".zip"):
            # Check if this zip is actually a KMZ
            if zipfile.is_zipfile(file_path):
                with zipfile.ZipFile(file_path, 'r') as z:
                    names = [n.lower() for n in z.namelist()]
                    if any(n.endswith(".kml") for n in names) and not any(n.endswith(".shp") for n in names):
                        return cls.load_kml(file_path)
            return cls.load_shapefile_from_zip(file_path)
        elif lower_name.endswith(".kml") or lower_name.endswith(".kmz"):
            return cls.load_kml(file_path)
        else:
            raise FileProcessingError(
                f"Unsupported file format '{filename}'. Allowed formats: .zip (Shapefile) or .kml."
            )
