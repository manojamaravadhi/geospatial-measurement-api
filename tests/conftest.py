import os
import sys
import pytest
from fastapi.testclient import TestClient

# Add project root to PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app

@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client

@pytest.fixture
def sample_kml_path():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_data", "survey_sample.kml")
    return path

@pytest.fixture
def sample_zip_path():
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_data", "survey_shapes.zip")
    return path
