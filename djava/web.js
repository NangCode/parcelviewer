window.onload = init;
const hiddenKeys = ["Shape_leng", "Shape_area"];

function init() {
  const fieldLabels = {
    id_parcel: "លេខក្បាលដី",
  };

  // Projection
  const projection = ol.proj.get("EPSG:3857");

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
      center: ol.proj.fromLonLat([103.527339, 12.538695]),
      zoom: 16,
      projection: "EPSG:3857",
    }),
  });

  // --- Popup overlay ---
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

  // --- Mouse Position & Scale Line ---
  map.addControl(
    new ol.control.MousePosition({
      coordinateFormat: (coord) =>
        `Lon: ${coord[0].toFixed(5)} | Lat: ${coord[1].toFixed(5)}`,
      projection: "EPSG:4326",
      target: document.getElementById("mouse-position"),
      undefinedHTML: " ",
    })
  );
  map.addControl(
    new ol.control.ScaleLine({
      units: "metric",
      bar: true,
      text: true,
      target: document.getElementById("map-controls"),
    })
  );

  // --- Zoom & Locate buttons ---
  document
    .getElementById("zoom-in")
    .addEventListener("click", () =>
      map.getView().setZoom(map.getView().getZoom() + 1)
    );
  document
    .getElementById("zoom-out")
    .addEventListener("click", () =>
      map.getView().setZoom(map.getView().getZoom() - 1)
    );
  document.getElementById("locate").addEventListener("click", () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((pos) => {
        map.getView().animate({
          center: ol.proj.fromLonLat([
            pos.coords.longitude,
            pos.coords.latitude,
          ]),
          zoom: 18,
          duration: 900,
        });
      });
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  });

  // --- UI Popups ---
  const basemapPopup = document.getElementById("basemap-popup"),
    layerPopup = document.getElementById("layer-popup"),
    searchBox = document.getElementById("search-box"),
    measurePopup = document.getElementById("measure-popup"),
    infoBox = document.getElementById("feature-info");

  [
    { btn: "toggle-basemap", el: basemapPopup },
    { btn: "toggle-layer", el: layerPopup },
    { btn: "parcel-search-btn", el: searchBox },
    { btn: "parcel-info-btn", el: infoBox },
    { btn: "measure-tool-btn", el: measurePopup },
  ].forEach(({ btn, el }) =>
    document.getElementById(btn).addEventListener("click", () => {
      [basemapPopup, layerPopup, searchBox, measurePopup, infoBox].forEach(
        (e) => e.classList.add("hidden")
      );
      el.classList.toggle("hidden");
    })
  );

  // --- Basemap Switching ---
  document.querySelectorAll('input[name="basemap"]').forEach((radio) =>
    radio.addEventListener("change", function () {
      Object.entries(baseLayers).forEach(([key, layer]) =>
        layer.setVisible(key === this.value)
      );
    })
  );

  // ======= GeoJSON Layers =======
  const PARCEL_MAX_RESOLUTION = 100;
  const LABEL_RESOLUTION_THRESHOLD = 5.29;
  const snappingSources = [];

  // Parcels layer: transparent fill, steel-blue outline, labels, declutter
  const parcelSource = new ol.source.Vector({
    url: "json/v_02140503.geojson",
    format: new ol.format.GeoJSON(),
    strategy: ol.loadingstrategy.all,
  });
  snappingSources.push(parcelSource);

  const parcelLayer = new ol.layer.Vector({
    source: parcelSource,
    declutter: true,
    maxResolution: PARCEL_MAX_RESOLUTION,
    zIndex: 10,
  });
  parcelLayer.setStyle((feature, resolution) => {
    if (resolution > PARCEL_MAX_RESOLUTION) return null;

    const styles = [
      new ol.style.Style({
        stroke: new ol.style.Stroke({ color: "#4682B4", width: 1.5 }),
        fill: new ol.style.Fill({ color: "rgba(255,255,255,0)" }),
      }),
    ];

    if (resolution <= LABEL_RESOLUTION_THRESHOLD) {
      const id = feature.get("id_parcel");
      if (id != null) {
        styles.push(
          new ol.style.Style({
            text: new ol.style.Text({
              text: id.toString(),
              font: "bold 10px Arial",
              fill: new ol.style.Fill({ color: "#000" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 1 }),
              overflow: false, // drop overlapping labels
              placement: "point",
            }),
          })
        );
      }
    }

    return styles;
  });
  map.addLayer(parcelLayer);

  // Villages boundary layer: transparent fill, steel-blue outline, no labels
  const villagesSource = new ol.source.Vector({
    url: "json/Villages_Boundary.geojson",
    format: new ol.format.GeoJSON(),
    strategy: ol.loadingstrategy.all,
  });
  snappingSources.push(villagesSource);

  const villagesLayer = new ol.layer.Vector({
    source: villagesSource,
    zIndex: 9,
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "#4682B4", width: 1.5 }),
      fill: new ol.style.Fill({ color: "rgba(255,255,255,0)" }),
    }),
  });
  map.addLayer(villagesLayer);

  // --- Layer visibility controls ---
  const layerControls = document.getElementById("layer-controls");
  [
    ["parcels", parcelLayer],
    ["villages", villagesLayer],
  ].forEach(([name, layer], i) => {
    const cb = document.querySelector(`#toggle-${name}-${i}`);
    if (!cb) {
      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "0.75em";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.id = `toggle-${name}-${i}`;
      checkbox.checked = true;
      const lbl = document.createElement("label");
      lbl.htmlFor = checkbox.id;
      lbl.style.marginLeft = "0.25em";
      lbl.textContent =
        name === "parcels" ? "Land Parcels" : "Administrative Boundaries";
      wrapper.appendChild(checkbox);
      wrapper.appendChild(lbl);
      layerControls.appendChild(wrapper);
      checkbox.addEventListener("change", () =>
        layer.setVisible(checkbox.checked)
      );
    }
  });

  // 1) Create one shared “highlight” layer for both search & click-to-select:
  const selectionLayer = new ol.layer.Vector({
    source: new ol.source.Vector(),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: "yellow", width: 4 }),
      fill: new ol.style.Fill({ color: "rgba(255,255,0,0.2)" }),
    }),
  });
  selectionLayer.setZIndex(99);
  map.addLayer(selectionLayer);

  // 2) Make your Select interaction draw *into* that layer, not its own default overlay:
  const selectInteraction = new ol.interaction.Select({
    layers: (layer) => layer === parcelLayer, // only pick parcels
    hitTolerance: 5,
    style: null, // → use `selectionLayer`’s style
  });
  map.addInteraction(selectInteraction);
  selectInteraction.setActive(false);

  // 3) When a feature is selected, clone it into `selectionLayer` and show its props:
  selectInteraction.on("select", (e) => {
    const src = selectionLayer.getSource();
    src.clear();

    if (e.selected.length) {
      const feature = e.selected[0];
      // highlight it
      src.addFeature(feature.clone());

      // populate sidebar
      const infoBox = document.getElementById("feature-info");
      const list = document.getElementById("feature-info-list");
      list.innerHTML = "";
      const props = { ...feature.getProperties() };
      delete props.geometry;
      Object.entries(props).forEach(([k, v]) => {
        if (hiddenKeys.includes(k)) return;

        const label = fieldLabels[k] || k; // fallback to raw key
        const li = document.createElement("li");
        li.innerHTML = `<strong>${label}</strong>: ${v}`;
        list.appendChild(li);
      });

      infoBox.classList.remove("hidden");
    } else {
      // nothing selected → hide sidebar
      document.getElementById("feature-info").classList.add("hidden");
    }
  });

  // 4) Wire your “Select” button to toggle this interaction:
  document.getElementById("select-tool-btn").addEventListener("click", () => {
    const on = !selectInteraction.getActive();
    selectInteraction.setActive(on);
    document.getElementById("select-tool-btn").textContent = on
      ? "Disable Selection"
      : "Select";

    if (!on) {
      // turning it off: clear highlight & hide sidebar
      selectionLayer.getSource().clear();
      document.getElementById("feature-info").classList.add("hidden");
    }
  });

  // 5) And finally, in your Clear-All, clear that same layer and reset the input
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    // … your other clear logic …

    // clear parcel highlight
    select.getFeatures().clear();
    selectionLayer.getSource().clear();
    select.setActive(false);
    document.getElementById("select-tool-btn").textContent = "Select";

    // clear sidebar & search input
    document.getElementById("feature-info-list").innerHTML = "";
    infoBox.classList.add("hidden");
    document.getElementById("parcelSearchInput").value = ""; // note camelCase ID
  });

  // ======= Search Tool =======
  const searchBtn = document.getElementById("parcelSearchBtn");
  const searchInput = document.getElementById("parcelSearchInput");

  searchBtn.addEventListener("click", () => {
    const id = searchInput.value.trim();
    if (!id) {
      alert("Please enter a Parcel ID.");
      return;
    }

    // Pull from the same source you added your GeoJSON to:
    const features = parcelSource.getFeatures();
    const match = features.find((f) => `${f.get("id_parcel")}` === id);

    if (!match) {
      alert(`Parcel ID "${id}" not found.`);
      select.getFeatures().clear();
      infoBox.classList.add("hidden");
      return;
    }

    // Highlight it
    const selSrc = selectionLayer.getSource();
    selSrc.clear();
    selSrc.addFeature(match.clone());

    // Populate sidebar (hiding Shape_leng / Shape_area if you want)
    const list = document.getElementById("feature-info-list");
    list.innerHTML = "";
    const props = { ...match.getProperties() };
    delete props.geometry;
    Object.entries(props).forEach(([k, v]) => {
      if (k === "Shape_leng" || k === "Shape_area") return;
      const li = document.createElement("li");
      li.innerHTML = `<strong>${k}</strong>: ${v}`;
      list.appendChild(li);
    });
    infoBox.classList.remove("hidden");

    // Zoom to it
    map.getView().fit(match.getGeometry().getExtent(), {
      padding: [20, 20, 20, 20],
      duration: 800,
    });
  });

  // ======= Measure Tool =======
  let draw,
    snaps = [],
    measureActive = false;
  const measureSource = new ol.source.Vector();
  const measureLayer = new ol.layer.Vector({
    source: measureSource,
    zIndex: 200,
    style: (feature) => {
      const geom = feature.getGeometry();
      const unit = document.getElementById("unit-select").value || "meters";
      const text =
        geom instanceof ol.geom.LineString
          ? formatLength(geom, unit)
          : formatArea(geom, unit);
      const styles = [
        new ol.style.Style({
          stroke: new ol.style.Stroke({ color: "#ffcc33", width: 2 }),
          fill: new ol.style.Fill({ color: "rgba(255,255,255,0.4)" }),
          image: new ol.style.Circle({
            radius: 7,
            fill: new ol.style.Fill({ color: "#ffcc33" }),
          }),
        }),
      ];
      if (text) {
        styles.push(
          new ol.style.Style({
            text: new ol.style.Text({
              text,
              font: "14px sans-serif",
              fill: new ol.style.Fill({ color: "#000" }),
              stroke: new ol.style.Stroke({ color: "#fff", width: 3 }),
              overflow: true,
              placement: "point",
            }),
            geometry:
              geom instanceof ol.geom.Polygon ? geom.getInteriorPoint() : geom,
          })
        );
      }
      return styles;
    },
  });
  map.addLayer(measureLayer);

  function formatLength(line, unit) {
    const len = ol.sphere.getLength(line);
    if (unit === "kilometers") return (len / 1000).toFixed(3) + " km";
    if (unit === "feet") return (len * 3.28084).toFixed(2) + " ft";
    if (unit === "miles") return (len * 0.000621371).toFixed(4) + " mi";
    return len.toFixed(2) + " m";
  }
  function formatArea(poly, unit) {
    const area = ol.sphere.getArea(poly);
    if (unit === "kilometers") return (area / 1e6).toFixed(3) + " km²";
    if (unit === "feet") return (area * 10.7639).toFixed(2) + " ft²";
    if (unit === "acres") return (area * 0.000247105).toFixed(4) + " acres";
    return area.toFixed(2) + " m²";
  }

  function clearMeasurement() {
    measureSource.clear();
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    snaps.forEach((s) => map.removeInteraction(s));
    snaps = [];
    document.getElementById("measure-result").innerHTML = "";
  }

  function addDrawInteraction() {
    if (draw) {
      map.removeInteraction(draw);
      draw = null;
    }
    snaps.forEach((s) => map.removeInteraction(s));
    snaps = [];
    let type =
      [...document.getElementsByName("measure-type")].find((r) => r.checked)
        .value || "length";
    type = type === "area" ? "Polygon" : "LineString";
    draw = new ol.interaction.Draw({ source: measureSource, type });
    map.addInteraction(draw);
    snappingSources.forEach((src) => {
      const snap = new ol.interaction.Snap({ source: src });
      map.addInteraction(snap);
      snaps.push(snap);
    });
    draw.on("drawend", (e) => {
      const geom = e.feature.getGeometry();
      const unit = document.getElementById("unit-select").value || "meters";
      const result =
        geom instanceof ol.geom.LineString
          ? formatLength(geom, unit)
          : formatArea(geom, unit);
      document.getElementById("measure-result").innerHTML = "Result: " + result;
      measureSource.changed();
    });
  }

  document.getElementById("measure-tool-btn").addEventListener("click", () => {
    measureActive = !measureActive;

    if (measureActive) {
      measurePopup.classList.remove("hidden"); // show panel first
    } else {
      clearMeasurement();
      measurePopup.classList.add("hidden");
    }
  });

  document
    .getElementsByName("measure-type")
    .forEach((r) =>
      r.addEventListener("change", () => measureActive && addDrawInteraction())
    );
  document
    .getElementById("unit-select")
    .addEventListener("change", () =>
      measureActive ? addDrawInteraction() : measureSource.changed()
    );
  document
    .getElementById("clear-measure-btn")
    .addEventListener("click", clearMeasurement);

  // ======= Pin & Share Tool =======
  const pinSource = new ol.source.Vector();
  const pinLayer = new ol.layer.Vector({
    source: pinSource,
    zIndex: 100,
    style: new ol.style.Style({
      image: new ol.style.Icon({
        src: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
        anchor: [0.5, 1],
        scale: 0.05,
      }),
    }),
  });
  map.addLayer(pinLayer);
  let pinDraw = null,
    pinActive = false;

  function addPin() {
    removePin();
    pinDraw = new ol.interaction.Draw({ source: pinSource, type: "Point" });
    pinDraw.on("drawend", (e) => {
      pinSource.clear();
      pinSource.addFeature(e.feature);
      const [lon, lat] = ol.proj.toLonLat(
        e.feature.getGeometry().getCoordinates()
      );
      const u = new URL(window.location);
      u.searchParams.set("pin_lon", lon.toFixed(6));
      u.searchParams.set("pin_lat", lat.toFixed(6));
      window.history.replaceState({}, "", u);
      updatePinLink();
    });
    map.addInteraction(pinDraw);
  }
  function removePin() {
    if (pinDraw) map.removeInteraction(pinDraw), (pinDraw = null);
  }
  function clearPin() {
    pinSource.clear();
    const u = new URL(window.location);
    u.searchParams.delete("pin_lon");
    u.searchParams.delete("pin_lat");
    window.history.replaceState({}, "", u);
    updatePinLink();
  }
  function updatePinLink() {
    const u = new URL(window.location);
    const lon = u.searchParams.get("pin_lon"),
      lat = u.searchParams.get("pin_lat");
    const shareDiv = document.getElementById("share-pin-link"),
      pinText = document.getElementById("pin-link-text");
    if (lon && lat) {
      shareDiv.classList.remove("hidden");
      pinText.textContent = u.toString();
    } else {
      shareDiv.classList.add("hidden");
    }
  }
  (function loadPin() {
    const p = new URLSearchParams(window.location.search);
    const lon = parseFloat(p.get("pin_lon")),
      lat = parseFloat(p.get("pin_lat"));
    if (!isNaN(lon) && !isNaN(lat)) {
      const coord = ol.proj.fromLonLat([lon, lat]);
      pinSource.clear();
      pinSource.addFeature(new ol.Feature(new ol.geom.Point(coord)));
      map.getView().animate({ center: coord, zoom: 18 });
      updatePinLink();
    }
  })();

  document
    .getElementById("pin-tool-popup-btn")
    .addEventListener("click", () => {
      pinActive = !pinActive;
      if (pinActive) {
        addPin();
        document.getElementById("share-pin-link").classList.remove("hidden");
      } else {
        removePin();
        clearPin();
        document.getElementById("share-pin-link").classList.add("hidden");
      }
    });
  document.getElementById("share-pin-link").addEventListener("click", () => {
    const txt = document.getElementById("pin-link-text").textContent;
    if (txt)
      navigator.clipboard.writeText(txt).then(() => alert("Link copied!"));
  });

  // ======= Clear All =======
  document.getElementById("clear-all-btn").addEventListener("click", () => {
    // 1) Clear any active drawing/measurements
    clearMeasurement();

    // 2) Remove KML layer if present
    if (window.kmlLayer) {
      map.removeLayer(window.kmlLayer);
      window.kmlLayer = null;
    }

    // 3) Clear pin & remove its interaction
    clearPin();
    removePin();
    pinActive = false;

    // 4) Clear any Google-places markers
    if (window.__googlePlaceLayer) {
      map.removeLayer(window.__googlePlaceLayer);
      window.__googlePlaceLayer = null;
    }
    document.getElementById("google-places-result").innerHTML = "";

    // 5) Clear parcel highlight & disable select tool
    //    (use selectInteraction, not the old `select`)
    selectionLayer.getSource().clear();
    selectInteraction.getFeatures().clear();
    selectInteraction.setActive(false);
    document.getElementById("select-tool-btn").textContent = "Select";

    // 6) Hide all popup panels
    [basemapPopup, layerPopup, searchBox, measurePopup, infoBox].forEach((el) =>
      el.classList.add("hidden")
    );
    popupOverlay.setPosition(undefined);

    // 7) Clear sidebar info
    document.getElementById("feature-info-list").innerHTML = "";

    // 8) Reset search inputs (note the exact IDs!)
    document.getElementById("parcelSearchInput").value = "";
    document.getElementById("google-place-input").value = "";

    // 9) Hide share-pin link if visible
    document.getElementById("share-pin-link").classList.add("hidden");

    // 10) Restore map view to default center & zoom
    // map.getView().setCenter(ol.proj.fromLonLat([103.527339, 12.538695]));
    // map.getView().setZoom(16);
  });

  // --- HELP Modal ---
  const helpBtn = document.getElementById("help-btn"),
    helpModal = document.getElementById("help-modal"),
    helpClose = document.getElementById("help-close"),
    mapDiv = document.getElementById("map");
  helpBtn.addEventListener("click", () => {
    helpModal.classList.remove("modal-hidden");
    mapDiv.classList.add("blur");
  });
  helpClose.addEventListener("click", () => {
    helpModal.classList.add("modal-hidden");
    mapDiv.classList.remove("blur");
  });
  helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) {
      helpModal.classList.add("modal-hidden");
      mapDiv.classList.remove("blur");
    }
  });

  // ======= Google Places Search =======
  const googleInput = document.getElementById("google-place-input"),
    resultDiv = document.getElementById("google-places-result");
  const acService = new google.maps.places.AutocompleteService();
  const placesService = new google.maps.places.PlacesService(
    document.createElement("div")
  );

  googleInput.addEventListener("input", function () {
    const q = this.value.trim();
    resultDiv.innerHTML = "";
    if (!q) return;
    acService.getPlacePredictions({ input: q }, (preds, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !preds) {
        resultDiv.innerHTML =
          "<div style='color:red;padding:6px;'>No results.</div>";
        return;
      }
      preds.forEach((pred) => {
        const div = document.createElement("div");
        div.className = "google-place-item";
        div.textContent = pred.description;
        div.onclick = () => {
          placesService.getDetails({ placeId: pred.place_id }, (place, st) => {
            if (
              st === google.maps.places.PlacesServiceStatus.OK &&
              place.geometry
            ) {
              const loc = place.geometry.location;
              const coord = ol.proj.fromLonLat([loc.lng(), loc.lat()]);
              map
                .getView()
                .animate({ center: coord, zoom: 17, duration: 1000 });
              const mSource = new ol.source.Vector();
              const mLayer = new ol.layer.Vector({
                source: mSource,
                style: new ol.style.Style({
                  image: new ol.style.Icon({
                    src: "https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi-dotless2.png",
                    scale: 1,
                    anchor: [0.5, 1],
                  }),
                }),
              });
              mSource.addFeature(new ol.Feature(new ol.geom.Point(coord)));
              if (window.__googlePlaceLayer)
                map.removeLayer(window.__googlePlaceLayer);
              window.__googlePlaceLayer = mLayer;
              map.addLayer(mLayer);
              resultDiv.innerHTML = "";
              searchBox.classList.add("hidden");
            } else {
              alert("Could not get location details.");
            }
          });
        };
        resultDiv.appendChild(div);
      });
    });
  });

  document
    .getElementById("google-place-search-btn")
    .addEventListener("click", () => {
      const q = googleInput.value.trim();
      if (!q) {
        alert("Please enter a place.");
        return;
      }
      googleInput.dispatchEvent(new Event("input"));
    });

  // --- KML Import ---
  let kmlLayer = null;
  document.getElementById("kml-file-input").addEventListener("change", (e) => {
    const file = e.target.files[0],
      statusDiv = document.getElementById("kml-status");
    if (!file) {
      statusDiv.textContent = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      if (kmlLayer) map.removeLayer(kmlLayer);
      const format = new ol.format.KML();
      const features = format.readFeatures(evt.target.result, {
        dataProjection: "EPSG:4326",
        featureProjection: map.getView().getProjection(),
      });
      if (!features.length) {
        statusDiv.textContent = "No features found.";
        statusDiv.style.color = "#c0392b";
        return;
      }
      const src = new ol.source.Vector({ features });
      kmlLayer = new ol.layer.Vector({
        source: src,
        zIndex: 1000,
        style: (feature) => {
          const t = feature.getGeometry().getType();
          if (t === "Point" || t === "MultiPoint")
            return new ol.style.Style({
              image: new ol.style.Circle({
                radius: 10,
                fill: new ol.style.Fill({ color: "#00FF00" }),
                stroke: new ol.style.Stroke({ color: "#333", width: 3 }),
              }),
            });
          if (t === "LineString" || t === "MultiLineString")
            return new ol.style.Style({
              stroke: new ol.style.Stroke({ color: "#FF0000", width: 4 }),
            });
          if (t === "Polygon" || t === "MultiPolygon")
            return new ol.style.Style({
              stroke: new ol.style.Stroke({ color: "#0000FF", width: 3 }),
              fill: new ol.style.Fill({ color: "rgba(0,0,255,0.2)" }),
            });
        },
      });
      map.addLayer(kmlLayer);
      map.getView().fit(src.getExtent(), {
        duration: 1000,
        padding: [40, 40, 40, 40],
        maxZoom: 18,
      });
      statusDiv.textContent = `Features loaded: ${features.length}`;
      statusDiv.style.color = "#00aa40";
    };
    reader.onerror = () => {
      document.getElementById("kml-status").textContent =
        "Failed to read file.";
    };
    reader.readAsText(file);
  });
  document.getElementById("clear-kml-btn").addEventListener("click", () => {
    if (kmlLayer) map.removeLayer(kmlLayer), (kmlLayer = null);
  });

  // --- Print Tool ---
  document.getElementById("print-tool-btn").addEventListener("click", () => {
    infoBox.classList.remove("hidden");
    document.body.classList.add("printing");
    setTimeout(() => {
      if (window.map && window.map.updateSize) window.map.updateSize();
      window.print();
      setTimeout(() => document.body.classList.remove("printing"), 500);
    }, 200);
  });
}
