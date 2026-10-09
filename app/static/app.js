// AEREO Geospatial Measurement Studio - Interactive Frontend Controller

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

  // Units Toggle
  const unitMetric = document.getElementById("unitMetric");
  const unitAcre = document.getElementById("unitAcre");

  // KPI Metrics
  const valTotalArea = document.getElementById("valTotalArea");
  const subTotalHectares = document.getElementById("subTotalHectares");
  const valTotalLength = document.getElementById("valTotalLength");
  const subTotalKm = document.getElementById("subTotalKm");
  const valTotalFeatures = document.getElementById("valTotalFeatures");
  const subFeatureBreakdown = document.getElementById("subFeatureBreakdown");
  const valProjectedCrs = document.getElementById("valProjectedCrs");
  const subOriginalCrs = document.getElementById("subOriginalCrs");

  // Workspace Table & Filters
  const featuresTableBody = document.getElementById("featuresTableBody");
  const filterTabs = document.getElementById("filterTabs");
  const countAll = document.getElementById("countAll");
  const countPoly = document.getElementById("countPoly");
  const countLine = document.getElementById("countLine");
  const countPoint = document.getElementById("countPoint");
  const searchInput = document.getElementById("searchInput");
  const tableStatusText = document.getElementById("tableStatusText");
  const btnCopyGeoJson = document.getElementById("btnCopyGeoJson");

  // Map Controls & Modal
  const btnFitMap = document.getElementById("btnFitMap");
  const btnViewJson = document.getElementById("btnViewJson");
  const jsonModal = document.getElementById("jsonModal");
  const closeModal = document.getElementById("closeModal");
  const btnCopyJson = document.getElementById("btnCopyJson");
  const jsonCodeViewer = document.getElementById("jsonCodeViewer");
  const toast = document.getElementById("toast");

  // State
  let currentMeasurementsData = null;
  let activeFilter = "ALL";
  let activeUnitSystem = "metric"; // 'metric' or 'acre'
  let searchQuery = "";
  let mapLayers = [];

  // Initialize Leaflet Map
  const map = L.map("map", {
    zoomControl: true,
  }).setView([12.9716, 77.5946], 12); // Bengaluru center

  // Saved CARTO API key from localStorage (if any)
  let savedCartoKey = localStorage.getItem("carto_api_key") || "";

  function getDarkTileLayer() {
    if (savedCartoKey) {
      return L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${savedCartoKey}`, {
        attribution: '&copy; CARTO & OpenStreetMap',
        maxZoom: 20,
        subdomains: "abcd",
      });
    }
    // 100% Free, NO API Key needed, Zero Watermark Esri Dark Canvas:
    return L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri Dark Canvas & OpenStreetMap',
      maxZoom: 16,
    });
  }

  // Tile Providers
  const tileProviders = {
    dark: getDarkTileLayer(),
    satellite: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri World Imagery',
      maxZoom: 19,
    }),
    streets: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }),
  };

  let activeBasemap = tileProviders.dark.addTo(map);

  // Basemap Switcher
  document.querySelectorAll(".basemap-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".basemap-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mapType = btn.getAttribute("data-map");

      map.removeLayer(activeBasemap);
      if (mapType === "dark") {
        tileProviders.dark = getDarkTileLayer();
      }
      activeBasemap = tileProviders[mapType].addTo(map);
    });
  });

  const geoJsonLayerGroup = L.featureGroup().addTo(map);

  // --- Unit Conversion Helpers ---
  function formatArea(sqMeters) {
    if (sqMeters === null || sqMeters === undefined) return { primary: "—", secondary: "—" };
    if (activeUnitSystem === "acre") {
      const acres = sqMeters * 0.000247105;
      const sqFt = sqMeters * 10.7639;
      return {
        primary: `${acres.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} Acres`,
        secondary: `${Math.round(sqFt).toLocaleString()} sq ft`,
      };
    }
    const ha = sqMeters / 10000.0;
    return {
      primary: `${ha.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ha`,
      secondary: `${Math.round(sqMeters).toLocaleString()} m²`,
    };
  }

  function formatLength(meters) {
    if (meters === null || meters === undefined) return { primary: "—", secondary: "—" };
    if (activeUnitSystem === "acre") {
      const feet = meters * 3.28084;
      const miles = meters * 0.000621371;
      return {
        primary: `${feet.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ft`,
        secondary: `${miles.toFixed(2)} miles`,
      };
    }
    const km = meters / 1000.0;
    return {
      primary: `${km.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })} km`,
      secondary: `${Math.round(meters).toLocaleString()} meters`,
    };
  }

  // --- API Handlers ---
  async function fetchFileList() {
    try {
      const res = await fetch("/api/files/");
      if (!res.ok) return;
      const files = await res.json();
      fileSelect.innerHTML = '<option value="" disabled selected>Select processed survey...</option>';
      files.forEach((f) => {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = `${f.filename} (${f.feature_count} features)`;
        fileSelect.appendChild(opt);
      });
      if (files.length > 0 && !currentMeasurementsData) {
        fileSelect.value = files[files.length - 1].id;
        loadFileMeasurements(files[files.length - 1].id);
      }
    } catch (err) {
      console.warn("Could not fetch file list:", err);
    }
  }

  async function uploadFile(file) {
    showAlert(null);
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
        throw new Error(errData.detail || "Geospatial file processing encountered an issue.");
      }

      const fileInfo = await res.json();
      await fetchFileList();
      fileSelect.value = fileInfo.id;
      await loadFileMeasurements(fileInfo.id);
      showToast(`Processed "${file.name}" successfully!`);
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
        throw new Error(err.detail || "Failed to load sample dataset.");
      }
      const fileInfo = await res.json();
      await fetchFileList();
      fileSelect.value = fileInfo.id;
      await loadFileMeasurements(fileInfo.id);
      showToast(`Loaded ${type.toUpperCase()} sample dataset!`);
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
        throw new Error(err.detail || "Could not retrieve measurements.");
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
    // 1. Total Area KPI
    const totalArea = data.summary.total_area_sq_meters;
    if (totalArea > 0) {
      const formatted = formatArea(totalArea);
      valTotalArea.textContent = formatted.primary;
      subTotalHectares.textContent = formatted.secondary;
    } else {
      valTotalArea.textContent = "0 ha";
      subTotalHectares.textContent = "No polygon area measured";
    }

    // 2. Total Length KPI
    const totalLength = data.summary.total_length_meters;
    if (totalLength > 0) {
      const formatted = formatLength(totalLength);
      valTotalLength.textContent = formatted.primary;
      subTotalKm.textContent = formatted.secondary;
    } else {
      valTotalLength.textContent = "0 km";
      subTotalKm.textContent = "No road/path length measured";
    }

    // 3. Feature Count KPI
    valTotalFeatures.textContent = data.feature_count.toLocaleString();
    const bd = data.summary.geometry_breakdown || {};
    const parts = [];
    if (bd["Polygon"] || bd["MultiPolygon"]) parts.push(`${(bd["Polygon"] || 0) + (bd["MultiPolygon"] || 0)} Parcels`);
    if (bd["LineString"] || bd["MultiLineString"]) parts.push(`${(bd["LineString"] || 0) + (bd["MultiLineString"] || 0)} Lines`);
    if (bd["Point"] || bd["MultiPoint"]) parts.push(`${(bd["Point"] || 0) + (bd["MultiPoint"] || 0)} Points`);
    subFeatureBreakdown.textContent = parts.join(" • ") || "Features analyzed";

    // 4. CRS Projection KPI
    valProjectedCrs.textContent = data.projected_crs || "EPSG:32643";
    subOriginalCrs.textContent = `Source: ${data.original_crs || "EPSG:4326"}`;

    // 5. Filter Tab Counts
    countAll.textContent = data.measurements.length;
    countPoly.textContent = (bd["Polygon"] || 0) + (bd["MultiPolygon"] || 0);
    countLine.textContent = (bd["LineString"] || 0) + (bd["MultiLineString"] || 0);
    countPoint.textContent = (bd["Point"] || 0) + (bd["MultiPoint"] || 0);

    // 6. Table Status Footer
    tableStatusText.textContent = `${data.filename} • ${data.measurements.length} features detected`;

    // 7. Render Map & Table
    renderMapFeatures(data.measurements);
    renderTable(data.measurements);
  }

  function renderMapFeatures(measurements) {
    geoJsonLayerGroup.clearLayers();
    mapLayers = [];

    measurements.forEach((item) => {
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
        fillOpacity: isPoly ? 0.28 : 0.6,
      };

      let layer;
      if (isPoint) {
        const coords = item.geometry.coordinates;
        layer = L.circleMarker([coords[1], coords[0]], {
          radius: 8,
          ...style,
        });
      } else {
        layer = L.geoJSON(geoJsonFeature, { style });
      }

      // Popup Content with friendly design
      let measurementContent = "";
      if (item.measurement_type === "area") {
        const areaFmt = formatArea(item.value);
        measurementContent = `
          <div style="margin: 6px 0; background: rgba(16,185,129,0.12); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #10b981;">
            <div style="font-size: 0.72rem; color: #a7f3d0; text-transform: uppercase; font-weight: 700;">Calculated Area</div>
            <div style="font-size: 1rem; font-weight: 800; color: #fff;">${areaFmt.primary}</div>
            <div style="font-size: 0.74rem; color: #94a3b8;">${areaFmt.secondary}</div>
          </div>
        `;
      } else if (item.measurement_type === "length") {
        const lenFmt = formatLength(item.value);
        measurementContent = `
          <div style="margin: 6px 0; background: rgba(245,158,11,0.12); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #f59e0b;">
            <div style="font-size: 0.72rem; color: #fde68a; text-transform: uppercase; font-weight: 700;">Measured Length</div>
            <div style="font-size: 1rem; font-weight: 800; color: #fff;">${lenFmt.primary}</div>
            <div style="font-size: 0.74rem; color: #94a3b8;">${lenFmt.secondary}</div>
          </div>
        `;
      }

      const nameProp = item.properties.name || item.properties.Name || item.properties.id || `Feature #${item.feature_id}`;
      const propRows = Object.entries(item.properties)
        .slice(0, 3)
        .map(([k, v]) => `<div><span style="color:#64748b;">${k}:</span> <strong style="color:#cbd5e1;">${v}</strong></div>`)
        .join("");

      layer.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 190px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 800; color: #38bdf8; font-size: 0.9rem;">#${item.feature_id}</span>
            <span style="font-size: 0.7rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">${item.geometry_type}</span>
          </div>
          <div style="font-weight: 700; color: #f8fafc; font-size: 0.88rem; margin-bottom: 6px;">${nameProp}</div>
          ${measurementContent}
          <div style="font-size: 0.74rem; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px;">
            ${propRows}
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
      map.fitBounds(geoJsonLayerGroup.getBounds(), { padding: [50, 50], maxZoom: 18 });
    }
  }

  function renderTable(measurements) {
    featuresTableBody.innerHTML = "";

    const filtered = measurements.filter((m) => {
      // 1. Geometry Filter
      let passType = true;
      if (activeFilter !== "ALL") {
        passType = m.geometry_type.toLowerCase().includes(activeFilter.toLowerCase());
      }
      if (!passType) return false;

      // 2. Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const featStr = JSON.stringify(m).toLowerCase();
        return featStr.includes(query);
      }
      return true;
    });

    if (filtered.length === 0) {
      featuresTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state-cell">
            <div class="empty-guide">
              <span class="empty-icon">🔍</span>
              <p class="empty-title">No matching features found</p>
              <p class="empty-desc">Try clearing the search query or switching filters.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((m) => {
      const tr = document.createElement("tr");
      tr.id = `row-feat-${m.feature_id}`;

      // Badge Class
      let badgeClass = "type-other";
      if (m.geometry_type.includes("Polygon")) badgeClass = "type-poly";
      else if (m.geometry_type.includes("Line")) badgeClass = "type-line";
      else if (m.geometry_type.includes("Point")) badgeClass = "type-pt";

      // Measurements Column
      let measHtml = '<span style="color: var(--text-muted);">No measurement</span>';
      if (m.measurement_type === "area" && m.value !== null) {
        const areaFmt = formatArea(m.value);
        measHtml = `
          <div class="cell-measurement">
            <span class="primary-meas">${areaFmt.primary}</span>
            <span class="sub-meas">${areaFmt.secondary}</span>
          </div>
        `;
      } else if (m.measurement_type === "length" && m.value !== null) {
        const lenFmt = formatLength(m.value);
        measHtml = `
          <div class="cell-measurement">
            <span class="primary-meas">${lenFmt.primary}</span>
            <span class="sub-meas">${lenFmt.secondary}</span>
          </div>
        `;
      }

      // Feature Details
      const featName = m.properties.name || m.properties.Name || m.properties.id || `Feature #${m.feature_id}`;
      const firstAttr = Object.entries(m.properties)
        .filter(([k]) => !["name", "Name", "id"].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .slice(0, 1)
        .join(", ");

      tr.innerHTML = `
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--cyan-main);">#${m.feature_id}</td>
        <td><span class="type-badge ${badgeClass}">${m.geometry_type}</span></td>
        <td>
          <div class="cell-details">
            <span class="feature-name">${featName}</span>
            <span class="feature-attr">${firstAttr || "Standard feature"}</span>
          </div>
        </td>
        <td>${measHtml}</td>
        <td style="text-align: center;">
          <button class="btn-locate" data-id="${m.feature_id}" title="Focus on map">View 🔍</button>
        </td>
      `;

      tr.querySelector(".btn-locate").addEventListener("click", () => {
        zoomToFeature(m.feature_id);
      });

      featuresTableBody.appendChild(tr);
    });
  }

  function highlightTableRow(featureId) {
    document.querySelectorAll(".data-table tr").forEach((r) => r.classList.remove("highlighted"));
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
        map.fitBounds(item.layer.getBounds(), { padding: [60, 60], maxZoom: 18 });
      } else if (item.layer.getLatLng) {
        map.setView(item.layer.getLatLng(), 17);
      }
      item.layer.openPopup();
    }
  }

  // --- UI Notifications & State ---
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

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.remove("hidden");
    setTimeout(() => {
      toast.classList.add("hidden");
    }, 3200);
  }

  // --- Event Handlers ---
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

  // Unit Switcher
  unitMetric.addEventListener("click", () => {
    unitMetric.classList.add("active");
    unitAcre.classList.remove("active");
    activeUnitSystem = "metric";
    if (currentMeasurementsData) renderDashboard(currentMeasurementsData);
  });

  unitAcre.addEventListener("click", () => {
    unitAcre.classList.add("active");
    unitMetric.classList.remove("active");
    activeUnitSystem = "acre";
    if (currentMeasurementsData) renderDashboard(currentMeasurementsData);
  });

  // Demo Loaders
  btnDemoKml.addEventListener("click", () => loadDemo("kml"));
  btnDemoShp.addEventListener("click", () => loadDemo("shapefile"));

  fileSelect.addEventListener("change", (e) => {
    if (e.target.value) loadFileMeasurements(e.target.value);
  });

  alertClose.addEventListener("click", () => showAlert(null));
  btnFitMap.addEventListener("click", fitMapToBounds);

  // Filter Tabs
  filterTabs.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterTabs.querySelectorAll(".pill-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.getAttribute("data-filter");
      if (currentMeasurementsData) renderTable(currentMeasurementsData.measurements);
    });
  });

  // Search Input
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    if (currentMeasurementsData) renderTable(currentMeasurementsData.measurements);
  });

  // Raw JSON Modal
  btnViewJson.addEventListener("click", () => {
    if (!currentMeasurementsData) {
      showToast("No survey loaded yet.");
      return;
    }
    jsonCodeViewer.textContent = JSON.stringify(currentMeasurementsData, null, 2);
    jsonModal.classList.remove("hidden");
  });

  closeModal.addEventListener("click", () => jsonModal.classList.add("hidden"));
  jsonModal.addEventListener("click", (e) => {
    if (e.target === jsonModal) jsonModal.classList.add("hidden");
  });

  btnCopyJson.addEventListener("click", () => {
    navigator.clipboard.writeText(jsonCodeViewer.textContent);
    showToast("JSON payload copied to clipboard!");
  });

  // Copy GeoJSON
  btnCopyGeoJson.addEventListener("click", () => {
    if (!currentMeasurementsData) {
      showToast("No active survey to copy.");
      return;
    }
    const features = currentMeasurementsData.measurements
      .filter((m) => m.geometry)
      .map((m) => ({
        type: "Feature",
        id: m.feature_id,
        geometry: m.geometry,
        properties: {
          ...m.properties,
          calculated_measurement: m.value,
          unit: m.unit,
        },
      }));
    const featureCollection = {
      type: "FeatureCollection",
      crs: {
        type: "name",
        properties: { name: currentMeasurementsData.projected_crs || "EPSG:4326" },
      },
      features,
    };
    navigator.clipboard.writeText(JSON.stringify(featureCollection, null, 2));
    showToast("Full GeoJSON copied to clipboard!");
  });

  // Basemap Key Settings Modal
  const btnMapKey = document.getElementById("btnMapKey");
  const keyModal = document.getElementById("keyModal");
  const closeKeyModal = document.getElementById("closeKeyModal");
  const cartoApiKeyInput = document.getElementById("cartoApiKeyInput");
  const btnSaveKey = document.getElementById("btnSaveKey");
  const btnResetKey = document.getElementById("btnResetKey");

  if (cartoApiKeyInput) {
    cartoApiKeyInput.value = savedCartoKey;
  }

  if (btnMapKey) {
    btnMapKey.addEventListener("click", () => {
      cartoApiKeyInput.value = savedCartoKey;
      keyModal.classList.remove("hidden");
    });
  }

  if (closeKeyModal) {
    closeKeyModal.addEventListener("click", () => {
      keyModal.classList.add("hidden");
    });
  }

  if (keyModal) {
    keyModal.addEventListener("click", (e) => {
      if (e.target === keyModal) keyModal.classList.add("hidden");
    });
  }

  if (btnSaveKey) {
    btnSaveKey.addEventListener("click", () => {
      savedCartoKey = cartoApiKeyInput.value.trim();
      if (savedCartoKey) {
        localStorage.setItem("carto_api_key", savedCartoKey);
        showToast("CARTO API Key saved!");
      } else {
        localStorage.removeItem("carto_api_key");
        showToast("Using 100% Free Esri Dark Basemap (No Key Needed)");
      }
      keyModal.classList.add("hidden");
      map.removeLayer(activeBasemap);
      tileProviders.dark = getDarkTileLayer();
      activeBasemap = tileProviders.dark.addTo(map);
    });
  }

  if (btnResetKey) {
    btnResetKey.addEventListener("click", () => {
      savedCartoKey = "";
      localStorage.removeItem("carto_api_key");
      if (cartoApiKeyInput) cartoApiKeyInput.value = "";
      keyModal.classList.add("hidden");
      map.removeLayer(activeBasemap);
      tileProviders.dark = getDarkTileLayer();
      activeBasemap = tileProviders.dark.addTo(map);
      showToast("Reset to Free Esri Dark Basemap (No Key Needed)");
    });
  }

  // Initialize
  fetchFileList();
});
