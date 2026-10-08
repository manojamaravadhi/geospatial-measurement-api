// AEREO Geospatial Measurement Studio Frontend Controller

document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const uploadLoader = document.getElementById("uploadLoader");
  const btnDemoKml = document.getElementById("btnDemoKml");
  const btnDemoShp = document.getElementById("btnDemoShp");
  const fileSelect = document.getElementById("fileSelect");
  const alertBanner = document.getElementById("alertBanner");
  const alertMessage = document.getElementById("alertMessage");
  const alertClose = document.getElementById("alertClose");

  // Metrics
  const valTotalFeatures = document.getElementById("valTotalFeatures");
  const subFeatureBreakdown = document.getElementById("subFeatureBreakdown");
  const valTotalArea = document.getElementById("valTotalArea");
  const subTotalHectares = document.getElementById("subTotalHectares");
  const valTotalLength = document.getElementById("valTotalLength");
  const subTotalKm = document.getElementById("subTotalKm");
  const valProjectedCrs = document.getElementById("valProjectedCrs");
  const subOriginalCrs = document.getElementById("subOriginalCrs");

  // Table & Filters
  const featuresTableBody = document.getElementById("featuresTableBody");
  const filterTabs = document.getElementById("filterTabs");
  const countAll = document.getElementById("countAll");
  const countPoly = document.getElementById("countPoly");
  const countLine = document.getElementById("countLine");
  const countPoint = document.getElementById("countPoint");

  // Map Controls & Modal
  const btnFitMap = document.getElementById("btnFitMap");
  const btnViewJson = document.getElementById("btnViewJson");
  const jsonModal = document.getElementById("jsonModal");
  const closeModal = document.getElementById("closeModal");
  const jsonCodeViewer = document.getElementById("jsonCodeViewer");

  // State
  let currentMeasurementsData = null;
  let activeFilter = "ALL";
  let mapLayers = [];

  // Initialize Leaflet Map
  const map = L.map("map", {
    zoomControl: true,
  }).setView([12.9716, 77.5946], 12); // Default center Bengaluru

  // CartoDB Dark Matter Basemap
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a>, OpenStreetMap contributors',
    maxZoom: 20,
    subdomains: "abcd",
  }).addTo(map);

  const geoJsonLayerGroup = L.featureGroup().addTo(map);

  // --- API Functions ---
  async function fetchFileList() {
    try {
      const res = await fetch("/api/files/");
      if (!res.ok) return;
      const files = await res.json();
      fileSelect.innerHTML = '<option value="" disabled selected>Select processed file...</option>';
      files.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${f.filename} (${f.feature_count} features)`;
        fileSelect.appendChild(opt);
      });
      // Automatically load the latest file if available
      if (files.length > 0) {
        fileSelect.value = files[files.length - 1].id;
        loadFileMeasurements(files[files.length - 1].id);
      }
    } catch (err) {
      console.warn("Could not fetch file list:", err);
    }
  }

  async function uploadFile(file) {
    showAlert(null); // Clear errors
    showLoader(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/files/", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "File processing failed.");
      }

      const fileInfo = await res.json();
      await fetchFileList();
      fileSelect.value = fileInfo.id;
      await loadFileMeasurements(fileInfo.id);
    } catch (err) {
      showAlert(err.message);
    } finally {
      showLoader(false);
    }
  }

  async function loadDemo(type) {
    showAlert(null);
    showLoader(true);
    try {
      const res = await fetch(`/api/files/demo/${type}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Demo loading failed.");
      }
      const fileInfo = await res.json();
      await fetchFileList();
      fileSelect.value = fileInfo.id;
      await loadFileMeasurements(fileInfo.id);
    } catch (err) {
      showAlert(err.message);
    } finally {
      showLoader(false);
    }
  }

  async function loadFileMeasurements(fileId) {
    showLoader(true);
    try {
      const res = await fetch(`/api/files/${fileId}/measurements`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to load measurements.");
      }
      currentMeasurementsData = await res.json();
      renderDashboard(currentMeasurementsData);
    } catch (err) {
      showAlert(err.message);
    } finally {
      showLoader(false);
    }
  }

  // --- Rendering UI ---
  function renderDashboard(data) {
    // 1. Update Metrics
    valTotalFeatures.textContent = data.feature_count.toLocaleString();
    const bd = data.summary.geometry_breakdown || {};
    const bdStr = Object.entries(bd)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" • ");
    subFeatureBreakdown.textContent = bdStr || "No geometry breakdown";

    // Area
    if (data.summary.total_area_sq_meters > 0) {
      valTotalArea.textContent = `${data.summary.total_area_sq_meters.toLocaleString()} m²`;
      subTotalHectares.textContent = `${data.summary.total_area_hectares.toLocaleString()} hectares`;
    } else {
      valTotalArea.textContent = "0 m²";
      subTotalHectares.textContent = "0.00 hectares";
    }

    // Length
    if (data.summary.total_length_meters > 0) {
      valTotalLength.textContent = `${data.summary.total_length_meters.toLocaleString()} m`;
      subTotalKm.textContent = `${data.summary.total_length_kilometers.toLocaleString()} km`;
    } else {
      valTotalLength.textContent = "0 m";
      subTotalKm.textContent = "0.00 km";
    }

    // CRS
    valProjectedCrs.textContent = data.projected_crs || "N/A";
    subOriginalCrs.textContent = `Source: ${data.original_crs || "Unknown"}`;

    // 2. Counts for Filter Tabs
    countAll.textContent = data.measurements.length;
    countPoly.textContent = (bd["Polygon"] || 0) + (bd["MultiPolygon"] || 0);
    countLine.textContent = (bd["LineString"] || 0) + (bd["MultiLineString"] || 0);
    countPoint.textContent = (bd["Point"] || 0) + (bd["MultiPoint"] || 0);

    // 3. Render Map Layers
    renderMapFeatures(data.measurements);

    // 4. Render Table
    renderTable(data.measurements);
  }

  function renderMapFeatures(measurements) {
    geoJsonLayerGroup.clearLayers();
    mapLayers = [];

    measurements.forEach((item, idx) => {
      if (!item.geometry) return;

      const geoJsonFeature = {
        type: "Feature",
        geometry: item.geometry,
        properties: item.properties,
      };

      const isPoly = item.geometry_type.includes("Polygon");
      const isLine = item.geometry_type.includes("Line");
      const isPoint = item.geometry_type.includes("Point");

      const style = {
        color: isPoly ? "#10b981" : isLine ? "#f59e0b" : "#38bdf8",
        weight: 3,
        opacity: 0.9,
        fillColor: isPoly ? "#10b981" : "#38bdf8",
        fillOpacity: isPoly ? 0.25 : 0.6,
      };

      let layer;
      if (isPoint) {
        const coords = item.geometry.coordinates;
        layer = L.circleMarker([coords[1], coords[0]], {
          radius: 7,
          ...style,
        });
      } else {
        layer = L.geoJSON(geoJsonFeature, { style });
      }

      // Popup Content
      let measHtml = "";
      if (item.measurement_type === "area") {
        measHtml = `<div><strong>Area:</strong> ${item.value.toLocaleString()} m² (${item.formatted_values.hectares} ha)</div>`;
      } else if (item.measurement_type === "length") {
        measHtml = `<div><strong>Length:</strong> ${item.value.toLocaleString()} m (${item.formatted_values.kilometers} km)</div>`;
      }

      const propHtml = Object.entries(item.properties)
        .slice(0, 3)
        .map(([k, v]) => `<div><small>${k}:</small> ${v}</div>`)
        .join("");

      layer.bindPopup(`
        <div style="font-family: inherit;">
          <h4 style="margin: 0 0 6px 0; color: #38bdf8;">Feature #${item.feature_id} (${item.geometry_type})</h4>
          ${measHtml}
          <div style="margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px;">
            ${propHtml || "<em>No properties</em>"}
          </div>
        </div>
      `);

      layer.on("click", () => {
        highlightTableRow(item.feature_id);
      });

      geoJsonLayerGroup.addLayer(layer);
      mapLayers.push({ id: item.feature_id, layer });
    });

    fitMapToBounds();
  }

  function fitMapToBounds() {
    if (geoJsonLayerGroup.getLayers().length > 0) {
      map.fitBounds(geoJsonLayerGroup.getBounds(), { padding: [40, 40] });
    }
  }

  function renderTable(measurements) {
    featuresTableBody.innerHTML = "";

    const filtered = measurements.filter((m) => {
      if (activeFilter === "ALL") return true;
      return m.geometry_type.toLowerCase().includes(activeFilter.toLowerCase());
    });

    if (filtered.length === 0) {
      featuresTableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No features match the filter "${activeFilter}".</td></tr>`;
      return;
    }

    filtered.forEach((m) => {
      const tr = document.createElement("tr");
      tr.id = `row-feat-${m.feature_id}`;

      // Badge Class
      let badgeClass = "badge-other";
      if (m.geometry_type.includes("Polygon")) badgeClass = "badge-polygon";
      else if (m.geometry_type.includes("Line")) badgeClass = "badge-line";
      else if (m.geometry_type.includes("Point")) badgeClass = "badge-point";

      // Measurement Info
      let measHtml = '<span style="color: var(--text-dim);">-</span>';
      let convHtml = '<span style="color: var(--text-dim);">-</span>';

      if (m.measurement_type === "area" && m.value !== null) {
        measHtml = `<span class="metric-chip">${m.value.toLocaleString()}</span> <small>m²</small>`;
        convHtml = `<span class="conversions-text">${m.formatted_values.hectares} ha / ${m.formatted_values.sq_kilometers} km²</span>`;
      } else if (m.measurement_type === "length" && m.value !== null) {
        measHtml = `<span class="metric-chip">${m.value.toLocaleString()}</span> <small>m</small>`;
        convHtml = `<span class="conversions-text">${m.formatted_values.kilometers} km</span>`;
      } else if (m.note) {
        convHtml = `<span class="conversions-text" title="${m.note}">${m.note.substring(0, 35)}...</span>`;
      }

      tr.innerHTML = `
        <td><strong>#${m.feature_id}</strong></td>
        <td><span class="badge ${badgeClass}">${m.geometry_type}</span></td>
        <td>${measHtml}</td>
        <td>${convHtml}</td>
        <td><button class="btn-zoom" data-id="${m.feature_id}">Zoom Map</button></td>
      `;

      tr.querySelector(".btn-zoom").addEventListener("click", () => {
        zoomToFeature(m.feature_id);
      });

      featuresTableBody.appendChild(tr);
    });
  }

  function highlightTableRow(featureId) {
    document.querySelectorAll(".features-table tr").forEach((r) => r.classList.remove("highlighted"));
    const row = document.getElementById(`row-feat-${featureId}`);
    if (row) {
      row.classList.add("highlighted");
      row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function zoomToFeature(featureId) {
    const item = mapLayers.find((l) => l.id === featureId);
    if (item && item.layer) {
      highlightTableRow(featureId);
      if (item.layer.getBounds) {
        map.fitBounds(item.layer.getBounds(), { padding: [50, 50], maxZoom: 18 });
      } else if (item.layer.getLatLng) {
        map.setView(item.layer.getLatLng(), 17);
      }
      item.layer.openPopup();
    }
  }

  // --- Helper Controls ---
  function showLoader(isLoading) {
    if (isLoading) {
      uploadLoader.classList.remove("hidden");
    } else {
      uploadLoader.classList.add("hidden");
    }
  }

  function showAlert(msg) {
    if (msg) {
      alertMessage.textContent = msg;
      alertBanner.classList.remove("hidden");
    } else {
      alertBanner.classList.add("hidden");
    }
  }

  // Event Listeners
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) uploadFile(e.target.files[0]);
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) uploadFile(e.dataTransfer.files[0]);
  });

  btnDemoKml.addEventListener("click", () => loadDemo("kml"));
  btnDemoShp.addEventListener("click", () => loadDemo("shapefile"));

  fileSelect.addEventListener("change", (e) => {
    if (e.target.value) loadFileMeasurements(e.target.value);
  });

  alertClose.addEventListener("click", () => showAlert(null));
  btnFitMap.addEventListener("click", fitMapToBounds);

  // Filter Tabs
  filterTabs.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterTabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.getAttribute("data-filter");
      if (currentMeasurementsData) renderTable(currentMeasurementsData.measurements);
    });
  });

  // Raw JSON Modal
  btnViewJson.addEventListener("click", () => {
    if (!currentMeasurementsData) return;
    jsonCodeViewer.textContent = JSON.stringify(currentMeasurementsData, null, 2);
    jsonModal.classList.remove("hidden");
  });

  closeModal.addEventListener("click", () => jsonModal.classList.add("hidden"));
  jsonModal.addEventListener("click", (e) => {
    if (e.target === jsonModal) jsonModal.classList.add("hidden");
  });

  // Initialize
  fetchFileList();
});
