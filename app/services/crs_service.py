import logging
from typing import Any, Optional, Tuple
import geopandas as gpd
from pyproj import CRS

logger = logging.getLogger(__name__)

class CRSService:
    @staticmethod
    def normalize_crs(crs_input: Optional[Any]) -> Optional[CRS]:
        if crs_input is None:
            return None
        try:
            return CRS.from_user_input(crs_input)
        except Exception as e:
            logger.warning("Failed to parse CRS '%s': %s", crs_input, e)
            return None

    @classmethod
    def determine_projected_crs(cls, gdf: gpd.GeoDataFrame) -> CRS:
        """
        Determines the optimal metric projected CRS for accurate measurement computation.
        If the data is in degrees (EPSG:4326 or other geographic CRS), dynamically calculates
        the appropriate Universal Transverse Mercator (UTM) zone based on bounds/centroid.
        """
        current_crs = gdf.crs

        # If CRS is not defined, default to EPSG:4326 (WGS84) as standard geospatial convention
        if current_crs is None:
            logger.info("CRS undefined. Defaulting to EPSG:4326 for projection calculation.")
            current_crs = CRS.from_epsg(4326)
            gdf.set_crs(current_crs, inplace=True)

        # If already a projected CRS with meter units, keep it
        if current_crs.is_projected:
            # Check axis units
            units = current_crs.axis_info[0].unit_name.lower() if current_crs.axis_info else ""
            if "metre" in units or "meter" in units:
                return current_crs

        # 1. Attempt GeoPandas automated UTM estimation (leverages PROJ under the hood)
        try:
            estimated_crs = gdf.estimate_utm_crs()
            if estimated_crs is not None:
                return estimated_crs
        except Exception as e:
            logger.debug("Automatic estimate_utm_crs failed: %s. Using manual UTM calculation.", e)

        # 2. Fallback: Manual UTM Zone calculation based on centroid
        try:
            # Ensure coordinates are in WGS84 to read lon/lat
            wgs84_gdf = gdf.to_crs(epsg=4326) if current_crs.to_epsg() != 4326 else gdf
            total_bounds = wgs84_gdf.total_bounds  # (minx, miny, maxx, maxy)
            center_lon = (total_bounds[0] + total_bounds[2]) / 2.0
            center_lat = (total_bounds[1] + total_bounds[3]) / 2.0

            utm_zone = int((center_lon + 180) / 6) + 1
            utm_zone = max(1, min(60, utm_zone))

            epsg_code = 32600 + utm_zone if center_lat >= 0 else 32700 + utm_zone
            return CRS.from_epsg(epsg_code)
        except Exception as fallback_err:
            logger.warning("Fallback UTM calculation failed: %s. Falling back to World Cylindrical Equal Area (EPSG:6933).", fallback_err)
            return CRS.from_epsg(6933)

    @classmethod
    def reproject_to_metric(cls, gdf: gpd.GeoDataFrame) -> Tuple[gpd.GeoDataFrame, str, str]:
        """
        Reprojects the given GeoDataFrame to an optimal metric projected CRS.
        Returns:
            Tuple[projected_gdf, original_crs_str, projected_crs_str]
        """
        original_crs_str = gdf.crs.to_string() if gdf.crs else "EPSG:4326 (assumed)"
        projected_crs = cls.determine_projected_crs(gdf)
        projected_crs_str = f"EPSG:{projected_crs.to_epsg()}" if projected_crs.to_epsg() else projected_crs.to_string()

        # Reproject
        projected_gdf = gdf.to_crs(projected_crs)
        return projected_gdf, original_crs_str, projected_crs_str
