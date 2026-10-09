// AEREO GIS Mission Control - Client Controller

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

  // Sidebar Controls
  const sidebar = document.getElementById("sidebar");
  const btnToggleSidebar = document.getElementById("btnToggleSidebar");

  // Units Toggle
  const unitMetric = document.getElementById("unitMetric");
  const unitAcre = document.getElementById("unitAcre");

  // Telemetry Metrics
  const valTotalArea = document.getElementById("valTotalArea");
  const subTotalHectares = document.getElementById("subTotalHectares");
  const valTotalLength = document.getElementById("valTotalLength");
  const subTotalKm = document.getElementById("subTotalKm");
  const valTotalFeatures = document.getElementById("valTotalFeatures");
  const subFeatureBreakdown = document.getElementById("subFeatureBreakdown");
  const valProjectedCrs = document.getElementById("valProjectedCrs");
  const subOriginalCrs = document.getElementById("subOriginalCrs");

  // Feature Explorer
  const featuresList = document.getElementById("featuresList");
  const filterTabs = document.getElementById("filterTabs");
  const countAll = document.getElementById("countAll");
  const countPoly = document.getElementById("countPoly");
  const countLine = document.getElementById("countLine");
  const countPoint = document.getElementById("countPoint");
  const searchInput = document.getElementById("searchInput");
  const btnCopyGeoJson = document.getElementById("btnCopyGeoJson");

  // Map Controls & Modals
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
  let activeUnitSystem = "metric";
  let searchQuery = "";
  let mapLayers = [];

  // Toggle Sidebar Collapse
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
    });
  }

  // Initialize Leaflet Map (Full Screen)
  const map = L.map("map", {
    zoomControl: false, // Cleaner HUD look; we provide a custom Fit button and standard zoom at top right if needed
  }).setView([12.9716, 77.5946], 12); // Bengaluru center

  L.control.zoom({ position: "topright" }).addTo(map);

  // Basemap & Tile Providers with Location Names
  let savedCartoKey = localStorage.getItem("carto_api_key") || "";
  let savedMapboxToken = localStorage.getItem("mapbox_token") || "";

  function getDarkTileLayer() {
    if (savedCartoKey) {
      return L.tileLayer(`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?api_key=${savedCartoKey}`, {
        attribution: '&copy; CARTO & OpenStreetMap',
        maxZoom: 20,
        subdomains: "abcd",
      });
    }
    // High-Resolution Esri Dark Canvas with City Names, Neighborhoods & Streets:
    const darkBase = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri, DeLorme, NAVTEQ',
      maxZoom: 16,
    });
    const darkLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
      attribution: '',
      maxZoom: 16,
      opacity: 0.9,
    });
    return L.layerGroup([darkBase, darkLabels]);
  }

  function getSatelliteHybridLayer() {
    const satImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      attribution: '&copy; Esri World Imagery',
      maxZoom: 19,
    });
    const satPlaces = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
      attribution: '',
      maxZoom: 19,
      opacity: 0.95,
    });
    const satRoads = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", {
      attribution: '',
      maxZoom: 19,
      opacity: 0.9,
    });
    return L.layerGroup([satImagery, satPlaces, satRoads]);
  }

  function getMapboxLayer() {
    if (!savedMapboxToken) return null;
    return L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/{z}/{x}/{y}?access_token=${savedMapboxToken}`, {
      attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a> &copy; OpenStreetMap',
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 20,
    });
  }

  function updateMapboxButtonVisibility() {
    const btn = document.getElementById("btnMapboxLayer");
    if (btn) {
      if (savedMapboxToken) {
        btn.classList.remove("hidden");
      } else {
        btn.classList.add("hidden");
      }
    }
  }

  const tileProviders = {
    dark: getDarkTileLayer(),
    satellite: getSatelliteHybridLayer(),
    streets: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }),
    mapbox: getMapboxLayer(),
  };

  let activeBasemap = tileProviders.dark.addTo(map);
  updateMapboxButtonVisibility();

  // Basemap Switcher
  document.querySelectorAll(".basemap-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".basemap-pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mapType = btn.getAttribute("data-map");

      map.removeLayer(activeBasemap);
      if (mapType === "dark") {
        tileProviders.dark = getDarkTileLayer();
        activeBasemap = tileProviders.dark;
      } else if (mapType === "mapbox") {
        tileProviders.mapbox = getMapboxLayer();
        activeBasemap = tileProviders.mapbox || tileProviders.dark;
      } else {
        activeBasemap = tileProviders[mapType] || tileProviders.dark;
      }
      activeBasemap.addTo(map);
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
      showToast(`Processed "${file.name}"!`);
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
      showToast(`Loaded ${type.toUpperCase()} survey!`);
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
    // 1. Total Area
    const totalArea = data.summary.total_area_sq_meters;
    if (totalArea > 0) {
      const formatted = formatArea(totalArea);
      valTotalArea.textContent = formatted.primary;
      subTotalHectares.textContent = formatted.secondary;
    } else {
      valTotalArea.textContent = "0 ha";
      subTotalHectares.textContent = "No polygon area";
    }

    // 2. Total Length
    const totalLength = data.summary.total_length_meters;
    if (totalLength > 0) {
      const formatted = formatLength(totalLength);
      valTotalLength.textContent = formatted.primary;
      subTotalKm.textContent = formatted.secondary;
    } else {
      valTotalLength.textContent = "0 km";
      subTotalKm.textContent = "No road length";
    }

    // 3. Features Count
    valTotalFeatures.textContent = data.feature_count.toLocaleString();
    const bd = data.summary.geometry_breakdown || {};
    const parts = [];
    if (bd["Polygon"] || bd["MultiPolygon"]) parts.push(`${(bd["Polygon"] || 0) + (bd["MultiPolygon"] || 0)} Parcels`);
    if (bd["LineString"] || bd["MultiLineString"]) parts.push(`${(bd["LineString"] || 0) + (bd["MultiLineString"] || 0)} Lines`);
    if (bd["Point"] || bd["MultiPoint"]) parts.push(`${(bd["Point"] || 0) + (bd["MultiPoint"] || 0)} Points`);
    subFeatureBreakdown.textContent = parts.join(" • ") || "Analyzed";

    // 4. CRS Projection
    valProjectedCrs.textContent = data.projected_crs || "EPSG:32643";
    subOriginalCrs.textContent = `Source: ${data.original_crs || "EPSG:4326"}`;

    // 5. Counts for filter pills
    countAll.textContent = data.measurements.length;
    countPoly.textContent = (bd["Polygon"] || 0) + (bd["MultiPolygon"] || 0);
    countLine.textContent = (bd["LineString"] || 0) + (bd["MultiLineString"] || 0);
    countPoint.textContent = (bd["Point"] || 0) + (bd["MultiPoint"] || 0);

    // 6. Render Map & Feature Cards
    renderMapFeatures(data.measurements);
    renderFeaturesList(data.measurements);
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
        weight: 3.5,
        opacity: 0.95,
        fillColor: isPoly ? "#10b981" : "#38bdf8",
        fillOpacity: isPoly ? 0.32 : 0.6,
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

      // Popup Content
      let measurementContent = "";
      if (item.measurement_type === "area") {
        const areaFmt = formatArea(item.value);
        measurementContent = `
          <div style="margin: 6px 0; background: rgba(16,185,129,0.14); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #10b981;">
            <div style="font-size: 0.7rem; color: #a7f3d0; text-transform: uppercase; font-weight: 700;">Calculated Area</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #fff;">${areaFmt.primary}</div>
            <div style="font-size: 0.74rem; color: #94a3b8;">${areaFmt.secondary}</div>
          </div>
        `;
      } else if (item.measurement_type === "length") {
        const lenFmt = formatLength(item.value);
        measurementContent = `
          <div style="margin: 6px 0; background: rgba(245,158,11,0.14); padding: 8px 10px; border-radius: 6px; border-left: 3px solid #f59e0b;">
            <div style="font-size: 0.7rem; color: #fde68a; text-transform: uppercase; font-weight: 700;">Measured Length</div>
            <div style="font-size: 1.05rem; font-weight: 800; color: #fff;">${lenFmt.primary}</div>
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
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; min-width: 200px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="font-weight: 800; color: #38bdf8; font-size: 0.9rem;">#${item.feature_id}</span>
            <span style="font-size: 0.68rem; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px;">${item.geometry_type}</span>
          </div>
          <div style="font-weight: 700; color: #f8fafc; font-size: 0.88rem; margin-bottom: 6px;">${nameProp}</div>
          ${measurementContent}
          <div style="font-size: 0.72rem; margin-top: 6px; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 6px;">
            ${propRows}
          </div>
        </div>
      `);

      layer.on("click", () => {
        highlightFeatureCard(item.feature_id);
      });

      geoJsonLayerGroup.addLayer(layer);
      mapLayers.push({ id: item.feature_id, layer });
    });

    fitMapToBounds();
  }

  function fitMapToBounds() {
    if (geoJsonLayerGroup.getLayers().length > 0) {
      // Offset padding for the floating sidebar on the left
      const isCollapsed = sidebar && sidebar.classList.contains("collapsed");
      const leftPad = isCollapsed ? 60 : 480;
      map.fitBounds(geoJsonLayerGroup.getBounds(), {
        paddingTopLeft: [leftPad, 80],
        paddingBottomRight: [60, 60],
        maxZoom: 18,
      });
    }
  }

  function renderFeaturesList(measurements) {
    featuresList.innerHTML = "";

    const filtered = measurements.filter((m) => {
      let passType = true;
      if (activeFilter !== "ALL") {
        passType = m.geometry_type.toLowerCase().includes(activeFilter.toLowerCase());
      }
      if (!passType) return false;

      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const featStr = JSON.stringify(m).toLowerCase();
        return featStr.includes(query);
      }
      return true;
    });

    if (filtered.length === 0) {
      featuresList.innerHTML = `
        <div class="empty-list-state">
          <div class="empty-list-icon">🔍</div>
          <p><strong>No matching features found</strong></p>
          <p>Try clearing your search query.</p>
        </div>
      `;
      return;
    }

    filtered.forEach((m) => {
      const card = document.createElement("div");
      card.className = "feature-item-card";
      card.id = `feat-card-${m.feature_id}`;

      let tagClass = "tag-poly";
      if (m.geometry_type.includes("Line")) tagClass = "tag-line";
      else if (m.geometry_type.includes("Point")) tagClass = "tag-pt";

      let measPrimary = "—";
      let measSub = "No metric";

      if (m.measurement_type === "area" && m.value !== null) {
        const areaFmt = formatArea(m.value);
        measPrimary = areaFmt.primary;
        measSub = areaFmt.secondary;
      } else if (m.measurement_type === "length" && m.value !== null) {
        const lenFmt = formatLength(m.value);
        measPrimary = lenFmt.primary;
        measSub = lenFmt.secondary;
      }

      const featName = m.properties.name || m.properties.Name || m.properties.id || `Feature #${m.feature_id}`;

      card.innerHTML = `
        <div class="feature-item-left">
          <div class="feature-top-meta">
            <span class="feature-id-badge">#${m.feature_id}</span>
            <span class="feature-type-tag ${tagClass}">${m.geometry_type}</span>
          </div>
          <div class="feature-title-label" title="${featName}">${featName}</div>
        </div>
        <div class="feature-meas-display">
          <div class="meas-primary">${measPrimary}</div>
          <div class="meas-sub">${measSub}</div>
        </div>
      `;

      card.addEventListener("click", () => {
        zoomToFeature(m.feature_id);
      });

      featuresList.appendChild(card);
    });
  }

  function highlightFeatureCard(featureId) {
    document.querySelectorAll(".feature-item-card").forEach((c) => c.classList.remove("highlighted"));
    const card = document.getElementById(`feat-card-${featureId}`);
    if (card) {
      card.classList.add("highlighted");
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  function zoomToFeature(featureId) {
    const item = mapLayers.find((l) => l.id === featureId);
    if (item && item.layer) {
      highlightFeatureCard(featureId);
      const isCollapsed = sidebar && sidebar.classList.contains("collapsed");
      const leftPad = isCollapsed ? 60 : 480;

      if (item.layer.getBounds) {
        map.fitBounds(item.layer.getBounds(), {
          paddingTopLeft: [leftPad, 80],
          paddingBottomRight: [60, 60],
          maxZoom: 18,
        });
      } else if (item.layer.getLatLng) {
        map.setView(item.layer.getLatLng(), 17);
      }
      item.layer.openPopup();
    }
  }

  // --- Helpers ---
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

  // --- Event Listeners ---
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

  // Units
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

  // Demos
  btnDemoKml.addEventListener("click", () => loadDemo("kml"));
  btnDemoShp.addEventListener("click", () => loadDemo("shapefile"));

  fileSelect.addEventListener("change", (e) => {
    if (e.target.value) loadFileMeasurements(e.target.value);
  });

  alertClose.addEventListener("click", () => showAlert(null));
  btnFitMap.addEventListener("click", fitMapToBounds);

  // Filters
  filterTabs.querySelectorAll(".chip-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterTabs.querySelectorAll(".chip-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.getAttribute("data-filter");
      if (currentMeasurementsData) renderFeaturesList(currentMeasurementsData.measurements);
    });
  });

  // Search
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim();
    if (currentMeasurementsData) renderFeaturesList(currentMeasurementsData.measurements);
  });

  // Modals
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
  const mapboxTokenInput = document.getElementById("mapboxTokenInput");
  const cartoApiKeyInput = document.getElementById("cartoApiKeyInput");
  const btnSaveKey = document.getElementById("btnSaveKey");
  const btnResetKey = document.getElementById("btnResetKey");

  if (mapboxTokenInput) mapboxTokenInput.value = savedMapboxToken;
  if (cartoApiKeyInput) cartoApiKeyInput.value = savedCartoKey;

  if (btnMapKey) {
    btnMapKey.addEventListener("click", () => {
      if (mapboxTokenInput) mapboxTokenInput.value = savedMapboxToken;
      if (cartoApiKeyInput) cartoApiKeyInput.value = savedCartoKey;
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
      savedMapboxToken = (mapboxTokenInput ? mapboxTokenInput.value.trim() : "");
      savedCartoKey = (cartoApiKeyInput ? cartoApiKeyInput.value.trim() : "");

      if (savedMapboxToken) {
        localStorage.setItem("mapbox_token", savedMapboxToken);
      } else {
        localStorage.removeItem("mapbox_token");
      }

      if (savedCartoKey) {
        localStorage.setItem("carto_api_key", savedCartoKey);
      } else {
        localStorage.removeItem("carto_api_key");
      }

      updateMapboxButtonVisibility();
      keyModal.classList.add("hidden");

      map.removeLayer(activeBasemap);
      tileProviders.dark = getDarkTileLayer();
      tileProviders.satellite = getSatelliteHybridLayer();
      tileProviders.mapbox = getMapboxLayer();

      if (savedMapboxToken && tileProviders.mapbox) {
        document.querySelectorAll(".basemap-pill").forEach((b) => b.classList.remove("active"));
        document.getElementById("btnMapboxLayer")?.classList.add("active");
        activeBasemap = tileProviders.mapbox.addTo(map);
        showToast("Mapbox Vector Labels Activated!");
      } else {
        document.querySelectorAll(".basemap-pill").forEach((b) => b.classList.remove("active"));
        document.querySelector('.basemap-pill[data-map="dark"]')?.classList.add("active");
        activeBasemap = tileProviders.dark.addTo(map);
        showToast("Location & Street Labels Updated!");
      }
    });
  }

  if (btnResetKey) {
    btnResetKey.addEventListener("click", () => {
      savedMapboxToken = "";
      savedCartoKey = "";
      localStorage.removeItem("mapbox_token");
      localStorage.removeItem("carto_api_key");
      if (mapboxTokenInput) mapboxTokenInput.value = "";
      if (cartoApiKeyInput) cartoApiKeyInput.value = "";
      updateMapboxButtonVisibility();
      keyModal.classList.add("hidden");

      map.removeLayer(activeBasemap);
      tileProviders.dark = getDarkTileLayer();
      tileProviders.satellite = getSatelliteHybridLayer();
      tileProviders.mapbox = null;

      document.querySelectorAll(".basemap-pill").forEach((b) => b.classList.remove("active"));
      document.querySelector('.basemap-pill[data-map="dark"]')?.classList.add("active");
      activeBasemap = tileProviders.dark.addTo(map);
      showToast("Reset to Free Basemaps with Location Labels");
    });
  }

  // Initialize
  fetchFileList();
});
