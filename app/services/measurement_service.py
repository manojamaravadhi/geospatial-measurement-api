import logging
from typing import Any, Dict, List, Tuple
import geopandas as gpd
from shapely.geometry import mapping
from app.models.schemas import (
    FeatureMeasurement,
    MeasurementSummary,
    MeasurementTypeEnum,
)

logger = logging.getLogger(__name__)

class MeasurementService:
    @staticmethod
    def _clean_properties(row_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize row attributes for JSON serialization.
        Removes geometry column and converts timestamps/numpy types to Python natives.
        """
        cleaned = {}
        for k, v in row_dict.items():
            if k == "geometry":
                continue
            if v is None:
                cleaned[k] = None
            elif hasattr(v, "isoformat"):  # datetime / date / timestamp
                cleaned[k] = v.isoformat()
            elif hasattr(v, "item"):  # numpy scalars
                try:
                    cleaned[k] = v.item()
                except Exception:
                    cleaned[k] = str(v)
            elif isinstance(v, (str, int, float, bool, list, dict)):
                cleaned[k] = v
            else:
                cleaned[k] = str(v)
        return cleaned

    @classmethod
    def calculate_measurements(
        cls,
        original_gdf: gpd.GeoDataFrame,
        projected_gdf: gpd.GeoDataFrame,
        projected_crs_str: str,
    ) -> Tuple[List[FeatureMeasurement], MeasurementSummary]:
        """
        Calculates measurements on projected geometries while preserving
        original geometry definitions and attributes.
        """
        measurements: List[FeatureMeasurement] = []
        geom_breakdown: Dict[str, int] = {}
        total_area_sq_m = 0.0
        total_len_m = 0.0

        for idx in range(len(original_gdf)):
            orig_row = original_gdf.iloc[idx]
            proj_row = projected_gdf.iloc[idx]

            orig_geom = orig_row.geometry
            proj_geom = proj_row.geometry

            properties = cls._clean_properties(orig_row.to_dict())

            if orig_geom is None or orig_geom.is_empty:
                geom_type = "Empty"
                geom_breakdown[geom_type] = geom_breakdown.get(geom_type, 0) + 1
                measurements.append(
                    FeatureMeasurement(
                        feature_id=idx,
                        geometry_type="Empty",
                        geometry=None,
                        crs=projected_crs_str,
                        properties=properties,
                        measurement_type=MeasurementTypeEnum.NONE,
                        value=None,
                        unit=None,
                        formatted_values=None,
                        note="Feature contains empty or missing geometry",
                    )
                )
                continue

            geom_type = orig_geom.geom_type
            geom_breakdown[geom_type] = geom_breakdown.get(geom_type, 0) + 1
            geo_json_mapping = mapping(orig_geom)

            # Calculation based on geometry type
            if geom_type in ("Polygon", "MultiPolygon"):
                try:
                    area_sq_m = float(proj_geom.area)
                    area_sq_m = round(area_sq_m, 4)
                    total_area_sq_m += area_sq_m

                    measurements.append(
                        FeatureMeasurement(
                            feature_id=idx,
                            geometry_type=geom_type,
                            geometry=geo_json_mapping,
                            crs=projected_crs_str,
                            properties=properties,
                            measurement_type=MeasurementTypeEnum.AREA,
                            value=area_sq_m,
                            unit="sq_meters",
                            formatted_values={
                                "sq_meters": area_sq_m,
                                "hectares": round(area_sq_m / 10000.0, 4),
                                "sq_kilometers": round(area_sq_m / 1_000_000.0, 6),
                            },
                            note=None,
                        )
                    )
                except Exception as e:
                    logger.error("Error calculating area for feature %s: %s", idx, e)
                    measurements.append(
                        FeatureMeasurement(
                            feature_id=idx,
                            geometry_type=geom_type,
                            geometry=geo_json_mapping,
                            crs=projected_crs_str,
                            properties=properties,
                            measurement_type=MeasurementTypeEnum.UNSUPPORTED,
                            value=None,
                            unit=None,
                            formatted_values=None,
                            note=f"Error calculating area: {str(e)}",
                        )
                    )

            elif geom_type in ("LineString", "MultiLineString"):
                try:
                    length_m = float(proj_geom.length)
                    length_m = round(length_m, 4)
                    total_len_m += length_m

                    measurements.append(
                        FeatureMeasurement(
                            feature_id=idx,
                            geometry_type=geom_type,
                            geometry=geo_json_mapping,
                            crs=projected_crs_str,
                            properties=properties,
                            measurement_type=MeasurementTypeEnum.LENGTH,
                            value=length_m,
                            unit="meters",
                            formatted_values={
                                "meters": length_m,
                                "kilometers": round(length_m / 1000.0, 4),
                            },
                            note=None,
                        )
                    )
                except Exception as e:
                    logger.error("Error calculating length for feature %s: %s", idx, e)
                    measurements.append(
                        FeatureMeasurement(
                            feature_id=idx,
                            geometry_type=geom_type,
                            geometry=geo_json_mapping,
                            crs=projected_crs_str,
                            properties=properties,
                            measurement_type=MeasurementTypeEnum.UNSUPPORTED,
                            value=None,
                            unit=None,
                            formatted_values=None,
                            note=f"Error calculating length: {str(e)}",
                        )
                    )

            elif geom_type in ("Point", "MultiPoint"):
                measurements.append(
                    FeatureMeasurement(
                        feature_id=idx,
                        geometry_type=geom_type,
                        geometry=geo_json_mapping,
                        crs=projected_crs_str,
                        properties=properties,
                        measurement_type=MeasurementTypeEnum.NONE,
                        value=None,
                        unit=None,
                        formatted_values=None,
                        note="Point geometry does not have area or length measurements",
                    )
                )

            else:
                # Unsupported geometry type handled gracefully without crashing
                measurements.append(
                    FeatureMeasurement(
                        feature_id=idx,
                        geometry_type=geom_type,
                        geometry=geo_json_mapping,
                        crs=projected_crs_str,
                        properties=properties,
                        measurement_type=MeasurementTypeEnum.UNSUPPORTED,
                        value=None,
                        unit=None,
                        formatted_values=None,
                        note=f"Measurement not supported for geometry type '{geom_type}'. Handled gracefully.",
                    )
                )

        summary = MeasurementSummary(
            total_features=len(original_gdf),
            geometry_breakdown=geom_breakdown,
            total_area_sq_meters=round(total_area_sq_m, 4) if total_area_sq_m > 0 else 0.0,
            total_area_hectares=round(total_area_sq_m / 10000.0, 4) if total_area_sq_m > 0 else 0.0,
            total_length_meters=round(total_len_m, 4) if total_len_m > 0 else 0.0,
            total_length_kilometers=round(total_len_m / 1000.0, 4) if total_len_m > 0 else 0.0,
        )

        return measurements, summary
