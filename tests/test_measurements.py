import geopandas as gpd
from shapely.geometry import Point, LineString, Polygon, GeometryCollection
from app.services.measurement_service import MeasurementService
from app.models.schemas import MeasurementTypeEnum

def test_polygon_measurement():
    poly = Polygon([(0, 0), (100, 0), (100, 50), (0, 50), (0, 0)])  # 100m x 50m = 5000 m^2
    gdf = gpd.GeoDataFrame({"name": ["Parcel A"], "geometry": [poly]}, crs="EPSG:32643")

    measurements, summary = MeasurementService.calculate_measurements(gdf, gdf, "EPSG:32643")
    assert len(measurements) == 1
    m = measurements[0]
    assert m.measurement_type == MeasurementTypeEnum.AREA
    assert m.value == 5000.0
    assert m.unit == "sq_meters"
    assert m.formatted_values["hectares"] == 0.5
    assert summary.total_area_sq_meters == 5000.0

def test_linestring_measurement():
    line = LineString([(0, 0), (300, 400)])  # 3-4-5 triangle -> length = 500m
    gdf = gpd.GeoDataFrame({"name": ["Road 1"], "geometry": [line]}, crs="EPSG:32643")

    measurements, summary = MeasurementService.calculate_measurements(gdf, gdf, "EPSG:32643")
    assert len(measurements) == 1
    m = measurements[0]
    assert m.measurement_type == MeasurementTypeEnum.LENGTH
    assert m.value == 500.0
    assert m.unit == "meters"
    assert m.formatted_values["kilometers"] == 0.5
    assert summary.total_length_meters == 500.0

def test_point_handling():
    pt = Point(100, 200)
    gdf = gpd.GeoDataFrame({"name": ["Beacon"], "geometry": [pt]}, crs="EPSG:32643")

    measurements, summary = MeasurementService.calculate_measurements(gdf, gdf, "EPSG:32643")
    assert len(measurements) == 1
    m = measurements[0]
    assert m.measurement_type == MeasurementTypeEnum.NONE
    assert m.value is None
    assert m.unit is None
    assert "Point geometry does not have area or length" in m.note

def test_unsupported_geometry_graceful_handling():
    coll = GeometryCollection([Point(0, 0), LineString([(0, 0), (1, 1)])])
    gdf = gpd.GeoDataFrame({"name": ["Mixed"], "geometry": [coll]}, crs="EPSG:32643")

    measurements, summary = MeasurementService.calculate_measurements(gdf, gdf, "EPSG:32643")
    assert len(measurements) == 1
    m = measurements[0]
    assert m.measurement_type == MeasurementTypeEnum.UNSUPPORTED
    assert m.value is None
    assert "not supported" in m.note.lower()
