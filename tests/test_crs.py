import geopandas as gpd
from shapely.geometry import Point, Polygon
from app.services.crs_service import CRSService

def test_crs_utm_estimation_northern_hemisphere():
    # Bengaluru coordinates (~77.59 E, 12.97 N) -> UTM Zone 43N (EPSG:32643)
    gdf = gpd.GeoDataFrame({
        "name": ["Test Point"],
        "geometry": [Point(77.59, 12.97)]
    }, crs="EPSG:4326")

    projected_gdf, orig_crs, proj_crs = CRSService.reproject_to_metric(gdf)
    assert "4326" in orig_crs
    assert "32643" in proj_crs
    assert projected_gdf.crs.is_projected is True

def test_crs_utm_estimation_southern_hemisphere():
    # Sydney coordinates (~151.2 E, -33.86 S) -> UTM Zone 56S (EPSG:32756)
    gdf = gpd.GeoDataFrame({
        "name": ["Sydney Point"],
        "geometry": [Point(151.2, -33.86)]
    }, crs="EPSG:4326")

    projected_gdf, orig_crs, proj_crs = CRSService.reproject_to_metric(gdf)
    assert "4326" in orig_crs
    assert "32756" in proj_crs
    assert projected_gdf.crs.is_projected is True

def test_polygon_area_in_meters_vs_degrees():
    # Polygon ~ 500m x 500m in Bengaluru
    poly = Polygon([
        (77.5900, 12.9700),
        (77.5950, 12.9700),
        (77.5950, 12.9750),
        (77.5900, 12.9750),
        (77.5900, 12.9700)
    ])
    gdf = gpd.GeoDataFrame({"geometry": [poly]}, crs="EPSG:4326")

    # Raw degree area is ~ 0.000025 sq degrees (meaningless in real world)
    degree_area = poly.area
    assert degree_area < 0.001

    # Projected metric area
    projected_gdf, _, _ = CRSService.reproject_to_metric(gdf)
    metric_area = projected_gdf.iloc[0].geometry.area

    # ~ 500m x 550m = ~ 250,000 to 350,000 m^2
    assert 200_000 < metric_area < 400_000
