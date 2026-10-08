import os

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_upload_kml_file(client, sample_kml_path):
    assert os.path.exists(sample_kml_path), "Sample KML file does not exist"
    with open(sample_kml_path, "rb") as f:
        response = client.post(
            "/api/files/",
            files={"file": ("survey_sample.kml", f, "application/vnd.google-earth.kml+xml")},
        )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["filename"] == "survey_sample.kml"
    assert data["status"] == "COMPLETED"
    assert data["feature_count"] >= 1
    assert data["crs"] is not None

    file_id = data["id"]

    # Test GET /api/files/{id}/
    info_resp = client.get(f"/api/files/{file_id}")
    assert info_resp.status_code == 200
    info_data = info_resp.json()
    assert info_data["id"] == file_id
    assert info_data["feature_count"] == data["feature_count"]

    # Test GET /api/files/{id}/measurements/
    meas_resp = client.get(f"/api/files/{file_id}/measurements")
    assert meas_resp.status_code == 200
    meas_data = meas_resp.json()
    assert meas_data["id"] == file_id
    assert "projected_crs" in meas_data
    assert len(meas_data["measurements"]) == data["feature_count"]
    # Check that measurements are computed
    first_feat = meas_data["measurements"][0]
    assert first_feat["measurement_type"] == "area"
    assert first_feat["value"] > 0
    assert first_feat["unit"] == "sq_meters"
    assert "hectares" in first_feat["formatted_values"]

def test_upload_shapefile_zip(client, sample_zip_path):
    assert os.path.exists(sample_zip_path), "Sample ZIP file does not exist"
    with open(sample_zip_path, "rb") as f:
        response = client.post(
            "/api/files/",
            files={"file": ("survey_shapes.zip", f, "application/zip")},
        )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["filename"] == "survey_shapes.zip"
    assert data["status"] == "COMPLETED"
    assert data["feature_count"] == 2

    file_id = data["id"]
    meas_resp = client.get(f"/api/files/{file_id}/measurements")
    assert meas_resp.status_code == 200
    meas_data = meas_resp.json()
    assert meas_data["summary"]["total_features"] == 2
    assert meas_data["summary"]["total_area_sq_meters"] > 0

def test_upload_invalid_file_extension(client):
    response = client.post(
        "/api/files/",
        files={"file": ("notes.txt", b"plain text", "text/plain")},
    )
    assert response.status_code == 400
    assert "Unsupported file format" in response.json()["detail"]

def test_get_nonexistent_file(client):
    response = client.get("/api/files/nonexistent-id")
    assert response.status_code == 404
