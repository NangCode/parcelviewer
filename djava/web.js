window.onload = init;

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
  const geojsonFiles = [
    {
      url: "dsource/json/cad_parcel.geojson",
      stroke: "#FF0000",
      name: "Parcels",
    },
    {
      url: "dsource/json/v_boun.geojson",
      stroke: "#FF00FF",
      name: "Boundaries",
    },
  ];

  const geojsonLayers = [];
  const snappingSources = [];
  const layerControls = document.getElementById("layer-controls");

  geojsonFiles.forEach((file, index) => {
    const vectorSource = new ol.source.Vector({
      url: file.url,
      format: new ol.format.GeoJSON(),
    });
    const layer = new ol.layer.Vector({
      source: vectorSource,
      style: (feature, resolution) => {
        const showLabel = resolution <= 3;
        return new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: file.stroke,
            width: 2,
          }),
          fill: new ol.style.Fill({ color: "rgba(0,0,0,0)" }),
          text:
            showLabel && feature.get("ID_Parcel")
              ? new ol.style.Text({
                  font: "12px Calibri,sans-serif",
                  fill: new ol.style.Fill({ color: "#000" }),
                  stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
                  text: String(feature.get("ID_Parcel")),
                  overflow: true,
                })
              : undefined,
        });
      },
      visible: true,
    });
    layer.setZIndex(10 + index);
    map.addLayer(layer);
    geojsonLayers.push(layer);

    // Snapping source: wait for feature load
    vectorSource.on("change", function () {
      if (vectorSource.getState() === "ready") {
        if (!snappingSources.includes(vectorSource)) {
          snappingSources.push(vectorSource);
        }
      }
    });

    // --- Add checkbox control with text after checkbox and note under checkbox ---
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "0.75em";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `geojson-toggle-${index}`;
    checkbox.checked = true;

    const label = document.createElement("label");
    label.htmlFor = checkbox.id;
    label.style.marginLeft = "0.25em";
    label.textContent = file.name;

    // Note under checkbox
    const note = document.createElement("div");
    note.style.fontSize = "0.92em";
    note.style.color = "#666";
    note.style.marginLeft = "1.5em";
    note.textContent = file.note;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(label);
    wrapper.appendChild(note);

    layerControls.appendChild(wrapper);

    checkbox.addEventListener("change", () => {
      layer.setVisible(checkbox.checked);
    });
  });

  // ======= Select Parcel Tool =======
  const selectionLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "yellow", width: 4 }),
      fill: new ol.style.Fill({ color: "rgba(0,0,0,0)" }),
    }),
  });
  selectionLayer.setZIndex(99);
  map.addLayer(selectionLayer);

  const select = new ol.interaction.Select({
    layers: geojsonLayers,
    style: (feature) => {
      const idParcel = feature.get("ID_Parcel");
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "yellow", width: 4 }),
        fill: new ol.style.Fill({ color: "rgba(0,0,0,0)" }),
        text: idParcel
          ? new ol.style.Text({
              font: "12px Calibri,sans-serif",
              fill: new ol.style.Fill({ color: "#000" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
              text: String(idParcel),
              overflow: true,
            })
          : undefined,
      });
    },
  });
  select.setActive(false);
  map.addInteraction(select);

  function showParcelInfo(feature) {
    const infoList = document.getElementById("feature-info-list");
    infoList.innerHTML = "";
    const props = feature.getProperties();
    for (const key in props) {
      if (key !== "geometry") {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${key}:</strong> ${props[key]}`;
        infoList.appendChild(li);
      }
    }
    infoBox.classList.remove("hidden");
  }

  select.on("select", (e) => {
    selectionLayer.getSource().clear();
    const selected = e.selected;
    if (selected.length > 0) {
      selectionLayer.getSource().addFeature(selected[0].clone());
      showParcelInfo(selected[0]);
    } else {
      infoBox.classList.add("hidden");
    }
  });

  document.getElementById("select-tool-btn").addEventListener("click", () => {
    select.setActive(!select.getActive());
    if (select.getActive()) {
      measurePopup.classList.add("hidden");
      searchBox.classList.add("hidden");
      // infoBox.classList.add("hidden");
      layerPopup.classList.add("hidden");
      basemapPopup.classList.add("hidden");
    }
  });

  // ======= Search Parcel Tool =======
  document.getElementById("search-btn-inner").addEventListener("click", () => {
    const val = document.getElementById("parcel-search-input").value.trim();
    if (!val) {
      alert("Please enter an ID_Parcel.");
      return;
    }
    let found = null;
    for (const layer of geojsonLayers) {
      const features = layer.getSource().getFeatures();
      found = features.find((f) => String(f.get("ID_Parcel")) === val);
      if (found) break;
    }
    if (found) {
      map.getView().fit(found.getGeometry().getExtent(), {
        duration: 1000,
        padding: [50, 50, 50, 50],
      });
      selectionLayer.getSource().clear();
      selectionLayer.getSource().addFeature(found.clone());
      showParcelInfo(found);
      searchBox.classList.add("hidden");
    } else {
      alert(`No parcel found with ID_Parcel = "${val}"`);
    }
  });

  // ======= Measure Tool =======
  // ======= Measure Tool =======
  let draw;
  let snaps = [];
  let measureActive = false;

  const measureSource = new ol.source.Vector();
  const measureLayer = new ol.layer.Vector({
    source: measureSource,
    style: new ol.style.Style({
      fill: new ol.style.Fill({ color: "rgba(255, 255, 255, 0.4)" }),
      stroke: new ol.style.Stroke({ color: "#ffcc33", width: 2 }),
      image: new ol.style.Circle({
        radius: 7,
        fill: new ol.style.Fill({ color: "#ffcc33" }),
      }),
    }),
  });
  map.addLayer(measureLayer);

  function clearMeasurement() {
    measureSource.clear();
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    snaps.forEach((snap) => map.removeInteraction(snap));
    snaps = [];
    document.getElementById("measure-result").innerHTML = "";
  }

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

  function addDrawInteraction() {
    clearMeasurement();
    let type =
      [...document.getElementsByName("measure-type")].find((r) => r.checked)
        ?.value || "length";
    type = type === "area" ? "Polygon" : "LineString";
    draw = new ol.interaction.Draw({
      source: measureSource,
      type: type,
    });
    map.addInteraction(draw);

    // Snapping: to all loaded geojson sources
    snaps = [];
    if (typeof snappingSources !== "undefined") {
      snappingSources.forEach((source) => {
        const snap = new ol.interaction.Snap({ source });
        map.addInteraction(snap);
        snaps.push(snap);
      });
    }

    draw.on("drawend", (e) => {
      const geom = e.feature.getGeometry();
      const unit = document.getElementById("unit-select").value;
      const result =
        geom.getType() === "LineString"
          ? formatLength(geom, unit)
          : formatArea(geom, unit);
      document.getElementById("measure-result").innerHTML = "Result: " + result;
    });
  }

  // Measure Tool Toggle Button
  document.getElementById("measure-tool-btn").addEventListener("click", () => {
    measureActive = !measureActive;
    if (measureActive) {
      addDrawInteraction();
      measurePopup.classList.remove("hidden");
      searchBox.classList.add("hidden");
      // infoBox.classList.add("hidden");
      layerPopup.classList.add("hidden");
      basemapPopup.classList.add("hidden");
    } else {
      clearMeasurement();
      measurePopup.classList.add("hidden");
    }
  });

  // Only update draw interaction if tool is active
  document.getElementsByName("measure-type").forEach((r) => {
    r.addEventListener("change", () => {
      if (measureActive) addDrawInteraction();
    });
  });
  document.getElementById("unit-select").addEventListener("change", () => {
    if (measureActive) addDrawInteraction();
  });

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
