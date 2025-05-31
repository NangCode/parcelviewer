window.onload = init;
const projection = ol.proj.get("EPSG:3857");

function init() {
  // Google Maps API key
  const apiKey = "AIzaSyCC_SyLRwvCUHnphmNS0jhGBzzYDHXIJHU";

  // ======= Basemaps =======
  const baseLayers = {
    OpenStreetMap: new ol.layer.Tile({
      source: new ol.source.OSM(),
      visible: true,
      zIndex: 1,
    }),
    GoogleRoadmap: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${apiKey}`,
        attributions: "© Google",
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleTerrain: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${apiKey}`,
        attributions: "© Google",
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleSatellite: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${apiKey}`,
        attributions: "© Google",
      }),
      visible: false,
      zIndex: 1,
    }),
    GoogleHybrid: new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: `https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${apiKey}`,
        attributions: "© Google",
      }),
      visible: false,
      zIndex: 1,
    }),
  };

  // --- Setup Map ---
  const map = new ol.Map({
    target: "map",
    controls: ol.control.defaults.defaults({ zoom: false }),
    layers: Object.values(baseLayers),
    view: new ol.View({
      center: ol.proj.fromLonLat([103.52, 12.5447]), // Cambodia center
      zoom: 13,
      projection: "EPSG:3857",
    }),
  });

  // Create a basic popup div and overlay
  const popup = document.createElement("div");
  popup.className = "ol-popup";
  document.body.appendChild(popup);

  const popupOverlay = new ol.Overlay({
    element: popup,
    positioning: "bottom-center",
    stopEvent: false,
    offset: [0, -20],
  });
  map.addOverlay(popupOverlay);

  // --- Mouse Position ---
  const mousePositionControl = new ol.control.MousePosition({
    coordinateFormat: function (coord) {
      return `Lon:\n${coord[0].toFixed(5)}\n| Lat:\n${coord[1].toFixed(5)}`;
    },
    projection: "EPSG:4326",
    target: document.getElementById("mouse-position"),
    undefinedHTML: " ",
  });
  map.addControl(mousePositionControl);

  // --- Scale Line ---
  const scaleControl = new ol.control.ScaleLine({
    units: "metric",
    bar: true,
    text: true,
    target: document.getElementById("map-controls"),
  });
  map.addControl(scaleControl);

  // --- Zoom controls ---
  document.getElementById("zoom-in").addEventListener("click", () => {
    const view = map.getView();
    view.setZoom(view.getZoom() + 1);
  });
  document.getElementById("zoom-out").addEventListener("click", () => {
    const view = map.getView();
    view.setZoom(view.getZoom() - 1);
  });

  // --- Locate control ---
  document.getElementById("locate").addEventListener("click", () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        map.getView().animate({
          center: ol.proj.fromLonLat(coords),
          zoom: 18,
          duration: 900,
        });
      });
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  });

  // --- Base Map Popup ---
  const basemapPopup = document.getElementById("basemap-popup");
  const layerPopup = document.getElementById("layer-popup");
  const searchBox = document.getElementById("search-box");
  const measurePopup = document.getElementById("measure-popup");
  const infoBox = document.getElementById("feature-info");

  document.getElementById("toggle-basemap").addEventListener("click", () => {
    basemapPopup.classList.toggle("hidden");
    layerPopup.classList.add("hidden");
    searchBox.classList.add("hidden");
    measurePopup.classList.add("hidden");
    // infoBox.classList.add("hidden");
  });

  document.getElementById("toggle-layer").addEventListener("click", () => {
    layerPopup.classList.toggle("hidden");
    basemapPopup.classList.add("hidden");
    searchBox.classList.add("hidden");
    measurePopup.classList.add("hidden");
    // infoBox.classList.add("hidden");
  });

  document.getElementById("parcel-search-btn").addEventListener("click", () => {
    searchBox.classList.toggle("hidden");
    measurePopup.classList.add("hidden");
    // infoBox.classList.add("hidden");
    layerPopup.classList.add("hidden");
    basemapPopup.classList.add("hidden");
  });

  document.getElementById("parcel-info-btn").addEventListener("click", () => {
    infoBox.classList.toggle("hidden");
    measurePopup.classList.add("hidden");
    searchBox.classList.add("hidden");
    layerPopup.classList.add("hidden");
    basemapPopup.classList.add("hidden");
  });

  document.getElementById("measure-tool-btn").addEventListener("click", () => {
    measurePopup.classList.toggle("hidden");
    searchBox.classList.add("hidden");
    // infoBox.classList.add("hidden");
    layerPopup.classList.add("hidden");
    basemapPopup.classList.add("hidden");
  });

  // --- Basemap Switching (Radio) ---
  document.querySelectorAll('input[name="basemap"]').forEach((radio) => {
    radio.addEventListener("change", function () {
      const selected = this.value;
      for (const [key, layer] of Object.entries(baseLayers)) {
        layer.setVisible(key === selected);
      }
    });
  });

  // ======= GeoJSON Layers with Visibility Controls =======
  // ======= WMS Layers with Workspace Checkboxes =======
  const wmsWorkspaces = [
    { name: "parcelws", title: "Land Parcels" },
    { name: "boundaryws", title: "Administrative Boundaries" },
  ];

  const layerControls = document.getElementById("layer-controls");

  // Pre-create wrappers in the desired order
  const workspaceWrappers = {};

  wmsWorkspaces.forEach(({ name, title }, wsIndex) => {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "0.75em";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `workspace-toggle-${wsIndex}`;
    checkbox.checked = true;

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.style.marginLeft = "0.25em";
    label.textContent = title;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    layerControls.appendChild(wrapper);

    workspaceWrappers[name] = {
      checkbox,
      layers: [],
    };

    // Now fetch and fill in the layers
    const capabilitiesUrl = `http://localhost:8080/geoserver/${name}/ows?service=WMS&request=GetCapabilities`;

    fetch(capabilitiesUrl)
      .then((res) => res.text())
      .then((xmlText) => {
        const parser = new ol.format.WMSCapabilities();
        const result = parser.read(xmlText);
        const layers = result.Capability.Layer.Layer;

        layers.forEach((layerInfo, i) => {
          const layerName = layerInfo.Name;
          const resolutionLimit = 5.29; // visible up to ~1:22,500 scale

          const wmsLayerOptions = {
            source: new ol.source.ImageWMS({
              url: `http://localhost:8080/geoserver/${name}/wms`,
              params: {
                LAYERS: layerName,
                FORMAT: "image/png",
                TILED: false,
                STYLES: name === "parcelws" ? "auto_label" : "",
              },
              serverType: "geoserver",
              crossOrigin: "anonymous",
            }),
            visible: true,
            zIndex: 10 + i,
          };

          if (name === "parcelws") {
            wmsLayerOptions.maxResolution = resolutionLimit;
          }

          const wmsLayer = new ol.layer.Image(wmsLayerOptions);
          map.addLayer(wmsLayer);
          workspaceWrappers[name].layers.push(wmsLayer);
        });

        // Hook up checkbox event (after fetch ensures layers exist)
        workspaceWrappers[name].checkbox.addEventListener("change", () => {
          const visible = workspaceWrappers[name].checkbox.checked;
          workspaceWrappers[name].layers.forEach((layer) =>
            layer.setVisible(visible)
          );
        });
      })
      .catch((err) =>
        console.error(
          `Failed to load WMS layers from workspace '${name}':`,
          err
        )
      );
  });

  // ======= Hidden WFS vector layer for interaction =======
  const geojsonLayers = [];
  const snappingSources = [];

  const parcelWfsSource = new ol.source.Vector({
    format: new ol.format.GeoJSON(),
    url: `http://localhost:8080/geoserver/parcelws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=parcelws:v_02140503&outputFormat=application/json&srsname=EPSG:3857`,
    strategy: ol.loadingstrategy.all,
  });

  const parcelVectorLayer = new ol.layer.Vector({
    source: parcelWfsSource,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#FF0000", width: 2 }),
      fill: new ol.style.Fill({ color: "rgba(255, 0, 0, 0.05)" }),
    }),
    visible: false, // keep hidden, only for tools
  });

  map.addLayer(parcelVectorLayer);
  geojsonLayers.push(parcelVectorLayer);
  snappingSources.push(parcelWfsSource);

  // ======= Select Parcel Tool =======
  // === Declare selection-related containers ===
  const parcelSelectLayers = [];
  const selectionLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "yellow", width: 4 }),
      fill: new ol.style.Fill({ color: "rgba(255, 255, 0, 0.2)" }),
    }),
  });
  selectionLayer.setZIndex(99);
  map.addLayer(selectionLayer);

  // === Load all WFS layers from parcelws ===
  fetch(
    "http://localhost:8080/geoserver/parcelws/ows?service=WFS&version=1.0.0&request=GetCapabilities"
  )
    .then((res) => res.text())
    .then((xmlText) => {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlText, "text/xml");
      const featureTypes = xml.getElementsByTagName("FeatureType");

      for (let i = 0; i < featureTypes.length; i++) {
        const name =
          featureTypes[i].getElementsByTagName("Name")[0].textContent;

        const vectorSource = new ol.source.Vector({
          format: new ol.format.GeoJSON(),
          url: (extent) =>
            `http://localhost:8080/geoserver/parcelws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${name}&outputFormat=application/json&srsname=EPSG:3857&bbox=${extent.join(
              ","
            )},EPSG:3857`,
          strategy: ol.loadingstrategy.bbox,
        });

        const vectorLayer = new ol.layer.Vector({
          source: vectorSource,
          style: function (feature) {
            const label = feature.get("id_parcel") || "";
            return new ol.style.Style({
              stroke: new ol.style.Stroke({ color: "black", width: 1 }),
              fill: new ol.style.Fill({ color: "rgba(0, 0, 0, 0)" }),
              text: new ol.style.Text({
                font: "12px sans-serif",
                text: label.toString(),
                fill: new ol.style.Fill({ color: "#000" }),
                stroke: new ol.style.Stroke({ color: "#fff", width: 2 }),
              }),
            });
          },
          visible: true,
        });

        map.addLayer(vectorLayer);
        parcelSelectLayers.push(vectorLayer);
        snappingSources.push(vectorSource);
      }
    });

  // === Select Interaction restricted to parcelws WFS layers ===
  const select = new ol.interaction.Select({
    layers: (layer) => parcelSelectLayers.includes(layer),
  });
  map.addInteraction(select);
  select.setActive(false);

  // === Toggle select tool button ===
  document.getElementById("select-tool-btn").addEventListener("click", () => {
    const isActive = select.getActive();
    select.setActive(!isActive);

    const btn = document.getElementById("select-tool-btn");
    btn.textContent = isActive ? "Select" : "Disable Selection";

    if (!isActive) {
      popupOverlay.setPosition(undefined);
      selectionLayer.getSource().clear();
    }
  });

  // === On feature select, show popup + highlight ===
  select.on("select", (e) => {
    selectionLayer.getSource().clear();
    const feature = e.selected[0];

<<<<<<< HEAD
  document.getElementById("select-tool-btn").addEventListener("click", () => {
    select.setActive(!select.getActive());
    if (select.getActive()) {
      measurePopup.classList.add("hidden");
      searchBox.classList.add("hidden");
      // infoBox.classList.add("hidden");
      layerPopup.classList.add("hidden");
      basemapPopup.classList.add("hidden");
=======
    if (feature) {
      const geometry = feature.getGeometry();
      const properties = feature.getProperties();
      delete properties.geometry;

      // Populate sidebar info
      const infoList = document.getElementById("feature-info-list");
      infoList.innerHTML = ""; // Clear old data

      for (const key in properties) {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${key}</strong>: ${properties[key]}`;
        infoList.appendChild(li);
      }

      // Show sidebar panel
      document.getElementById("feature-info").classList.remove("hidden");

      // Highlight on map
      selectionLayer.getSource().addFeature(feature.clone());
    } else {
      document.getElementById("feature-info").classList.add("hidden");
>>>>>>> f76d4a0 (add new code)
    }
  });

  // ======= Search Parcel Tool =======

  CQL_FILTER = id_parcel = "${parcelID}";

  const projection = ol.proj.get("EPSG:3857"); // place this once globally in init()

  document.getElementById("parcelSearchBtn").addEventListener("click", () => {
    const parcelID = document.getElementById("parcelSearchInput").value.trim();
    if (!parcelID) {
      alert("Please enter a Parcel ID.");
      return;
    }

    const capabilitiesUrl = `http://localhost:8080/geoserver/parcelws/ows?service=WFS&version=1.0.0&request=GetCapabilities`;

    fetch(capabilitiesUrl)
      .then((res) => res.text())
      .then((xmlText) => {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "text/xml");
        const featureTypes = xml.getElementsByTagName("FeatureType");
        const layerNames = [];

        for (let i = 0; i < featureTypes.length; i++) {
          const name =
            featureTypes[i].getElementsByTagName("Name")[0].textContent;
          layerNames.push(name);
        }

        let found = false;
        const promises = layerNames.map((name) => {
          const cqlFilter = `id_parcel='${parcelID}'`;
          const url = `http://localhost:8080/geoserver/parcelws/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=${name}&outputFormat=application/json&srsname=EPSG:3857&CQL_FILTER=${encodeURIComponent(
            cqlFilter
          )}`;

          return fetch(url)
            .then((res) => res.json())
            .then((geojson) => {
              const features = new ol.format.GeoJSON().readFeatures(geojson, {
                featureProjection: projection,
              });

              if (features.length > 0) {
                found = true;
                const feature = features[0];
                const geometry = feature.getGeometry();

                // Clear selection and set new
                selectionLayer.getSource().clear();
                selectionLayer.getSource().addFeature(feature);

                // Show info in sidebar
                const properties = feature.getProperties();
                delete properties.geometry;
                const infoList = document.getElementById("feature-info-list");
                infoList.innerHTML = "";
                for (const key in properties) {
                  const li = document.createElement("li");
                  li.innerHTML = `<strong>${key}</strong>: ${properties[key]}`;
                  infoList.appendChild(li);
                }
                document
                  .getElementById("feature-info")
                  .classList.remove("hidden");

                // Zoom to feature extent
                map.getView().fit(geometry.getExtent(), {
                  padding: [20, 20, 20, 20],
                  duration: 800,
                });
              }
            });
        });

        Promise.all(promises).then(() => {
          if (!found) {
            alert("Parcel not found in any layer.");
            selectionLayer.getSource().clear();
            document.getElementById("feature-info").classList.add("hidden");
          }
        });
      })
      .catch((err) => {
        console.error("Search error:", err);
        alert("Error searching across layers.");
      });
  });

  // ======= Measure Tool =======
  // ======= Measure Tool =======
  let draw;
  let snaps = [];
  let measureActive = false;

  const measureSource = new ol.source.Vector();
  const measureLayer = new ol.layer.Vector({
    source: measureSource,
    style: function (feature) {
      const geom = feature.getGeometry();
      let text = "";
      const unit = document.getElementById("unit-select")?.value || "meters";

      if (geom instanceof ol.geom.LineString) {
        text = formatLength(geom, unit);
      } else if (geom instanceof ol.geom.Polygon) {
        text = formatArea(geom, unit);
      }

      const styles = [
        // Style for geometry shape (polygon or line)
        new ol.style.Style({
          stroke: new ol.style.Stroke({ color: "#ffcc33", width: 2 }),
          fill: new ol.style.Fill({ color: "rgba(255, 255, 255, 0.4)" }),
          image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({ color: "#ffcc33" }),
          }),
        }),
      ];

      // Add label as separate style, positioned at interior point (for polygon)
      if (text) {
        styles.push(
          new ol.style.Style({
            text: new ol.style.Text({
              text: text,
              font: "14px sans-serif",
              fill: new ol.style.Fill({ color: "#000" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
              overflow: true,
              textAlign: "center",
              placement: "point",
            }),
            geometry:
              geom instanceof ol.geom.Polygon ? geom.getInteriorPoint() : geom, // for lines, keep as-is
          })
        );
      }

      return styles;
    },
  });
  measureLayer.setZIndex(200);
  map.addLayer(measureLayer);

  // --- Format helpers ---
  function formatLength(line, unit) {
    const length = ol.sphere.getLength(line);
    switch (unit) {
      case "kilometers":
        return (length / 1000).toFixed(3) + " km";
      case "feet":
        return (length * 3.28084).toFixed(2) + " ft";
      case "miles":
        return (length * 0.000621371).toFixed(4) + " mi";
      case "meters":
      default:
        return length.toFixed(2) + " m";
    }
  }

  function formatArea(polygon, unit) {
    const area = ol.sphere.getArea(polygon);
    switch (unit) {
      case "kilometers":
        return (area / 1e6).toFixed(3) + " km²";
      case "feet":
        return (area * 10.7639).toFixed(2) + " ft²";
      case "acres":
        return (area * 0.000247105).toFixed(4) + " acres";
      case "meters":
      default:
        return area.toFixed(2) + " m²";
    }
  }

  // --- Clear all measure drawings ---
  function clearMeasurement() {
    measureSource.clear(); // ✅ only clear on user action
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    snaps.forEach((snap) => map.removeInteraction(snap));
    snaps = [];
    document.getElementById("measure-result").innerHTML = "";
  }

<<<<<<< HEAD
  function formatLength(line, unit) {
    const length = ol.sphere.getLength(line);
    if (unit === "kilometers") return (length / 1000).toFixed(3) + " km";
    if (unit === "feet") return (length * 3.28084).toFixed(2) + " ft";
    if (unit === "miles") return (length * 0.000621371).toFixed(4) + " mi";
    return length.toFixed(2) + " m";
  }

  function formatArea(polygon, unit) {
    const area = ol.sphere.getArea(polygon);
    if (unit === "kilometers") return (area / 1e6).toFixed(3) + " km²";
    if (unit === "feet") return (area * 10.7639).toFixed(2) + " ft²";
    if (unit === "acres") return (area * 0.000247105).toFixed(4) + " acres";
    return area.toFixed(2) + " m²";
  }

=======
  // --- Add drawing interaction ---
>>>>>>> f76d4a0 (add new code)
  function addDrawInteraction() {
    // Don't clear previous features
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    snaps.forEach((snap) => map.removeInteraction(snap));
    snaps = [];

    let type =
      [...document.getElementsByName("measure-type")].find((r) => r.checked)
        ?.value || "length";
    type = type === "area" ? "Polygon" : "LineString";

    draw = new ol.interaction.Draw({
      source: measureSource,
      type: type,
    });
    map.addInteraction(draw);

<<<<<<< HEAD
    // Snapping: to all loaded geojson sources
    snaps = [];
=======
    // Reapply snapping
>>>>>>> f76d4a0 (add new code)
    if (typeof snappingSources !== "undefined") {
      snappingSources.forEach((source) => {
        const snap = new ol.interaction.Snap({ source });
        map.addInteraction(snap);
        snaps.push(snap);
      });
    }

    // Draw end handler: show result and label
    draw.on("drawend", function (e) {
      const geom = e.feature.getGeometry();
      const unit = document.getElementById("unit-select")?.value || "meters";
      const result =
        geom instanceof ol.geom.LineString
          ? formatLength(geom, unit)
          : formatArea(geom, unit);

      document.getElementById("measure-result").innerHTML = "Result: " + result;
      measureSource.changed(); // refresh style for label
    });
  }

<<<<<<< HEAD
  // Measure Tool Toggle Button
=======
  // --- Toggle measure tool button ---
>>>>>>> f76d4a0 (add new code)
  document.getElementById("measure-tool-btn").addEventListener("click", () => {
    measureActive = !measureActive;
    if (measureActive) {
      addDrawInteraction();
      measurePopup.classList.remove("hidden");
      searchBox.classList.add("hidden");
<<<<<<< HEAD
      // infoBox.classList.add("hidden");
=======
>>>>>>> f76d4a0 (add new code)
      layerPopup.classList.add("hidden");
      basemapPopup.classList.add("hidden");
    } else {
      clearMeasurement();
      measurePopup.classList.add("hidden");
    }
  });

<<<<<<< HEAD
  // Only update draw interaction if tool is active
  document.getElementsByName("measure-type").forEach((r) => {
    r.addEventListener("change", () => {
      if (measureActive) addDrawInteraction();
    });
  });
  document.getElementById("unit-select").addEventListener("change", () => {
    if (measureActive) addDrawInteraction();
  });

=======
  // --- Change listeners for unit + type ---
  document.getElementsByName("measure-type").forEach((r) => {
    r.addEventListener("change", () => {
      if (measureActive) addDrawInteraction(); // restart interaction
    });
  });
  document.getElementById("unit-select").addEventListener("change", () => {
    measureSource.changed(); // refresh label on all
  });

  // --- Clear measure button ---
>>>>>>> f76d4a0 (add new code)
  document
    .getElementById("clear-measure-btn")
    .addEventListener("click", clearMeasurement);

  // ======= Pin & Share Link Tool (ONLY IN MEASURE POPUP) =======
  const pinSource = new ol.source.Vector();
  const pinLayer = new ol.layer.Vector({
    source: pinSource,
    style: new ol.style.Style({
      image: new ol.style.Icon({
        src: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
        anchor: [0.5, 1],
        scale: 0.05,
      }),
    }),
  });
  pinLayer.setZIndex(100);
  map.addLayer(pinLayer);
  let pinDrawInteraction = null;
  let pinToolActive = false;

  function addPinInteraction() {
    removePinInteraction();
    pinDrawInteraction = new ol.interaction.Draw({
      source: pinSource,
      type: "Point",
    });
    pinDrawInteraction.on("drawend", (e) => {
      pinSource.clear();
      pinSource.addFeature(e.feature);
      const coord = ol.proj.toLonLat(e.feature.getGeometry().getCoordinates());
      const url = new URL(window.location);
      url.searchParams.set("pin_lon", coord[0].toFixed(6));
      url.searchParams.set("pin_lat", coord[1].toFixed(6));
      window.history.replaceState({}, "", url.toString());
      updateShareLink();
    });
    map.addInteraction(pinDrawInteraction);
  }

  function removePinInteraction() {
    if (pinDrawInteraction) {
      map.removeInteraction(pinDrawInteraction);
      pinDrawInteraction = null;
    }
  }

  function clearPin() {
    pinSource.clear();
    const url = new URL(window.location);
    url.searchParams.delete("pin_lon");
    url.searchParams.delete("pin_lat");
    window.history.replaceState({}, "", url.toString());
    updateShareLink();
  }

  function updateShareLink() {
    const url = new URL(window.location);
    const pin_lon = url.searchParams.get("pin_lon");
    const pin_lat = url.searchParams.get("pin_lat");
    const shareDiv = document.getElementById("share-pin-link");
    const pinText = document.getElementById("pin-link-text");
    if (pin_lon && pin_lat) {
      shareDiv.classList.remove("hidden");
      pinText.textContent = url.toString();
    } else {
      shareDiv.classList.add("hidden");
    }
  }

  (function loadPinFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const lon = parseFloat(urlParams.get("pin_lon"));
    const lat = parseFloat(urlParams.get("pin_lat"));
    if (!isNaN(lon) && !isNaN(lat)) {
      const coord = ol.proj.fromLonLat([lon, lat]);
      const pinFeature = new ol.Feature(new ol.geom.Point(coord));
      pinSource.clear();
      pinSource.addFeature(pinFeature);
      map.getView().animate({ center: coord, zoom: 18 });
      updateShareLink();
    }
  })();

  document
    .getElementById("pin-tool-popup-btn")
    .addEventListener("click", () => {
      pinToolActive = !pinToolActive;
      if (pinToolActive) {
        addPinInteraction();
        document.getElementById("share-pin-link").classList.remove("hidden");
      } else {
        removePinInteraction();
        clearPin();
        document.getElementById("share-pin-link").classList.add("hidden");
      }
    });

  document.getElementById("share-pin-link").addEventListener("click", () => {
    const pinText = document.getElementById("pin-link-text");
    if (pinText.textContent) {
      navigator.clipboard.writeText(pinText.textContent).then(() => {
        alert("Link copied to clipboard!");
      });
    }
  });

  // ======= Clear All Tool =======
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    clearMeasurement();
    // Clear KML Layer if it exists
    if (kmlLayer) {
      map.removeLayer(kmlLayer);
      kmlLayer = null;
    }
    // Clear KML file input (optional, if it exists)
    // const kmlInput = document.getElementById("kml-file-input");
    // if (kmlInput) kmlInput.value = "";
    // Update KML status message
    // const kmlStatus = document.getElementById("kml-status");
    // if (kmlStatus) {
    //   kmlStatus.textContent = "";
    //   kmlStatus.style.color = "#999";
    // }

    clearPin();
    removePinInteraction();
    pinToolActive = false;
    select.setActive(false);
    select.getFeatures().clear();
    selectionLayer.getSource().clear();
    document.getElementById("feature-info-list").innerHTML = "";
    infoBox.classList.add("hidden");
    measurePopup.classList.add("hidden");
    searchBox.classList.add("hidden");
    document.getElementById("parcel-search-input").value = "";
  });

  // --- Close all popups on map click (optional UX) ---
  map.on("click", function () {
    // Optionally close popups here if needed
  });

  // --- HELP MODAL LOGIC ---
  const helpBtn = document.getElementById("help-btn");
  const helpModal = document.getElementById("help-modal");
  const helpClose = document.getElementById("help-close");
  const mapDiv = document.getElementById("map");

  helpBtn.addEventListener("click", function () {
    helpModal.classList.remove("modal-hidden");
    mapDiv.classList.add("blur");
  });

  helpClose.addEventListener("click", function () {
    helpModal.classList.add("modal-hidden");
    mapDiv.classList.remove("blur");
  });

  // Close modal if click outside the content box
  helpModal.addEventListener("click", function (e) {
    if (e.target === helpModal) {
      helpModal.classList.add("modal-hidden");
      mapDiv.classList.remove("blur");
    }
  });

  // ======= Google Place Search (below Parcel ID search) =======
  let googleAutocompleteService = new google.maps.places.AutocompleteService();
  let googlePlacesService;
  let gmapDiv = document.createElement("div");
  document.body.appendChild(gmapDiv);
  googlePlacesService = new google.maps.places.PlacesService(gmapDiv);

  const googleInput = document.getElementById("google-place-input");
  const resultDiv = document.getElementById("google-places-result");

  // --- Autocomplete as you type ---
  googleInput.addEventListener("input", function () {
    const query = this.value.trim();
    resultDiv.innerHTML = "";
    if (!query) return;
    googleAutocompleteService.getPlacePredictions(
      { input: query },
      (predictions, status) => {
        if (
          status !== google.maps.places.PlacesServiceStatus.OK ||
          !predictions
        ) {
          resultDiv.innerHTML =
            "<div style='color:red;padding:6px;'>No results found.</div>";
          return;
        }
        resultDiv.innerHTML = "";
        predictions.forEach((pred) => {
          const div = document.createElement("div");
          div.className = "google-place-item";
          div.textContent = pred.description;
          div.onclick = () => {
            // Get place details by place_id
            googlePlacesService.getDetails(
              { placeId: pred.place_id },
              (place, status) => {
                if (
                  status === google.maps.places.PlacesServiceStatus.OK &&
                  place &&
                  place.geometry
                ) {
                  const loc = place.geometry.location;
                  const coord = ol.proj.fromLonLat([loc.lng(), loc.lat()]);
                  map
                    .getView()
                    .animate({ center: coord, zoom: 17, duration: 1000 });
                  // Optional: Place a marker at the found place
                  const markerSource = new ol.source.Vector();
                  const markerLayer = new ol.layer.Vector({
                    source: markerSource,
                    style: new ol.style.Style({
                      image: new ol.style.Icon({
                        src: "https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi-dotless2.png",
                        scale: 1,
                        anchor: [0.5, 1],
                      }),
                    }),
                  });
                  markerSource.clear();
                  markerSource.addFeature(
                    new ol.Feature(new ol.geom.Point(coord))
                  );
                  // Remove old place marker if exists
                  if (window.__googlePlaceLayer)
                    map.removeLayer(window.__googlePlaceLayer);
                  window.__googlePlaceLayer = markerLayer;
                  map.addLayer(markerLayer);

                  resultDiv.innerHTML = "";
                  document.getElementById("search-box").classList.add("hidden");
                } else {
                  alert("Could not get location details.");
                }
              }
            );
          };
          resultDiv.appendChild(div);
        });
      }
    );
  });

  // --- Optionally: let the "Search Place" button do the same thing as Enter key (not required, but for fallback/mobile)
  document
    .getElementById("google-place-search-btn")
    .addEventListener("click", function () {
      const query = googleInput.value.trim();
      if (!query) {
        alert("Please enter a place name.");
        return;
      }
      // Manually trigger the input event to show suggestions
      googleInput.dispatchEvent(new Event("input"));
    });

  // --- KML Import Tool ---
  let kmlLayer = null;
  document
    .getElementById("kml-file-input")
    .addEventListener("change", function (e) {
      const file = e.target.files[0];
      const statusDiv = document.getElementById("kml-status");
      if (!file) {
        statusDiv.textContent = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = function (event) {
        const kmlText = event.target.result;
        if (kmlLayer) map.removeLayer(kmlLayer);

        const format = new ol.format.KML();
        const features = format.readFeatures(kmlText, {
          dataProjection: "EPSG:4326",
          featureProjection: map.getView().getProjection(),
        });

        if (!features.length) {
          statusDiv.textContent = "No features found in KML.";
          statusDiv.style.color = "#c0392b";
          return;
        }

        const vectorSource = new ol.source.Vector({ features });
        kmlLayer = new ol.layer.Vector({
          source: vectorSource,
          zIndex: 1000,
          style: function (feature) {
            const type = feature.getGeometry().getType();
            if (type === "Point" || type === "MultiPoint") {
              return new ol.style.Style({
                image: new ol.style.Circle({
                  radius: 10,
                  fill: new ol.style.Fill({ color: "#00FF00" }),
                  stroke: new ol.style.Stroke({ color: "#333", width: 3 }),
                }),
              });
            }
            if (type === "LineString" || type === "MultiLineString") {
              return new ol.style.Style({
                stroke: new ol.style.Stroke({
                  color: "#FF0000",
                  width: 4,
                }),
              });
            }
            if (type === "Polygon" || type === "MultiPolygon") {
              return new ol.style.Style({
                stroke: new ol.style.Stroke({
                  color: "#0000FF",
                  width: 3,
                }),
                fill: new ol.style.Fill({
                  color: "rgba(0,0,255,0.2)",
                }),
              });
            }
            return null;
          },
        });

        map.addLayer(kmlLayer);

        map.getView().fit(vectorSource.getExtent(), {
          duration: 1000,
          padding: [40, 40, 40, 40],
          maxZoom: 18,
        });

        // statusDiv.textContent =
        //   "KML loaded successfully! Features: " + features.length;
        // statusDiv.style.color = "#00aa40";
      };
      reader.onerror = function () {
        statusDiv.textContent = "Failed to read KML file.";
        statusDiv.style.color = "#c0392b";
      };
      reader.readAsText(file);
    });
  document
    .getElementById("clear-kml-btn")
    .addEventListener("click", function () {
      // Remove KML layer if it exists
      if (kmlLayer) {
        map.removeLayer(kmlLayer);
        kmlLayer = null;
      }
      // Clear file input
      // const fileInput = document.getElementById("kml-file-input");
      // if (fileInput) fileInput.value = "";
      // Update status
      // const statusDiv = document.getElementById("kml-status");
      // if (statusDiv) {
      //   statusDiv.textContent = "";
      //   statusDiv.style.color = "#999";
      // }
    });

  // print

  document.getElementById("print-tool-btn").addEventListener("click", () => {
    // Make sure the parcel info is open if you want it printed
    document.getElementById("feature-info").classList.remove("hidden");

    // Add printing class
    document.body.classList.add("printing");

    // Force OpenLayers to repaint for print (replace 'map' with your OpenLayers map variable)
    setTimeout(() => {
      if (window.map && window.map.updateSize) {
        window.map.updateSize();
      }
      window.print();
      setTimeout(() => {
        document.body.classList.remove("printing");
      }, 500);
    }, 200);
  });
}
