// ============================
// Parcel Viewer using GeoJSON
// ============================

window.onload = init;
const projection = ol.proj.get("EPSG:3857");

function init() {
  // ========= Config & Globals =========
  const apiKey = "AIzaSyCC_SyLRwvCUHnphmNS0jhGBzzYDHXIJHU";
  const parcelSelectLayers = [];
  const snappingSources = [];

  // ========= Base Layers =========
  const baseLayers = {
    OpenStreetMap: new ol.layer.Tile({
      source: new ol.source.OSM(),
      visible: true,
      zIndex: 1,
    }),
    GoogleRoadmap: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${apiKey}`,
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleTerrain: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${apiKey}`,
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleSatellite: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${apiKey}`,
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleHybrid: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${apiKey}`,
      }),
      visible: false,
      zIndex: 1,
    }),
  };

  // ========= Map Initialization =========
  const map = new ol.Map({
    target: "map",
    controls: ol.control.defaults.defaults({ zoom: false }),
    layers: Object.values(baseLayers),
    view: new ol.View({
      center: ol.proj.fromLonLat([103.527339, 12.538695]),
      zoom: 16,
      projection: "EPSG:3857",
    }),
  });

  // ========= GeoJSON Layers =========
  const parcelGeojsonSource = new ol.source.Vector({
    url: "json/v_02140503.geojson",
    format: new ol.format.GeoJSON(),
  });

  const parcelGeojsonLayer = new ol.layer.Vector({
    source: parcelGeojsonSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#FF0000", width: 2 }),
      fill: new ol.style.Fill({ color: "rgba(255,0,0,0.05)" }),
    }),
    zIndex: 10,
  });

  const villageGeojsonSource = new ol.source.Vector({
    url: "json/Villages_Boundary.geojson",
    format: new ol.format.GeoJSON(),
  });

  const villageGeojsonLayer = new ol.layer.Vector({
    source: villageGeojsonSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#0000FF", width: 2 }),
      fill: new ol.style.Fill({ color: "rgba(0,0,255,0.05)" }),
    }),
    zIndex: 9,
  });

  map.addLayer(villageGeojsonLayer);
  map.addLayer(parcelGeojsonLayer);

  // Enable selection and snapping
  parcelSelectLayers.push(parcelGeojsonLayer);
  snappingSources.push(parcelGeojsonSource);

  // (1) Add select interaction and style layer
  const selectionLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "yellow", width: 4 }),
      fill: new ol.style.Fill({ color: "rgba(255, 255, 0, 0.2)" }),
    }),
  });
  selectionLayer.setZIndex(99);
  map.addLayer(selectionLayer);

  const select = new ol.interaction.Select({
    layers: (layer) => parcelSelectLayers.includes(layer),
  });
  map.addInteraction(select);
  select.setActive(false);

  document.getElementById("select-tool-btn").addEventListener("click", () => {
    const isActive = select.getActive();
    select.setActive(!isActive);
    const btn = document.getElementById("select-tool-btn");
    btn.textContent = isActive ? "Select" : "Disable Selection";
    if (!isActive) {
      selectionLayer.getSource().clear();
    }
  });

  select.on("select", (e) => {
    selectionLayer.getSource().clear();
    const feature = e.selected[0];
    if (feature) {
      const properties = feature.getProperties();
      delete properties.geometry;
      const infoList = document.getElementById("feature-info-list");
      infoList.innerHTML = "";
      for (const key in properties) {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${key}</strong>: ${properties[key]}`;
        infoList.appendChild(li);
      }
      document.getElementById("feature-info").classList.remove("hidden");
      selectionLayer.getSource().addFeature(feature.clone());
    } else {
      document.getElementById("feature-info").classList.add("hidden");
    }
  });

  // (2) Parcel ID search
  const searchBtn = document.getElementById("parcelSearchBtn");
  const searchInput = document.getElementById("parcelSearchInput");

  searchBtn.addEventListener("click", () => {
    const parcelID = searchInput.value.trim();
    if (!parcelID) {
      alert("Please enter a Parcel ID.");
      return;
    }

    let found = false;
    // iterate all features in the GeoJSON source
    parcelGeojsonSource.forEachFeature((feature) => {
      if (feature.get("id_parcel") == parcelID) {
        found = true;

        // highlight
        selectionLayer.getSource().clear();
        selectionLayer.getSource().addFeature(feature.clone());

        // populate sidebar
        const props = { ...feature.getProperties() };
        delete props.geometry;
        const infoList = document.getElementById("feature-info-list");
        infoList.innerHTML = "";
        for (const key in props) {
          const li = document.createElement("li");
          li.innerHTML = `<strong>${key}</strong>: ${props[key]}`;
          infoList.appendChild(li);
        }
        document.getElementById("feature-info").classList.remove("hidden");

        // zoom to feature
        map.getView().fit(feature.getGeometry().getExtent(), {
          padding: [20, 20, 20, 20],
          duration: 800,
        });
      }
    });

    if (!found) {
      alert("Parcel ID '" + parcelID + "' not found.");
      selectionLayer.getSource().clear();
      document.getElementById("feature-info").classList.add("hidden");
    }
  });

  // Additional tools (pin, measure, KML) would go here, retained from your existing logic
}
