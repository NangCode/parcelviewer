(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.proj4 = factory());
})(this, (function () { 'use strict';

  function globals (defs) {
    defs('EPSG:4326', '+title=WGS 84 (long/lat) +proj=longlat +ellps=WGS84 +datum=WGS84 +units=degrees');
    defs('EPSG:4269', '+title=NAD83 (long/lat) +proj=longlat +a=6378137.0 +b=6356752.31414036 +ellps=GRS80 +datum=NAD83 +units=degrees');
    defs('EPSG:3857', '+title=WGS 84 / Pseudo-Mercator +proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +no_defs');
    // UTM WGS84
    for (var i = 1; i <= 60; ++i) {
      defs('EPSG:' + (32600 + i), '+proj=utm +zone=' + i + ' +datum=WGS84 +units=m');
      defs('EPSG:' + (32700 + i), '+proj=utm +zone=' + i + ' +south +datum=WGS84 +units=m');
    }

    defs.WGS84 = defs['EPSG:4326'];
    defs['EPSG:3785'] = defs['EPSG:3857']; // maintain backward compat, official code is 3857
    defs.GOOGLE = defs['EPSG:3857'];
    defs['EPSG:900913'] = defs['EPSG:3857'];
    defs['EPSG:102113'] = defs['EPSG:3857'];
  }

  var PJD_3PARAM = 1;
  var PJD_7PARAM = 2;
  var PJD_GRIDSHIFT = 3;
  var PJD_WGS84 = 4; // WGS84 or equivalent
  var PJD_NODATUM = 5; // WGS84 or equivalent
  var SRS_WGS84_SEMIMAJOR = 6378137.0; // only used in grid shift transforms
  var SRS_WGS84_SEMIMINOR = 6356752.314; // only used in grid shift transforms
  var SRS_WGS84_ESQUARED = 0.0066943799901413165; // only used in grid shift transforms
  var SEC_TO_RAD = 4.84813681109535993589914102357e-6;
  var HALF_PI = Math.PI / 2;
  // ellipoid pj_set_ell.c
  var SIXTH = 0.1666666666666666667;
  /* 1/6 */
  var RA4 = 0.04722222222222222222;
  /* 17/360 */
  var RA6 = 0.02215608465608465608;
  var EPSLN = 1.0e-10;
  // you'd think you could use Number.EPSILON above but that makes
  // Mollweide get into an infinate loop.

  var D2R$1 = 0.01745329251994329577;
  var R2D = 57.29577951308232088;
  var FORTPI = Math.PI / 4;
  var TWO_PI = Math.PI * 2;
  // SPI is slightly greater than Math.PI, so values that exceed the -180..180
  // degree range by a tiny amount don't get wrapped. This prevents points that
  // have drifted from their original location along the 180th meridian (due to
  // floating point error) from changing their sign.
  var SPI = 3.14159265359;

  var exports$1 = {};

  exports$1.greenwich = 0.0; // "0dE",
  exports$1.lisbon = -9.131906111111; // "9d07'54.862\"W",
  exports$1.paris = 2.337229166667; // "2d20'14.025\"E",
  exports$1.bogota = -74.080916666667; // "74d04'51.3\"W",
  exports$1.madrid = -3.687938888889; // "3d41'16.58\"W",
  exports$1.rome = 12.452333333333; // "12d27'8.4\"E",
  exports$1.bern = 7.439583333333; // "7d26'22.5\"E",
  exports$1.jakarta = 106.807719444444; // "106d48'27.79\"E",
  exports$1.ferro = -17.666666666667; // "17d40'W",
  exports$1.brussels = 4.367975; // "4d22'4.71\"E",
  exports$1.stockholm = 18.058277777778; // "18d3'29.8\"E",
  exports$1.athens = 23.7163375; // "23d42'58.815\"E",
  exports$1.oslo = 10.722916666667; // "10d43'22.5\"E"

  var units = {
    mm: { to_meter: 0.001 },
    cm: { to_meter: 0.01 },
    ft: { to_meter: 0.3048 },
    'us-ft': { to_meter: 1200 / 3937 },
    fath: { to_meter: 1.8288 },
    kmi: { to_meter: 1852 },
    'us-ch': { to_meter: 20.1168402336805 },
    'us-mi': { to_meter: 1609.34721869444 },
    km: { to_meter: 1000 },
    'ind-ft': { to_meter: 0.30479841 },
    'ind-yd': { to_meter: 0.91439523 },
    mi: { to_meter: 1609.344 },
    yd: { to_meter: 0.9144 },
    ch: { to_meter: 20.1168 },
    link: { to_meter: 0.201168 },
    dm: { to_meter: 0.1 },
    in: { to_meter: 0.0254 },
    'ind-ch': { to_meter: 20.11669506 },
    'us-in': { to_meter: 0.025400050800101 },
    'us-yd': { to_meter: 0.914401828803658 }
  };

  var ignoredChar = /[\s_\-\/\(\)]/g;
  function match(obj, key) {
    if (obj[key]) {
      return obj[key];
    }
    var keys = Object.keys(obj);
    var lkey = key.toLowerCase().replace(ignoredChar, '');
    var i = -1;
    var testkey, processedKey;
    while (++i < keys.length) {
      testkey = keys[i];
      processedKey = testkey.toLowerCase().replace(ignoredChar, '');
      if (processedKey === lkey) {
        return obj[testkey];
      }
    }
  }

  function projStr (defData) {
    var self = {};
    var paramObj = defData.split('+').map(function (v) {
      return v.trim();
    }).filter(function (a) {
      return a;
    }).reduce(function (p, a) {
      var split = a.split('=');
      split.push(true);
      p[split[0].toLowerCase()] = split[1];
      return p;
    }, {});
    var paramName, paramVal, paramOutname;
    var params = {
      proj: 'projName',
      datum: 'datumCode',
      rf: function (v) {
        self.rf = parseFloat(v);
      },
      lat_0: function (v) {
        self.lat0 = v * D2R$1;
      },
      lat_1: function (v) {
        self.lat1 = v * D2R$1;
      },
      lat_2: function (v) {
        self.lat2 = v * D2R$1;
      },
      lat_ts: function (v) {
        self.lat_ts = v * D2R$1;
      },
      lon_0: function (v) {
        self.long0 = v * D2R$1;
      },
      lon_1: function (v) {
        self.long1 = v * D2R$1;
      },
      lon_2: function (v) {
        self.long2 = v * D2R$1;
      },
      alpha: function (v) {
        self.alpha = parseFloat(v) * D2R$1;
      },
      gamma: function (v) {
        self.rectified_grid_angle = parseFloat(v) * D2R$1;
      },
      lonc: function (v) {
        self.longc = v * D2R$1;
      },
      x_0: function (v) {
        self.x0 = parseFloat(v);
      },
      y_0: function (v) {
        self.y0 = parseFloat(v);
      },
      k_0: function (v) {
        self.k0 = parseFloat(v);
      },
      k: function (v) {
        self.k0 = parseFloat(v);
      },
      a: function (v) {
        self.a = parseFloat(v);
      },
      b: function (v) {
        self.b = parseFloat(v);
      },
      r: function (v) {
        self.a = self.b = parseFloat(v);
      },
      r_a: function () {
        self.R_A = true;
      },
      zone: function (v) {
        self.zone = parseInt(v, 10);
      },
      south: function () {
        self.utmSouth = true;
      },
      towgs84: function (v) {
        self.datum_params = v.split(',').map(function (a) {
          return parseFloat(a);
        });
      },
      to_meter: function (v) {
        self.to_meter = parseFloat(v);
      },
      units: function (v) {
        self.units = v;
        var unit = match(units, v);
        if (unit) {
          self.to_meter = unit.to_meter;
        }
      },
      from_greenwich: function (v) {
        self.from_greenwich = v * D2R$1;
      },
      pm: function (v) {
        var pm = match(exports$1, v);
        self.from_greenwich = (pm ? pm : parseFloat(v)) * D2R$1;
      },
      nadgrids: function (v) {
        if (v === '@null') {
          self.datumCode = 'none';
        } else {
          self.nadgrids = v;
        }
      },
      axis: function (v) {
        var legalAxis = 'ewnsud';
        if (v.length === 3 && legalAxis.indexOf(v.substr(0, 1)) !== -1 && legalAxis.indexOf(v.substr(1, 1)) !== -1 && legalAxis.indexOf(v.substr(2, 1)) !== -1) {
          self.axis = v;
        }
      },
      approx: function () {
        self.approx = true;
      }
    };
    for (paramName in paramObj) {
      paramVal = paramObj[paramName];
      if (paramName in params) {
        paramOutname = params[paramName];
        if (typeof paramOutname === 'function') {
          paramOutname(paramVal);
        } else {
          self[paramOutname] = paramVal;
        }
      } else {
        self[paramName] = paramVal;
      }
    }
    if (typeof self.datumCode === 'string' && self.datumCode !== 'WGS84') {
      self.datumCode = self.datumCode.toLowerCase();
    }
    return self;
  }

  class PROJJSONBuilderBase {
    static getId(node) {
      const idNode = node.find((child) => Array.isArray(child) && child[0] === "ID");
      if (idNode && idNode.length >= 3) {
        return {
          authority: idNode[1],
          code: parseInt(idNode[2], 10),
        };
      }
      return null;
    }

    static convertUnit(node, type = "unit") {
      if (!node || node.length < 3) {
        return { type, name: "unknown", conversion_factor: null };
      }

      const name = node[1];
      const conversionFactor = parseFloat(node[2]) || null;

      const idNode = node.find((child) => Array.isArray(child) && child[0] === "ID");
      const id = idNode
        ? {
            authority: idNode[1],
            code: parseInt(idNode[2], 10),
          }
        : null;

      return {
        type,
        name,
        conversion_factor: conversionFactor,
        id,
      };
    }

    static convertAxis(node) {
      const name = node[1] || "Unknown";

      // Determine the direction
      let direction;
      const abbreviationMatch = name.match(/^\((.)\)$/); // Match abbreviations like "(E)" or "(N)"
      if (abbreviationMatch) {
        // Use the abbreviation to determine the direction
        const abbreviation = abbreviationMatch[1].toUpperCase();
        if (abbreviation === 'E') direction = 'east';
        else if (abbreviation === 'N') direction = 'north';
        else if (abbreviation === 'U') direction = 'up';
        else throw new Error(`Unknown axis abbreviation: ${abbreviation}`);
      } else {
        // Use the explicit direction provided in the AXIS node
        direction = node[2]?.toLowerCase() || "unknown";
      }

      const orderNode = node.find((child) => Array.isArray(child) && child[0] === "ORDER");
      const order = orderNode ? parseInt(orderNode[1], 10) : null;

      const unitNode = node.find(
        (child) =>
          Array.isArray(child) &&
          (child[0] === "LENGTHUNIT" || child[0] === "ANGLEUNIT" || child[0] === "SCALEUNIT")
      );
      const unit = this.convertUnit(unitNode);

      return {
        name,
        direction, // Use the valid PROJJSON direction value
        unit,
        order,
      };
    }

    static extractAxes(node) {
      return node
        .filter((child) => Array.isArray(child) && child[0] === "AXIS")
        .map((axis) => this.convertAxis(axis))
        .sort((a, b) => (a.order || 0) - (b.order || 0)); // Sort by the "order" property
    }

    static convert(node, result = {}) {

      switch (node[0]) {
        case "PROJCRS":
          result.type = "ProjectedCRS";
          result.name = node[1];
          result.base_crs = node.find((child) => Array.isArray(child) && child[0] === "BASEGEOGCRS")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "BASEGEOGCRS"))
            : null;
          result.conversion = node.find((child) => Array.isArray(child) && child[0] === "CONVERSION")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "CONVERSION"))
            : null;

          const csNode = node.find((child) => Array.isArray(child) && child[0] === "CS");
          if (csNode) {
            result.coordinate_system = {
              type: csNode[1],
              axis: this.extractAxes(node),
            };
          }

          const lengthUnitNode = node.find((child) => Array.isArray(child) && child[0] === "LENGTHUNIT");
          if (lengthUnitNode) {
            const unit = this.convertUnit(lengthUnitNode);
            result.coordinate_system.unit = unit; // Add unit to coordinate_system
          }

          result.id = this.getId(node);
          break;

        case "BASEGEOGCRS":
        case "GEOGCRS":
          result.type = "GeographicCRS";
          result.name = node[1];
        
          // Handle DATUM or ENSEMBLE
          const datumOrEnsembleNode = node.find(
            (child) => Array.isArray(child) && (child[0] === "DATUM" || child[0] === "ENSEMBLE")
          );
          if (datumOrEnsembleNode) {
            const datumOrEnsemble = this.convert(datumOrEnsembleNode);
            if (datumOrEnsembleNode[0] === "ENSEMBLE") {
              result.datum_ensemble = datumOrEnsemble;
            } else {
              result.datum = datumOrEnsemble;
            }
            const primem = node.find((child) => Array.isArray(child) && child[0] === "PRIMEM");
            if (primem && primem[1] !== 'Greenwich') {
              datumOrEnsemble.prime_meridian = {
                name: primem[1],
                longitude: parseFloat(primem[2]),
              };
            }
          }
        
          result.coordinate_system = {
            type: "ellipsoidal",
            axis: this.extractAxes(node),
          };
        
          result.id = this.getId(node);
          break;

        case "DATUM":
          result.type = "GeodeticReferenceFrame";
          result.name = node[1];
          result.ellipsoid = node.find((child) => Array.isArray(child) && child[0] === "ELLIPSOID")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "ELLIPSOID"))
            : null;
          break;
        
        case "ENSEMBLE":
          result.type = "DatumEnsemble";
          result.name = node[1];
        
          // Extract ensemble members
          result.members = node
            .filter((child) => Array.isArray(child) && child[0] === "MEMBER")
            .map((member) => ({
              type: "DatumEnsembleMember",
              name: member[1],
              id: this.getId(member), // Extract ID as { authority, code }
            }));
        
          // Extract accuracy
          const accuracyNode = node.find((child) => Array.isArray(child) && child[0] === "ENSEMBLEACCURACY");
          if (accuracyNode) {
            result.accuracy = parseFloat(accuracyNode[1]);
          }
        
          // Extract ellipsoid
          const ellipsoidNode = node.find((child) => Array.isArray(child) && child[0] === "ELLIPSOID");
          if (ellipsoidNode) {
            result.ellipsoid = this.convert(ellipsoidNode); // Convert the ellipsoid node
          }
        
          // Extract identifier for the ensemble
          result.id = this.getId(node);
          break;

        case "ELLIPSOID":
          result.type = "Ellipsoid";
          result.name = node[1];
          result.semi_major_axis = parseFloat(node[2]);
          result.inverse_flattening = parseFloat(node[3]);
          node.find((child) => Array.isArray(child) && child[0] === "LENGTHUNIT")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "LENGTHUNIT"), result)
            : null;
          break;

        case "CONVERSION":
          result.type = "Conversion";
          result.name = node[1];
          result.method = node.find((child) => Array.isArray(child) && child[0] === "METHOD")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "METHOD"))
            : null;
          result.parameters = node
            .filter((child) => Array.isArray(child) && child[0] === "PARAMETER")
            .map((param) => this.convert(param));
          break;

        case "METHOD":
          result.type = "Method";
          result.name = node[1];
          result.id = this.getId(node);
          break;

        case "PARAMETER":
          result.type = "Parameter";
          result.name = node[1];
          result.value = parseFloat(node[2]);
          result.unit = this.convertUnit(
            node.find(
              (child) =>
                Array.isArray(child) &&
                (child[0] === "LENGTHUNIT" || child[0] === "ANGLEUNIT" || child[0] === "SCALEUNIT")
            )
          );
          result.id = this.getId(node);
          break;

        case "BOUNDCRS":
          result.type = "BoundCRS";

          // Process SOURCECRS
          const sourceCrsNode = node.find((child) => Array.isArray(child) && child[0] === "SOURCECRS");
          if (sourceCrsNode) {
            const sourceCrsContent = sourceCrsNode.find((child) => Array.isArray(child));
            result.source_crs = sourceCrsContent ? this.convert(sourceCrsContent) : null;
          }

          // Process TARGETCRS
          const targetCrsNode = node.find((child) => Array.isArray(child) && child[0] === "TARGETCRS");
          if (targetCrsNode) {
            const targetCrsContent = targetCrsNode.find((child) => Array.isArray(child));
            result.target_crs = targetCrsContent ? this.convert(targetCrsContent) : null;
          }

          // Process ABRIDGEDTRANSFORMATION
          const transformationNode = node.find((child) => Array.isArray(child) && child[0] === "ABRIDGEDTRANSFORMATION");
          if (transformationNode) {
            result.transformation = this.convert(transformationNode);
          } else {
            result.transformation = null;
          }
          break;

        case "ABRIDGEDTRANSFORMATION":
          result.type = "Transformation";
          result.name = node[1];
          result.method = node.find((child) => Array.isArray(child) && child[0] === "METHOD")
            ? this.convert(node.find((child) => Array.isArray(child) && child[0] === "METHOD"))
            : null;

          result.parameters = node
            .filter((child) => Array.isArray(child) && (child[0] === "PARAMETER" || child[0] === "PARAMETERFILE"))
            .map((param) => {
              if (param[0] === "PARAMETER") {
                return this.convert(param);
              } else if (param[0] === "PARAMETERFILE") {
                return {
                  name: param[1],
                  value: param[2],
                  id: {
                    "authority": "EPSG",
                    "code": 8656
                  }
                };
              }
            });

          // Adjust the Scale difference parameter if present
          if (result.parameters.length === 7) {
            const scaleDifference = result.parameters[6];
            if (scaleDifference.name === "Scale difference") {
              scaleDifference.value = Math.round((scaleDifference.value - 1) * 1e12) / 1e6;
            }
          }

          result.id = this.getId(node);
          break;
        
        case "AXIS":
          if (!result.coordinate_system) {
            result.coordinate_system = { type: "unspecified", axis: [] };
          }
          result.coordinate_system.axis.push(this.convertAxis(node));
          break;
        
        case "LENGTHUNIT":
          const unit = this.convertUnit(node, 'LinearUnit');
          if (result.coordinate_system && result.coordinate_system.axis) {
            result.coordinate_system.axis.forEach((axis) => {
              if (!axis.unit) {
                axis.unit = unit;
              }
            });
          }
          if (unit.conversion_factor && unit.conversion_factor !== 1) {
            if (result.semi_major_axis) {
              result.semi_major_axis = {
                value: result.semi_major_axis,
                unit,
              };
            }
          }
          break;

        default:
          result.keyword = node[0];
          break;
      }

      return result;
    }
  }

  class PROJJSONBuilder2015 extends PROJJSONBuilderBase {
    static convert(node, result = {}) {
      super.convert(node, result);

      // Skip `CS` and `USAGE` nodes for WKT2-2015
      if (result.coordinate_system?.subtype === "Cartesian") {
        delete result.coordinate_system;
      }
      if (result.usage) {
        delete result.usage;
      }

      return result;
    }
  }

  class PROJJSONBuilder2019 extends PROJJSONBuilderBase {
    static convert(node, result = {}) {
      super.convert(node, result);

      // Handle `CS` node for WKT2-2019
      const csNode = node.find((child) => Array.isArray(child) && child[0] === "CS");
      if (csNode) {
        result.coordinate_system = {
          subtype: csNode[1],
          axis: this.extractAxes(node),
        };
      }

      // Handle `USAGE` node for WKT2-2019
      const usageNode = node.find((child) => Array.isArray(child) && child[0] === "USAGE");
      if (usageNode) {
        result.usage = {
          scope: usageNode.find((child) => Array.isArray(child) && child[0] === "SCOPE")?.[1],
          area: usageNode.find((child) => Array.isArray(child) && child[0] === "AREA")?.[1],
          bbox: usageNode.find((child) => Array.isArray(child) && child[0] === "BBOX")?.slice(1),
        };
      }

      return result;
    }
  }

  /**
   * Detects the WKT2 version based on the structure of the WKT.
   * @param {Array} root The root WKT array node.
   * @returns {string} The detected version ("2015" or "2019").
   */
  function detectWKT2Version(root) {
    // Check for WKT2-2019-specific nodes
    if (root.find((child) => Array.isArray(child) && child[0] === "USAGE")) {
      return "2019"; // `USAGE` is specific to WKT2-2019
    }

    // Check for WKT2-2015-specific nodes
    if (root.find((child) => Array.isArray(child) && child[0] === "CS")) {
      return "2015"; // `CS` is valid in both, but default to 2015 unless `USAGE` is present
    }

    if (root[0] === "BOUNDCRS" || root[0] === "PROJCRS" || root[0] === "GEOGCRS") {
      return "2015"; // These are valid in both, but default to 2015
    }

    // Default to WKT2-2015 if no specific indicators are found
    return "2015";
  }

  /**
   * Builds a PROJJSON object from a WKT array structure.
   * @param {Array} root The root WKT array node.
   * @returns {Object} The PROJJSON object.
   */
  function buildPROJJSON(root) {
    const version = detectWKT2Version(root);
    const builder = version === "2019" ? PROJJSONBuilder2019 : PROJJSONBuilder2015;
    return builder.convert(root);
  }

  /**
   * Detects whether the WKT string is WKT1 or WKT2.
   * @param {string} wkt The WKT string.
   * @returns {string} The detected version ("WKT1" or "WKT2").
   */
  function detectWKTVersion(wkt) {
    // Normalize the WKT string for easier keyword matching
    const normalizedWKT = wkt.toUpperCase();

    // Check for WKT2-specific keywords
    if (
      normalizedWKT.includes("PROJCRS") ||
      normalizedWKT.includes("GEOGCRS") ||
      normalizedWKT.includes("BOUNDCRS") ||
      normalizedWKT.includes("VERTCRS") ||
      normalizedWKT.includes("LENGTHUNIT") ||
      normalizedWKT.includes("ANGLEUNIT") ||
      normalizedWKT.includes("SCALEUNIT")
    ) {
      return "WKT2";
    }

    // Check for WKT1-specific keywords
    if (
      normalizedWKT.includes("PROJCS") ||
      normalizedWKT.includes("GEOGCS") ||
      normalizedWKT.includes("LOCAL_CS") ||
      normalizedWKT.includes("VERT_CS") ||
      normalizedWKT.includes("UNIT")
    ) {
      return "WKT1";
    }

    // Default to WKT1 if no specific indicators are found
    return "WKT1";
  }

  var NEUTRAL = 1;
  var KEYWORD = 2;
  var NUMBER = 3;
  var QUOTED = 4;
  var AFTERQUOTE = 5;
  var ENDED = -1;
  var whitespace = /\s/;
  var latin = /[A-Za-z]/;
  var keyword = /[A-Za-z84_]/;
  var endThings = /[,\]]/;
  var digets = /[\d\.E\-\+]/;
  // const ignoredChar = /[\s_\-\/\(\)]/g;
  function Parser(text) {
    if (typeof text !== 'string') {
      throw new Error('not a string');
    }
    this.text = text.trim();
    this.level = 0;
    this.place = 0;
    this.root = null;
    this.stack = [];
    this.currentObject = null;
    this.state = NEUTRAL;
  }
  Parser.prototype.readCharicter = function() {
    var char = this.text[this.place++];
    if (this.state !== QUOTED) {
      while (whitespace.test(char)) {
        if (this.place >= this.text.length) {
          return;
        }
        char = this.text[this.place++];
      }
    }
    switch (this.state) {
      case NEUTRAL:
        return this.neutral(char);
      case KEYWORD:
        return this.keyword(char)
      case QUOTED:
        return this.quoted(char);
      case AFTERQUOTE:
        return this.afterquote(char);
      case NUMBER:
        return this.number(char);
      case ENDED:
        return;
    }
  };
  Parser.prototype.afterquote = function(char) {
    if (char === '"') {
      this.word += '"';
      this.state = QUOTED;
      return;
    }
    if (endThings.test(char)) {
      this.word = this.word.trim();
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in afterquote yet, index ' + this.place);
  };
  Parser.prototype.afterItem = function(char) {
    if (char === ',') {
      if (this.word !== null) {
        this.currentObject.push(this.word);
      }
      this.word = null;
      this.state = NEUTRAL;
      return;
    }
    if (char === ']') {
      this.level--;
      if (this.word !== null) {
        this.currentObject.push(this.word);
        this.word = null;
      }
      this.state = NEUTRAL;
      this.currentObject = this.stack.pop();
      if (!this.currentObject) {
        this.state = ENDED;
      }

      return;
    }
  };
  Parser.prototype.number = function(char) {
    if (digets.test(char)) {
      this.word += char;
      return;
    }
    if (endThings.test(char)) {
      this.word = parseFloat(this.word);
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in number yet, index ' + this.place);
  };
  Parser.prototype.quoted = function(char) {
    if (char === '"') {
      this.state = AFTERQUOTE;
      return;
    }
    this.word += char;
    return;
  };
  Parser.prototype.keyword = function(char) {
    if (keyword.test(char)) {
      this.word += char;
      return;
    }
    if (char === '[') {
      var newObjects = [];
      newObjects.push(this.word);
      this.level++;
      if (this.root === null) {
        this.root = newObjects;
      } else {
        this.currentObject.push(newObjects);
      }
      this.stack.push(this.currentObject);
      this.currentObject = newObjects;
      this.state = NEUTRAL;
      return;
    }
    if (endThings.test(char)) {
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in keyword yet, index ' + this.place);
  };
  Parser.prototype.neutral = function(char) {
    if (latin.test(char)) {
      this.word = char;
      this.state = KEYWORD;
      return;
    }
    if (char === '"') {
      this.word = '';
      this.state = QUOTED;
      return;
    }
    if (digets.test(char)) {
      this.word = char;
      this.state = NUMBER;
      return;
    }
    if (endThings.test(char)) {
      this.afterItem(char);
      return;
    }
    throw new Error('havn\'t handled "' +char + '" in neutral yet, index ' + this.place);
  };
  Parser.prototype.output = function() {
    while (this.place < this.text.length) {
      this.readCharicter();
    }
    if (this.state === ENDED) {
      return this.root;
    }
    throw new Error('unable to parse string "' +this.text + '". State is ' + this.state);
  };

  function parseString(txt) {
    var parser = new Parser(txt);
    return parser.output();
  }

  function mapit(obj, key, value) {
    if (Array.isArray(key)) {
      value.unshift(key);
      key = null;
    }
    var thing = key ? {} : obj;

    var out = value.reduce(function(newObj, item) {
      sExpr(item, newObj);
      return newObj
    }, thing);
    if (key) {
      obj[key] = out;
    }
  }

  function sExpr(v, obj) {
    if (!Array.isArray(v)) {
      obj[v] = true;
      return;
    }
    var key = v.shift();
    if (key === 'PARAMETER') {
      key = v.shift();
    }
    if (v.length === 1) {
      if (Array.isArray(v[0])) {
        obj[key] = {};
        sExpr(v[0], obj[key]);
        return;
      }
      obj[key] = v[0];
      return;
    }
    if (!v.length) {
      obj[key] = true;
      return;
    }
    if (key === 'TOWGS84') {
      obj[key] = v;
      return;
    }
    if (key === 'AXIS') {
      if (!(key in obj)) {
        obj[key] = [];
      }
      obj[key].push(v);
      return;
    }
    if (!Array.isArray(key)) {
      obj[key] = {};
    }

    var i;
    switch (key) {
      case 'UNIT':
      case 'PRIMEM':
      case 'VERT_DATUM':
        obj[key] = {
          name: v[0].toLowerCase(),
          convert: v[1]
        };
        if (v.length === 3) {
          sExpr(v[2], obj[key]);
        }
        return;
      case 'SPHEROID':
      case 'ELLIPSOID':
        obj[key] = {
          name: v[0],
          a: v[1],
          rf: v[2]
        };
        if (v.length === 4) {
          sExpr(v[3], obj[key]);
        }
        return;
      case 'EDATUM':
      case 'ENGINEERINGDATUM':
      case 'LOCAL_DATUM':
      case 'DATUM':
      case 'VERT_CS':
      case 'VERTCRS':
      case 'VERTICALCRS':
        v[0] = ['name', v[0]];
        mapit(obj, key, v);
        return;
      case 'COMPD_CS':
      case 'COMPOUNDCRS':
      case 'FITTED_CS':
      // the followings are the crs defined in
      // https://github.com/proj4js/proj4js/blob/1da4ed0b865d0fcb51c136090569210cdcc9019e/lib/parseCode.js#L11
      case 'PROJECTEDCRS':
      case 'PROJCRS':
      case 'GEOGCS':
      case 'GEOCCS':
      case 'PROJCS':
      case 'LOCAL_CS':
      case 'GEODCRS':
      case 'GEODETICCRS':
      case 'GEODETICDATUM':
      case 'ENGCRS':
      case 'ENGINEERINGCRS':
        v[0] = ['name', v[0]];
        mapit(obj, key, v);
        obj[key].type = key;
        return;
      default:
        i = -1;
        while (++i < v.length) {
          if (!Array.isArray(v[i])) {
            return sExpr(v, obj[key]);
          }
        }
        return mapit(obj, key, v);
    }
  }

  var D2R = 0.01745329251994329577;

  function d2r(input) {
    return input * D2R;
  }

  function applyProjectionDefaults(wkt) {
    // Normalize projName for WKT2 compatibility
    const normalizedProjName = (wkt.projName || '').toLowerCase().replace(/_/g, ' ');

    if (!wkt.long0 && wkt.longc && (normalizedProjName === 'albers conic equal area' || normalizedProjName === 'lambert azimuthal equal area')) {
      wkt.long0 = wkt.longc;
    }
    if (!wkt.lat_ts && wkt.lat1 && (normalizedProjName === 'stereographic south pole' || normalizedProjName === 'polar stereographic (variant b)')) {
      wkt.lat0 = d2r(wkt.lat1 > 0 ? 90 : -90);
      wkt.lat_ts = wkt.lat1;
      delete wkt.lat1;
    } else if (!wkt.lat_ts && wkt.lat0 && (normalizedProjName === 'polar stereographic' || normalizedProjName === 'polar stereographic (variant a)')) {
      wkt.lat_ts = wkt.lat0;
      wkt.lat0 = d2r(wkt.lat0 > 0 ? 90 : -90);
      delete wkt.lat1;
    }
  }

  // Helper function to process units and to_meter
  function processUnit(unit) {
    let result = { units: null, to_meter: undefined };

    if (typeof unit === 'string') {
      result.units = unit.toLowerCase();
      if (result.units === 'metre') {
        result.units = 'meter'; // Normalize 'metre' to 'meter'
      }
      if (result.units === 'meter') {
        result.to_meter = 1; // Only set to_meter if units are 'meter'
      }
    } else if (unit?.name) {
      result.units = unit.name.toLowerCase();
      if (result.units === 'metre') {
        result.units = 'meter'; // Normalize 'metre' to 'meter'
      }
      result.to_meter = unit.conversion_factor;
    }

    return result;
  }

  function toValue(valueOrObject) {
    if (typeof valueOrObject === 'object') {
      return valueOrObject.value * valueOrObject.unit.conversion_factor;
    }
    return valueOrObject;
  }

  function calculateEllipsoid(value, result) {
    if (value.ellipsoid.radius) {
      result.a = value.ellipsoid.radius;
      result.rf = 0;
    } else {
      result.a = toValue(value.ellipsoid.semi_major_axis);
      if (value.ellipsoid.inverse_flattening !== undefined) {
        result.rf = value.ellipsoid.inverse_flattening;
      } else if (value.ellipsoid.semi_major_axis !== undefined && value.ellipsoid.semi_minor_axis !== undefined) {
        result.rf = result.a / (result.a - toValue(value.ellipsoid.semi_minor_axis));
      }
    }
  }

  function transformPROJJSON(projjson, result = {}) {
    if (!projjson || typeof projjson !== 'object') {
      return projjson; // Return primitive values as-is
    }

    if (projjson.type === 'BoundCRS') {
      transformPROJJSON(projjson.source_crs, result);

      if (projjson.transformation) {
        if (projjson.transformation.method?.name === 'NTv2') {
          // Set nadgrids to the filename from the parameterfile
          result.nadgrids = projjson.transformation.parameters[0].value;
        } else {
          // Populate datum_params if no parameterfile is found
          result.datum_params = projjson.transformation.parameters.map((param) => param.value);
        }
      }
      return result; // Return early for BoundCRS
    }

    // Handle specific keys in PROJJSON
    Object.keys(projjson).forEach((key) => {
      const value = projjson[key];
      if (value === null) {
        return;
      }

      switch (key) {
        case 'name':
          if (result.srsCode) {
            break;
          }
          result.name = value;
          result.srsCode = value; // Map `name` to `srsCode`
          break;

        case 'type':
          if (value === 'GeographicCRS') {
            result.projName = 'longlat';
          } else if (value === 'ProjectedCRS') {
            result.projName = projjson.conversion?.method?.name; // Retain original capitalization
          }
          break;

        case 'datum':
        case 'datum_ensemble': // Handle both datum and ensemble
          if (value.ellipsoid) {
            // Extract ellipsoid properties
            result.ellps = value.ellipsoid.name;
            calculateEllipsoid(value, result);
          }
          if (value.prime_meridian) {
            result.from_greenwich = value.prime_meridian.longitude * Math.PI / 180; // Convert to radians
          }
          break;

        case 'ellipsoid':
          result.ellps = value.name;
          calculateEllipsoid(value, result);
          break;

        case 'prime_meridian':
          result.long0 = (value.longitude || 0) * Math.PI / 180; // Convert to radians
          break;

        case 'coordinate_system':
          if (value.axis) {
            result.axis = value.axis
              .map((axis) => {
                const direction = axis.direction;
                if (direction === 'east') return 'e';
                if (direction === 'north') return 'n';
                if (direction === 'west') return 'w';
                if (direction === 'south') return 's';
                throw new Error(`Unknown axis direction: ${direction}`);
              })
              .join('') + 'u'; // Combine into a single string (e.g., "enu")

            if (value.unit) {
              const { units, to_meter } = processUnit(value.unit);
              result.units = units;
              result.to_meter = to_meter;
            } else if (value.axis[0]?.unit) {
              const { units, to_meter } = processUnit(value.axis[0].unit);
              result.units = units;
              result.to_meter = to_meter;
            }
          }
          break;
          
        case 'id':
          if (value.authority && value.code) {
            result.title = value.authority + ':' + value.code;
          }
          break;

        case 'conversion':
          if (value.method && value.method.name) {
            result.projName = value.method.name; // Retain original capitalization
          }
          if (value.parameters) {
            value.parameters.forEach((param) => {
              const paramName = param.name.toLowerCase().replace(/\s+/g, '_');
              const paramValue = param.value;
              if (param.unit && param.unit.conversion_factor) {
                result[paramName] = paramValue * param.unit.conversion_factor; // Convert to radians or meters
              } else if (param.unit === 'degree') {
                result[paramName] = paramValue * Math.PI / 180; // Convert to radians
              } else {
                result[paramName] = paramValue;
              }
            });
          }
          break;

        case 'unit':
          if (value.name) {
            result.units = value.name.toLowerCase();
            if (result.units === 'metre') {
              result.units = 'meter';
            }
          }
          if (value.conversion_factor) {
            result.to_meter = value.conversion_factor;
          }
          break;

        case 'base_crs':
          transformPROJJSON(value, result); // Pass `result` directly
          result.datumCode = value.id ? value.id.authority + '_' + value.id.code : value.name; // Set datumCode
          break;
      }
    });

    // Additional calculated properties
    if (result.latitude_of_false_origin !== undefined) {
      result.lat0 = result.latitude_of_false_origin; // Already in radians
    }
    if (result.longitude_of_false_origin !== undefined) {
      result.long0 = result.longitude_of_false_origin;
    }
    if (result.latitude_of_standard_parallel !== undefined) {
      result.lat0 = result.latitude_of_standard_parallel;
      result.lat1 = result.latitude_of_standard_parallel;
    }
    if (result.latitude_of_1st_standard_parallel !== undefined) {
      result.lat1 = result.latitude_of_1st_standard_parallel;
    }
    if (result.latitude_of_2nd_standard_parallel !== undefined) {
      result.lat2 = result.latitude_of_2nd_standard_parallel; 
    }
    if (result.latitude_of_projection_centre !== undefined) {
      result.lat0 = result.latitude_of_projection_centre;
    }
    if (result.longitude_of_projection_centre !== undefined) {
      result.longc = result.longitude_of_projection_centre;
    }
    if (result.easting_at_false_origin !== undefined) {
      result.x0 = result.easting_at_false_origin;
    }
    if (result.northing_at_false_origin !== undefined) {
      result.y0 = result.northing_at_false_origin;
    }
    if (result.latitude_of_natural_origin !== undefined) {
      result.lat0 = result.latitude_of_natural_origin;
    }
    if (result.longitude_of_natural_origin !== undefined) {
      result.long0 = result.longitude_of_natural_origin;
    }
    if (result.longitude_of_origin !== undefined) {
      result.long0 = result.longitude_of_origin;
    }
    if (result.false_easting !== undefined) {
      result.x0 = result.false_easting;
    }
    if (result.easting_at_projection_centre) {
      result.x0 = result.easting_at_projection_centre;
    }
    if (result.false_northing !== undefined) {
      result.y0 = result.false_northing;
    }
    if (result.northing_at_projection_centre) {
      result.y0 = result.northing_at_projection_centre;
    }
    if (result.standard_parallel_1 !== undefined) {
      result.lat1 = result.standard_parallel_1;
    }
    if (result.standard_parallel_2 !== undefined) {
      result.lat2 = result.standard_parallel_2;
    }
    if (result.scale_factor_at_natural_origin !== undefined) {
      result.k0 = result.scale_factor_at_natural_origin;
    }
    if (result.scale_factor_at_projection_centre !== undefined) {
      result.k0 = result.scale_factor_at_projection_centre;
    }
    if (result.scale_factor_on_pseudo_standard_parallel !== undefined) {  
      result.k0 = result.scale_factor_on_pseudo_standard_parallel;
    }
    if (result.azimuth !== undefined) {
      result.alpha = result.azimuth;
    }
    if (result.azimuth_at_projection_centre !== undefined) {
      result.alpha = result.azimuth_at_projection_centre;
    }
    if (result.angle_from_rectified_to_skew_grid) {
      result.rectified_grid_angle = result.angle_from_rectified_to_skew_grid;
    }

    // Apply projection defaults
    applyProjectionDefaults(result);

    return result;
  }

  var knownTypes = ['PROJECTEDCRS', 'PROJCRS', 'GEOGCS', 'GEOCCS', 'PROJCS', 'LOCAL_CS', 'GEODCRS',
    'GEODETICCRS', 'GEODETICDATUM', 'ENGCRS', 'ENGINEERINGCRS'];

  function rename(obj, params) {
    var outName = params[0];
    var inName = params[1];
    if (!(outName in obj) && (inName in obj)) {
      obj[outName] = obj[inName];
      if (params.length === 3) {
        obj[outName] = params[2](obj[outName]);
      }
    }
  }

  function cleanWKT(wkt) {
    var keys = Object.keys(wkt);
    for (var i = 0, ii = keys.length; i <ii; ++i) {
      var key = keys[i];
      // the followings are the crs defined in
      // https://github.com/proj4js/proj4js/blob/1da4ed0b865d0fcb51c136090569210cdcc9019e/lib/parseCode.js#L11
      if (knownTypes.indexOf(key) !== -1) {
        setPropertiesFromWkt(wkt[key]);
      }
      if (typeof wkt[key] === 'object') {
        cleanWKT(wkt[key]);
      }
    }
  }

  function setPropertiesFromWkt(wkt) {
    if (wkt.AUTHORITY) {
      var authority = Object.keys(wkt.AUTHORITY)[0];
      if (authority && authority in wkt.AUTHORITY) {
        wkt.title = authority + ':' + wkt.AUTHORITY[authority];
      }
    }
    if (wkt.type === 'GEOGCS') {
      wkt.projName = 'longlat';
    } else if (wkt.type === 'LOCAL_CS') {
      wkt.projName = 'identity';
      wkt.local = true;
    } else {
      if (typeof wkt.PROJECTION === 'object') {
        wkt.projName = Object.keys(wkt.PROJECTION)[0];
      } else {
        wkt.projName = wkt.PROJECTION;
      }
    }
    if (wkt.AXIS) {
      var axisOrder = '';
      for (var i = 0, ii = wkt.AXIS.length; i < ii; ++i) {
        var axis = [wkt.AXIS[i][0].toLowerCase(), wkt.AXIS[i][1].toLowerCase()];
        if (axis[0].indexOf('north') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'north')) {
          axisOrder += 'n';
        } else if (axis[0].indexOf('south') !== -1 || ((axis[0] === 'y' || axis[0] === 'lat') && axis[1] === 'south')) {
          axisOrder += 's';
        } else if (axis[0].indexOf('east') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'east')) {
          axisOrder += 'e';
        } else if (axis[0].indexOf('west') !== -1 || ((axis[0] === 'x' || axis[0] === 'lon') && axis[1] === 'west')) {
          axisOrder += 'w';
        }
      }
      if (axisOrder.length === 2) {
        axisOrder += 'u';
      }
      if (axisOrder.length === 3) {
        wkt.axis = axisOrder;
      }
    }
    if (wkt.UNIT) {
      wkt.units = wkt.UNIT.name.toLowerCase();
      if (wkt.units === 'metre') {
        wkt.units = 'meter';
      }
      if (wkt.UNIT.convert) {
        if (wkt.type === 'GEOGCS') {
          if (wkt.DATUM && wkt.DATUM.SPHEROID) {
            wkt.to_meter = wkt.UNIT.convert*wkt.DATUM.SPHEROID.a;
          }
        } else {
          wkt.to_meter = wkt.UNIT.convert;
        }
      }
    }
    var geogcs = wkt.GEOGCS;
    if (wkt.type === 'GEOGCS') {
      geogcs = wkt;
    }
    if (geogcs) {
      //if(wkt.GEOGCS.PRIMEM&&wkt.GEOGCS.PRIMEM.convert){
      //  wkt.from_greenwich=wkt.GEOGCS.PRIMEM.convert*D2R;
      //}
      if (geogcs.DATUM) {
        wkt.datumCode = geogcs.DATUM.name.toLowerCase();
      } else {
        wkt.datumCode = geogcs.name.toLowerCase();
      }
      if (wkt.datumCode.slice(0, 2) === 'd_') {
        wkt.datumCode = wkt.datumCode.slice(2);
      }
      if (wkt.datumCode === 'new_zealand_1949') {
        wkt.datumCode = 'nzgd49';
      }
      if (wkt.datumCode === 'wgs_1984' || wkt.datumCode === 'world_geodetic_system_1984') {
        if (wkt.PROJECTION === 'Mercator_Auxiliary_Sphere') {
          wkt.sphere = true;
        }
        wkt.datumCode = 'wgs84';
      }
      if (wkt.datumCode === 'belge_1972') {
        wkt.datumCode = 'rnb72';
      }
      if (geogcs.DATUM && geogcs.DATUM.SPHEROID) {
        wkt.ellps = geogcs.DATUM.SPHEROID.name.replace('_19', '').replace(/[Cc]larke\_18/, 'clrk');
        if (wkt.ellps.toLowerCase().slice(0, 13) === 'international') {
          wkt.ellps = 'intl';
        }

        wkt.a = geogcs.DATUM.SPHEROID.a;
        wkt.rf = parseFloat(geogcs.DATUM.SPHEROID.rf, 10);
      }

      if (geogcs.DATUM && geogcs.DATUM.TOWGS84) {
        wkt.datum_params = geogcs.DATUM.TOWGS84;
      }
      if (~wkt.datumCode.indexOf('osgb_1936')) {
        wkt.datumCode = 'osgb36';
      }
      if (~wkt.datumCode.indexOf('osni_1952')) {
        wkt.datumCode = 'osni52';
      }
      if (~wkt.datumCode.indexOf('tm65')
        || ~wkt.datumCode.indexOf('geodetic_datum_of_1965')) {
        wkt.datumCode = 'ire65';
      }
      if (wkt.datumCode === 'ch1903+') {
        wkt.datumCode = 'ch1903';
      }
      if (~wkt.datumCode.indexOf('israel')) {
        wkt.datumCode = 'isr93';
      }
    }
    if (wkt.b && !isFinite(wkt.b)) {
      wkt.b = wkt.a;
    }
    if (wkt.rectified_grid_angle) {
      wkt.rectified_grid_angle = d2r(wkt.rectified_grid_angle);
    }

    function toMeter(input) {
      var ratio = wkt.to_meter || 1;
      return input * ratio;
    }
    var renamer = function(a) {
      return rename(wkt, a);
    };
    var list = [
      ['standard_parallel_1', 'Standard_Parallel_1'],
      ['standard_parallel_1', 'Latitude of 1st standard parallel'],
      ['standard_parallel_2', 'Standard_Parallel_2'],
      ['standard_parallel_2', 'Latitude of 2nd standard parallel'],
      ['false_easting', 'False_Easting'],
      ['false_easting', 'False easting'],
      ['false-easting', 'Easting at false origin'],
      ['false_northing', 'False_Northing'],
      ['false_northing', 'False northing'],
      ['false_northing', 'Northing at false origin'],
      ['central_meridian', 'Central_Meridian'],
      ['central_meridian', 'Longitude of natural origin'],
      ['central_meridian', 'Longitude of false origin'],
      ['latitude_of_origin', 'Latitude_Of_Origin'],
      ['latitude_of_origin', 'Central_Parallel'],
      ['latitude_of_origin', 'Latitude of natural origin'],
      ['latitude_of_origin', 'Latitude of false origin'],
      ['scale_factor', 'Scale_Factor'],
      ['k0', 'scale_factor'],
      ['latitude_of_center', 'Latitude_Of_Center'],
      ['latitude_of_center', 'Latitude_of_center'],
      ['lat0', 'latitude_of_center', d2r],
      ['longitude_of_center', 'Longitude_Of_Center'],
      ['longitude_of_center', 'Longitude_of_center'],
      ['longc', 'longitude_of_center', d2r],
      ['x0', 'false_easting', toMeter],
      ['y0', 'false_northing', toMeter],
      ['long0', 'central_meridian', d2r],
      ['lat0', 'latitude_of_origin', d2r],
      ['lat0', 'standard_parallel_1', d2r],
      ['lat1', 'standard_parallel_1', d2r],
      ['lat2', 'standard_parallel_2', d2r],
      ['azimuth', 'Azimuth'],
      ['alpha', 'azimuth', d2r],
      ['srsCode', 'name']
    ];
    list.forEach(renamer);
    applyProjectionDefaults(wkt);
  }
  function wkt(wkt) {
    if (typeof wkt === 'object') {
      return transformPROJJSON(wkt);
    }
    const version = detectWKTVersion(wkt);
    var lisp = parseString(wkt);
    if (version === 'WKT2') {
      const projjson = buildPROJJSON(lisp);
      return transformPROJJSON(projjson);
    }
    var type = lisp[0];
    var obj = {};
    sExpr(lisp, obj);
    cleanWKT(obj);
    return obj[type];
  }

  function defs(name) {
    /* global console */
    var that = this;
    if (arguments.length === 2) {
      var def = arguments[1];
      if (typeof def === 'string') {
        if (def.charAt(0) === '+') {
          defs[name] = projStr(arguments[1]);
        } else {
          defs[name] = wkt(arguments[1]);
        }
      } else {
        defs[name] = def;
      }
    } else if (arguments.length === 1) {
      if (Array.isArray(name)) {
        return name.map(function (v) {
          if (Array.isArray(v)) {
            defs.apply(that, v);
          } else {
            defs(v);
          }
        });
      } else if (typeof name === 'string') {
        if (name in defs) {
          return defs[name];
        }
      } else if ('EPSG' in name) {
        defs['EPSG:' + name.EPSG] = name;
      } else if ('ESRI' in name) {
        defs['ESRI:' + name.ESRI] = name;
      } else if ('IAU2000' in name) {
        defs['IAU2000:' + name.IAU2000] = name;
      } else {
        console.log(name);
      }
      return;
    }
  }
  globals(defs);

  function testObj(code) {
    return typeof code === 'string';
  }
  function testDef(code) {
    return code in defs;
  }
  function testWKT(code) {
    return (code.indexOf('+') !== 0 && code.indexOf('[') !== -1) || (typeof code === 'object' && !('srsCode' in code));
  }
  var codes = ['3857', '900913', '3785', '102113'];
  function checkMercator(item) {
    var auth = match(item, 'authority');
    if (!auth) {
      return;
    }
    var code = match(auth, 'epsg');
    return code && codes.indexOf(code) > -1;
  }
  function checkProjStr(item) {
    var ext = match(item, 'extension');
    if (!ext) {
      return;
    }
    return match(ext, 'proj4');
  }
  function testProj(code) {
    return code[0] === '+';
  }
  function parse(code) {
    if (testObj(code)) {
      // check to see if this is a WKT string
      if (testDef(code)) {
        return defs[code];
      }
      if (testWKT(code)) {
        var out = wkt(code);
        // test of spetial case, due to this being a very common and often malformed
        if (checkMercator(out)) {
          return defs['EPSG:3857'];
        }
        var maybeProjStr = checkProjStr(out);
        if (maybeProjStr) {
          return projStr(maybeProjStr);
        }
        return out;
      }
      if (testProj(code)) {
        return projStr(code);
      }
    } else if (!code.projName) {
      return wkt(code);
    } else {
      return code;
    }
  }

  function extend (destination, source) {
    destination = destination || {};
    var value, property;
    if (!source) {
      return destination;
    }
    for (property in source) {
      value = source[property];
      if (value !== undefined) {
        destination[property] = value;
      }
    }
    return destination;
  }

  function msfnz (eccent, sinphi, cosphi) {
    var con = eccent * sinphi;
    return cosphi / (Math.sqrt(1 - con * con));
  }

  function sign (x) {
    return x < 0 ? -1 : 1;
  }

  function adjust_lon (x) {
    return (Math.abs(x) <= SPI) ? x : (x - (sign(x) * TWO_PI));
  }

  function tsfnz (eccent, phi, sinphi) {
    var con = eccent * sinphi;
    var com = 0.5 * eccent;
    con = Math.pow(((1 - con) / (1 + con)), com);
    return (Math.tan(0.5 * (HALF_PI - phi)) / con);
  }

  function phi2z (eccent, ts) {
    var eccnth = 0.5 * eccent;
    var con, dphi;
    var phi = HALF_PI - 2 * Math.atan(ts);
    for (var i = 0; i <= 15; i++) {
      con = eccent * Math.sin(phi);
      dphi = HALF_PI - 2 * Math.atan(ts * (Math.pow(((1 - con) / (1 + con)), eccnth))) - phi;
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }
    // console.log("phi2z has NoConvergence");
    return -9999;
  }

  function init$x() {
    var con = this.b / this.a;
    this.es = 1 - con * con;
    if (!('x0' in this)) {
      this.x0 = 0;
    }
    if (!('y0' in this)) {
      this.y0 = 0;
    }
    this.e = Math.sqrt(this.es);
    if (this.lat_ts) {
      if (this.sphere) {
        this.k0 = Math.cos(this.lat_ts);
      } else {
        this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
      }
    } else {
      if (!this.k0) {
        if (this.k) {
          this.k0 = this.k;
        } else {
          this.k0 = 1;
        }
      }
    }
  }

  /* Mercator forward equations--mapping lat,long to x,y
    -------------------------------------------------- */

  function forward$v(p) {
    var lon = p.x;
    var lat = p.y;
    // convert to radians
    if (lat * R2D > 90 && lat * R2D < -90 && lon * R2D > 180 && lon * R2D < -180) {
      return null;
    }

    var x, y;
    if (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN) {
      return null;
    } else {
      if (this.sphere) {
        x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
        y = this.y0 + this.a * this.k0 * Math.log(Math.tan(FORTPI + 0.5 * lat));
      } else {
        var sinphi = Math.sin(lat);
        var ts = tsfnz(this.e, lat, sinphi);
        x = this.x0 + this.a * this.k0 * adjust_lon(lon - this.long0);
        y = this.y0 - this.a * this.k0 * Math.log(ts);
      }
      p.x = x;
      p.y = y;
      return p;
    }
  }

  /* Mercator inverse equations--mapping x,y to lat/long
    -------------------------------------------------- */
  function inverse$v(p) {
    var x = p.x - this.x0;
    var y = p.y - this.y0;
    var lon, lat;

    if (this.sphere) {
      lat = HALF_PI - 2 * Math.atan(Math.exp(-y / (this.a * this.k0)));
    } else {
      var ts = Math.exp(-y / (this.a * this.k0));
      lat = phi2z(this.e, ts);
      if (lat === -9999) {
        return null;
      }
    }
    lon = adjust_lon(this.long0 + x / (this.a * this.k0));

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$x = ['Mercator', 'Popular Visualisation Pseudo Mercator', 'Mercator_1SP', 'Mercator_Auxiliary_Sphere', 'Mercator_Variant_A', 'merc'];
  var merc = {
    init: init$x,
    forward: forward$v,
    inverse: inverse$v,
    names: names$x
  };

  function init$w() {
    // no-op for longlat
  }

  function identity(pt) {
    return pt;
  }
  var names$w = ['longlat', 'identity'];
  var longlat = {
    init: init$w,
    forward: identity,
    inverse: identity,
    names: names$w
  };

  var projs = [merc, longlat];
  var names$v = {};
  var projStore = [];

  function add(proj, i) {
    var len = projStore.length;
    if (!proj.names) {
      console.log(i);
      return true;
    }
    projStore[len] = proj;
    proj.names.forEach(function (n) {
      names$v[n.toLowerCase()] = len;
    });
    return this;
  }

  function getNormalizedProjName(n) {
    return n.replace(/[-\(\)\s]+/g, ' ').trim().replace(/ /g, '_');
  }

  function get(name) {
    if (!name) {
      return false;
    }
    var n = name.toLowerCase();
    if (typeof names$v[n] !== 'undefined' && projStore[names$v[n]]) {
      return projStore[names$v[n]];
    }
    n = getNormalizedProjName(n);
    if (n in names$v && projStore[names$v[n]]) {
      return projStore[names$v[n]];
    }
  }

  function start() {
    projs.forEach(add);
  }
  var projections = {
    start: start,
    add: add,
    get: get
  };

  var ellipsoids = {
    MERIT: {
      a: 6378137,
      rf: 298.257,
      ellipseName: 'MERIT 1983'
    },
    SGS85: {
      a: 6378136,
      rf: 298.257,
      ellipseName: 'Soviet Geodetic System 85'
    },
    GRS80: {
      a: 6378137,
      rf: 298.257222101,
      ellipseName: 'GRS 1980(IUGG, 1980)'
    },
    IAU76: {
      a: 6378140,
      rf: 298.257,
      ellipseName: 'IAU 1976'
    },
    airy: {
      a: 6377563.396,
      b: 6356256.91,
      ellipseName: 'Airy 1830'
    },
    APL4: {
      a: 6378137,
      rf: 298.25,
      ellipseName: 'Appl. Physics. 1965'
    },
    NWL9D: {
      a: 6378145,
      rf: 298.25,
      ellipseName: 'Naval Weapons Lab., 1965'
    },
    mod_airy: {
      a: 6377340.189,
      b: 6356034.446,
      ellipseName: 'Modified Airy'
    },
    andrae: {
      a: 6377104.43,
      rf: 300,
      ellipseName: 'Andrae 1876 (Den., Iclnd.)'
    },
    aust_SA: {
      a: 6378160,
      rf: 298.25,
      ellipseName: 'Australian Natl & S. Amer. 1969'
    },
    GRS67: {
      a: 6378160,
      rf: 298.247167427,
      ellipseName: 'GRS 67(IUGG 1967)'
    },
    bessel: {
      a: 6377397.155,
      rf: 299.1528128,
      ellipseName: 'Bessel 1841'
    },
    bess_nam: {
      a: 6377483.865,
      rf: 299.1528128,
      ellipseName: 'Bessel 1841 (Namibia)'
    },
    clrk66: {
      a: 6378206.4,
      b: 6356583.8,
      ellipseName: 'Clarke 1866'
    },
    clrk80: {
      a: 6378249.145,
      rf: 293.4663,
      ellipseName: 'Clarke 1880 mod.'
    },
    clrk80ign: {
      a: 6378249.2,
      b: 6356515,
      rf: 293.4660213,
      ellipseName: 'Clarke 1880 (IGN)'
    },
    clrk58: {
      a: 6378293.645208759,
      rf: 294.2606763692654,
      ellipseName: 'Clarke 1858'
    },
    CPM: {
      a: 6375738.7,
      rf: 334.29,
      ellipseName: 'Comm. des Poids et Mesures 1799'
    },
    delmbr: {
      a: 6376428,
      rf: 311.5,
      ellipseName: 'Delambre 1810 (Belgium)'
    },
    engelis: {
      a: 6378136.05,
      rf: 298.2566,
      ellipseName: 'Engelis 1985'
    },
    evrst30: {
      a: 6377276.345,
      rf: 300.8017,
      ellipseName: 'Everest 1830'
    },
    evrst48: {
      a: 6377304.063,
      rf: 300.8017,
      ellipseName: 'Everest 1948'
    },
    evrst56: {
      a: 6377301.243,
      rf: 300.8017,
      ellipseName: 'Everest 1956'
    },
    evrst69: {
      a: 6377295.664,
      rf: 300.8017,
      ellipseName: 'Everest 1969'
    },
    evrstSS: {
      a: 6377298.556,
      rf: 300.8017,
      ellipseName: 'Everest (Sabah & Sarawak)'
    },
    fschr60: {
      a: 6378166,
      rf: 298.3,
      ellipseName: 'Fischer (Mercury Datum) 1960'
    },
    fschr60m: {
      a: 6378155,
      rf: 298.3,
      ellipseName: 'Fischer 1960'
    },
    fschr68: {
      a: 6378150,
      rf: 298.3,
      ellipseName: 'Fischer 1968'
    },
    helmert: {
      a: 6378200,
      rf: 298.3,
      ellipseName: 'Helmert 1906'
    },
    hough: {
      a: 6378270,
      rf: 297,
      ellipseName: 'Hough'
    },
    intl: {
      a: 6378388,
      rf: 297,
      ellipseName: 'International 1909 (Hayford)'
    },
    kaula: {
      a: 6378163,
      rf: 298.24,
      ellipseName: 'Kaula 1961'
    },
    lerch: {
      a: 6378139,
      rf: 298.257,
      ellipseName: 'Lerch 1979'
    },
    mprts: {
      a: 6397300,
      rf: 191,
      ellipseName: 'Maupertius 1738'
    },
    new_intl: {
      a: 6378157.5,
      b: 6356772.2,
      ellipseName: 'New International 1967'
    },
    plessis: {
      a: 6376523,
      rf: 6355863,
      ellipseName: 'Plessis 1817 (France)'
    },
    krass: {
      a: 6378245,
      rf: 298.3,
      ellipseName: 'Krassovsky, 1942'
    },
    SEasia: {
      a: 6378155,
      b: 6356773.3205,
      ellipseName: 'Southeast Asia'
    },
    walbeck: {
      a: 6376896,
      b: 6355834.8467,
      ellipseName: 'Walbeck'
    },
    WGS60: {
      a: 6378165,
      rf: 298.3,
      ellipseName: 'WGS 60'
    },
    WGS66: {
      a: 6378145,
      rf: 298.25,
      ellipseName: 'WGS 66'
    },
    WGS7: {
      a: 6378135,
      rf: 298.26,
      ellipseName: 'WGS 72'
    },
    WGS84: {
      a: 6378137,
      rf: 298.257223563,
      ellipseName: 'WGS 84'
    },
    sphere: {
      a: 6370997,
      b: 6370997,
      ellipseName: 'Normal Sphere (r=6370997)'
    }
  };

  const WGS84 = ellipsoids.WGS84; // default ellipsoid

  function eccentricity(a, b, rf, R_A) {
    var a2 = a * a; // used in geocentric
    var b2 = b * b; // used in geocentric
    var es = (a2 - b2) / a2; // e ^ 2
    var e = 0;
    if (R_A) {
      a *= 1 - es * (SIXTH + es * (RA4 + es * RA6));
      a2 = a * a;
      es = 0;
    } else {
      e = Math.sqrt(es); // eccentricity
    }
    var ep2 = (a2 - b2) / b2; // used in geocentric
    return {
      es: es,
      e: e,
      ep2: ep2
    };
  }
  function sphere(a, b, rf, ellps, sphere) {
    if (!a) { // do we have an ellipsoid?
      var ellipse = match(ellipsoids, ellps);
      if (!ellipse) {
        ellipse = WGS84;
      }
      a = ellipse.a;
      b = ellipse.b;
      rf = ellipse.rf;
    }

    if (rf && !b) {
      b = (1.0 - 1.0 / rf) * a;
    }
    if (rf === 0 || Math.abs(a - b) < EPSLN) {
      sphere = true;
      b = a;
    }
    return {
      a: a,
      b: b,
      rf: rf,
      sphere: sphere
    };
  }

  var datums = {
    wgs84: {
      towgs84: '0,0,0',
      ellipse: 'WGS84',
      datumName: 'WGS84'
    },
    ch1903: {
      towgs84: '674.374,15.056,405.346',
      ellipse: 'bessel',
      datumName: 'swiss'
    },
    ggrs87: {
      towgs84: '-199.87,74.79,246.62',
      ellipse: 'GRS80',
      datumName: 'Greek_Geodetic_Reference_System_1987'
    },
    nad83: {
      towgs84: '0,0,0',
      ellipse: 'GRS80',
      datumName: 'North_American_Datum_1983'
    },
    nad27: {
      nadgrids: '@conus,@alaska,@ntv2_0.gsb,@ntv1_can.dat',
      ellipse: 'clrk66',
      datumName: 'North_American_Datum_1927'
    },
    potsdam: {
      towgs84: '598.1,73.7,418.2,0.202,0.045,-2.455,6.7',
      ellipse: 'bessel',
      datumName: 'Potsdam Rauenberg 1950 DHDN'
    },
    carthage: {
      towgs84: '-263.0,6.0,431.0',
      ellipse: 'clark80',
      datumName: 'Carthage 1934 Tunisia'
    },
    hermannskogel: {
      towgs84: '577.326,90.129,463.919,5.137,1.474,5.297,2.4232',
      ellipse: 'bessel',
      datumName: 'Hermannskogel'
    },
    mgi: {
      towgs84: '577.326,90.129,463.919,5.137,1.474,5.297,2.4232',
      ellipse: 'bessel',
      datumName: 'Militar-Geographische Institut'
    },
    osni52: {
      towgs84: '482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15',
      ellipse: 'airy',
      datumName: 'Irish National'
    },
    ire65: {
      towgs84: '482.530,-130.596,564.557,-1.042,-0.214,-0.631,8.15',
      ellipse: 'mod_airy',
      datumName: 'Ireland 1965'
    },
    rassadiran: {
      towgs84: '-133.63,-157.5,-158.62',
      ellipse: 'intl',
      datumName: 'Rassadiran'
    },
    nzgd49: {
      towgs84: '59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993',
      ellipse: 'intl',
      datumName: 'New Zealand Geodetic Datum 1949'
    },
    osgb36: {
      towgs84: '446.448,-125.157,542.060,0.1502,0.2470,0.8421,-20.4894',
      ellipse: 'airy',
      datumName: 'Ordnance Survey of Great Britain 1936'
    },
    s_jtsk: {
      towgs84: '589,76,480',
      ellipse: 'bessel',
      datumName: 'S-JTSK (Ferro)'
    },
    beduaram: {
      towgs84: '-106,-87,188',
      ellipse: 'clrk80',
      datumName: 'Beduaram'
    },
    gunung_segara: {
      towgs84: '-403,684,41',
      ellipse: 'bessel',
      datumName: 'Gunung Segara Jakarta'
    },
    rnb72: {
      towgs84: '106.869,-52.2978,103.724,-0.33657,0.456955,-1.84218,1',
      ellipse: 'intl',
      datumName: 'Reseau National Belge 1972'
    },
    EPSG_5451: {
      towgs84: '6.41,-49.05,-11.28,1.5657,0.5242,6.9718,-5.7649'
    },
    IGNF_LURESG: {
      towgs84: '-192.986,13.673,-39.309,-0.4099,-2.9332,2.6881,0.43'
    },
    EPSG_4614: {
      towgs84: '-119.4248,-303.65872,-11.00061,1.164298,0.174458,1.096259,3.657065'
    },
    EPSG_4615: {
      towgs84: '-494.088,-312.129,279.877,-1.423,-1.013,1.59,-0.748'
    },
    ESRI_37241: {
      towgs84: '-76.822,257.457,-12.817,2.136,-0.033,-2.392,-0.031'
    },
    ESRI_37249: {
      towgs84: '-440.296,58.548,296.265,1.128,10.202,4.559,-0.438'
    },
    ESRI_37245: {
      towgs84: '-511.151,-181.269,139.609,1.05,2.703,1.798,3.071'
    },
    EPSG_4178: {
      towgs84: '24.9,-126.4,-93.2,-0.063,-0.247,-0.041,1.01'
    },
    EPSG_4622: {
      towgs84: '-472.29,-5.63,-304.12,0.4362,-0.8374,0.2563,1.8984'
    },
    EPSG_4625: {
      towgs84: '126.93,547.94,130.41,-2.7867,5.1612,-0.8584,13.8227'
    },
    EPSG_5252: {
      towgs84: '0.023,0.036,-0.068,0.00176,0.00912,-0.01136,0.00439'
    },
    EPSG_4314: {
      towgs84: '597.1,71.4,412.1,0.894,0.068,-1.563,7.58'
    },
    EPSG_4282: {
      towgs84: '-178.3,-316.7,-131.5,5.278,6.077,10.979,19.166'
    },
    EPSG_4231: {
      towgs84: '-83.11,-97.38,-117.22,0.0276,-0.2167,0.2147,0.1218'
    },
    EPSG_4274: {
      towgs84: '-230.994,102.591,25.199,0.633,-0.239,0.9,1.95'
    },
    EPSG_4134: {
      towgs84: '-180.624,-225.516,173.919,-0.81,-1.898,8.336,16.71006'
    },
    EPSG_4254: {
      towgs84: '18.38,192.45,96.82,0.056,-0.142,-0.2,-0.0013'
    },
    EPSG_4159: {
      towgs84: '-194.513,-63.978,-25.759,-3.4027,3.756,-3.352,-0.9175'
    },
    EPSG_4687: {
      towgs84: '0.072,-0.507,-0.245,0.0183,-0.0003,0.007,-0.0093'
    },
    EPSG_4227: {
      towgs84: '-83.58,-397.54,458.78,-17.595,-2.847,4.256,3.225'
    },
    EPSG_4746: {
      towgs84: '599.4,72.4,419.2,-0.062,-0.022,-2.723,6.46'
    },
    EPSG_4745: {
      towgs84: '612.4,77,440.2,-0.054,0.057,-2.797,2.55'
    },
    EPSG_6311: {
      towgs84: '8.846,-4.394,-1.122,-0.00237,-0.146528,0.130428,0.783926'
    },
    EPSG_4289: {
      towgs84: '565.7381,50.4018,465.2904,-1.91514,1.60363,-9.09546,4.07244'
    },
    EPSG_4230: {
      towgs84: '-68.863,-134.888,-111.49,-0.53,-0.14,0.57,-3.4'
    },
    EPSG_4154: {
      towgs84: '-123.02,-158.95,-168.47'
    },
    EPSG_4156: {
      towgs84: '570.8,85.7,462.8,4.998,1.587,5.261,3.56'
    },
    EPSG_4299: {
      towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
    },
    EPSG_4179: {
      towgs84: '33.4,-146.6,-76.3,-0.359,-0.053,0.844,-0.84'
    },
    EPSG_4313: {
      towgs84: '-106.8686,52.2978,-103.7239,0.3366,-0.457,1.8422,-1.2747'
    },
    EPSG_4194: {
      towgs84: '163.511,127.533,-159.789'
    },
    EPSG_4195: {
      towgs84: '105,326,-102.5'
    },
    EPSG_4196: {
      towgs84: '-45,417,-3.5'
    },
    EPSG_4611: {
      towgs84: '-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246'
    },
    EPSG_4633: {
      towgs84: '137.092,131.66,91.475,-1.9436,-11.5993,-4.3321,-7.4824'
    },
    EPSG_4641: {
      towgs84: '-408.809,366.856,-412.987,1.8842,-0.5308,2.1655,-121.0993'
    },
    EPSG_4643: {
      towgs84: '-480.26,-438.32,-643.429,16.3119,20.1721,-4.0349,-111.7002'
    },
    EPSG_4300: {
      towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
    },
    EPSG_4188: {
      towgs84: '482.5,-130.6,564.6,-1.042,-0.214,-0.631,8.15'
    },
    EPSG_4660: {
      towgs84: '982.6087,552.753,-540.873,32.39344,-153.25684,-96.2266,16.805'
    },
    EPSG_4662: {
      towgs84: '97.295,-263.247,310.882,-1.5999,0.8386,3.1409,13.3259'
    },
    EPSG_3906: {
      towgs84: '577.88891,165.22205,391.18289,4.9145,-0.94729,-13.05098,7.78664'
    },
    EPSG_4307: {
      towgs84: '-209.3622,-87.8162,404.6198,0.0046,3.4784,0.5805,-1.4547'
    },
    EPSG_6892: {
      towgs84: '-76.269,-16.683,68.562,-6.275,10.536,-4.286,-13.686'
    },
    EPSG_4690: {
      towgs84: '221.597,152.441,176.523,2.403,1.3893,0.884,11.4648'
    },
    EPSG_4691: {
      towgs84: '218.769,150.75,176.75,3.5231,2.0037,1.288,10.9817'
    },
    EPSG_4629: {
      towgs84: '72.51,345.411,79.241,-1.5862,-0.8826,-0.5495,1.3653'
    },
    EPSG_4630: {
      towgs84: '165.804,216.213,180.26,-0.6251,-0.4515,-0.0721,7.4111'
    },
    EPSG_4692: {
      towgs84: '217.109,86.452,23.711,0.0183,-0.0003,0.007,-0.0093'
    },
    EPSG_9333: {
      towgs84: '0,0,0,-8.393,0.749,-10.276,0'
    },
    EPSG_9059: {
      towgs84: '0,0,0'
    },
    EPSG_4312: {
      towgs84: '601.705,84.263,485.227,4.7354,1.3145,5.393,-2.3887'
    },
    EPSG_4123: {
      towgs84: '-96.062,-82.428,-121.753,4.801,0.345,-1.376,1.496'
    },
    EPSG_4309: {
      towgs84: '-124.45,183.74,44.64,-0.4384,0.5446,-0.9706,-2.1365'
    },
    ESRI_104106: {
      towgs84: '-283.088,-70.693,117.445,-1.157,0.059,-0.652,-4.058'
    },
    EPSG_4281: {
      towgs84: '-219.247,-73.802,269.529'
    },
    EPSG_4322: {
      towgs84: '0,0,4.5'
    },
    EPSG_4324: {
      towgs84: '0,0,1.9'
    },
    EPSG_4284: {
      towgs84: '43.822,-108.842,-119.585,1.455,-0.761,0.737,0.549'
    },
    EPSG_4277: {
      towgs84: '446.448,-125.157,542.06,0.15,0.247,0.842,-20.489'
    },
    EPSG_4207: {
      towgs84: '-282.1,-72.2,120,-1.529,0.145,-0.89,-4.46'
    },
    EPSG_4688: {
      towgs84: '347.175,1077.618,2623.677,33.9058,-70.6776,9.4013,186.0647'
    },
    EPSG_4689: {
      towgs84: '410.793,54.542,80.501,-2.5596,-2.3517,-0.6594,17.3218'
    },
    EPSG_4720: {
      towgs84: '0,0,4.5'
    },
    EPSG_4273: {
      towgs84: '278.3,93,474.5,7.889,0.05,-6.61,6.21'
    },
    EPSG_4240: {
      towgs84: '204.64,834.74,293.8'
    },
    EPSG_4817: {
      towgs84: '278.3,93,474.5,7.889,0.05,-6.61,6.21'
    },
    ESRI_104131: {
      towgs84: '426.62,142.62,460.09,4.98,4.49,-12.42,-17.1'
    },
    EPSG_4265: {
      towgs84: '-104.1,-49.1,-9.9,0.971,-2.917,0.714,-11.68'
    },
    EPSG_4263: {
      towgs84: '-111.92,-87.85,114.5,1.875,0.202,0.219,0.032'
    },
    EPSG_4298: {
      towgs84: '-689.5937,623.84046,-65.93566,-0.02331,1.17094,-0.80054,5.88536'
    },
    EPSG_4270: {
      towgs84: '-253.4392,-148.452,386.5267,0.15605,0.43,-0.1013,-0.0424'
    },
    EPSG_4229: {
      towgs84: '-121.8,98.1,-10.7'
    },
    EPSG_4220: {
      towgs84: '-55.5,-348,-229.2'
    },
    EPSG_4214: {
      towgs84: '12.646,-155.176,-80.863'
    },
    EPSG_4232: {
      towgs84: '-345,3,223'
    },
    EPSG_4238: {
      towgs84: '-1.977,-13.06,-9.993,0.364,0.254,0.689,-1.037'
    },
    EPSG_4168: {
      towgs84: '-170,33,326'
    },
    EPSG_4131: {
      towgs84: '199,931,318.9'
    },
    EPSG_4152: {
      towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
    },
    EPSG_5228: {
      towgs84: '572.213,85.334,461.94,4.9732,1.529,5.2484,3.5378'
    },
    EPSG_8351: {
      towgs84: '485.021,169.465,483.839,7.786342,4.397554,4.102655,0'
    },
    EPSG_4683: {
      towgs84: '-127.62,-67.24,-47.04,-3.068,4.903,1.578,-1.06'
    },
    EPSG_4133: {
      towgs84: '0,0,0'
    },
    EPSG_7373: {
      towgs84: '0.819,-0.5762,-1.6446,-0.00378,-0.03317,0.00318,0.0693'
    },
    EPSG_9075: {
      towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
    },
    EPSG_9072: {
      towgs84: '-0.9102,2.0141,0.5602,0.029039,0.010065,0.010101,0'
    },
    EPSG_9294: {
      towgs84: '1.16835,-1.42001,-2.24431,-0.00822,-0.05508,0.01818,0.23388'
    },
    EPSG_4212: {
      towgs84: '-267.434,173.496,181.814,-13.4704,8.7154,7.3926,14.7492'
    },
    EPSG_4191: {
      towgs84: '-44.183,-0.58,-38.489,2.3867,2.7072,-3.5196,-8.2703'
    },
    EPSG_4237: {
      towgs84: '52.684,-71.194,-13.975,-0.312,-0.1063,-0.3729,1.0191'
    },
    EPSG_4740: {
      towgs84: '-1.08,-0.27,-0.9'
    },
    EPSG_4124: {
      towgs84: '419.3836,99.3335,591.3451,0.850389,1.817277,-7.862238,-0.99496'
    },
    EPSG_5681: {
      towgs84: '584.9636,107.7175,413.8067,1.1155,0.2824,-3.1384,7.9922'
    },
    EPSG_4141: {
      towgs84: '23.772,17.49,17.859,-0.3132,-1.85274,1.67299,-5.4262'
    },
    EPSG_4204: {
      towgs84: '-85.645,-273.077,-79.708,2.289,-1.421,2.532,3.194'
    },
    EPSG_4319: {
      towgs84: '226.702,-193.337,-35.371,-2.229,-4.391,9.238,0.9798'
    },
    EPSG_4200: {
      towgs84: '24.82,-131.21,-82.66'
    },
    EPSG_4130: {
      towgs84: '0,0,0'
    },
    EPSG_4127: {
      towgs84: '-82.875,-57.097,-156.768,-2.158,1.524,-0.982,-0.359'
    },
    EPSG_4149: {
      towgs84: '674.374,15.056,405.346'
    },
    EPSG_4617: {
      towgs84: '-0.991,1.9072,0.5129,1.25033e-7,4.6785e-8,5.6529e-8,0'
    },
    EPSG_4663: {
      towgs84: '-210.502,-66.902,-48.476,2.094,-15.067,-5.817,0.485'
    },
    EPSG_4664: {
      towgs84: '-211.939,137.626,58.3,-0.089,0.251,0.079,0.384'
    },
    EPSG_4665: {
      towgs84: '-105.854,165.589,-38.312,-0.003,-0.026,0.024,-0.048'
    },
    EPSG_4666: {
      towgs84: '631.392,-66.551,481.442,1.09,-4.445,-4.487,-4.43'
    },
    EPSG_4756: {
      towgs84: '-192.873,-39.382,-111.202,-0.00205,-0.0005,0.00335,0.0188'
    },
    EPSG_4723: {
      towgs84: '-179.483,-69.379,-27.584,-7.862,8.163,6.042,-13.925'
    },
    EPSG_4726: {
      towgs84: '8.853,-52.644,180.304,-0.393,-2.323,2.96,-24.081'
    },
    EPSG_4267: {
      towgs84: '-8.0,160.0,176.0'
    },
    EPSG_5365: {
      towgs84: '-0.16959,0.35312,0.51846,0.03385,-0.16325,0.03446,0.03693'
    },
    EPSG_4218: {
      towgs84: '304.5,306.5,-318.1'
    },
    EPSG_4242: {
      towgs84: '-33.722,153.789,94.959,-8.581,-4.478,4.54,8.95'
    },
    EPSG_4216: {
      towgs84: '-292.295,248.758,429.447,4.9971,2.99,6.6906,1.0289'
    },
    ESRI_104105: {
      towgs84: '631.392,-66.551,481.442,1.09,-4.445,-4.487,-4.43'
    },
    ESRI_104129: {
      towgs84: '0,0,0'
    },
    EPSG_4673: {
      towgs84: '174.05,-25.49,112.57'
    },
    EPSG_4202: {
      towgs84: '-124,-60,154'
    },
    EPSG_4203: {
      towgs84: '-117.763,-51.51,139.061,0.292,0.443,0.277,-0.191'
    },
    EPSG_3819: {
      towgs84: '595.48,121.69,515.35,4.115,-2.9383,0.853,-3.408'
    },
    EPSG_8694: {
      towgs84: '-93.799,-132.737,-219.073,-1.844,0.648,-6.37,-0.169'
    },
    EPSG_4145: {
      towgs84: '275.57,676.78,229.6'
    },
    EPSG_4283: {
      towgs84: '61.55,-10.87,-40.19,39.4924,32.7221,32.8979,-9.994'
    },
    EPSG_4317: {
      towgs84: '2.3287,-147.0425,-92.0802,-0.3092483,0.32482185,0.49729934,5.68906266'
    },
    EPSG_4272: {
      towgs84: '59.47,-5.04,187.44,0.47,-0.1,1.024,-4.5993'
    },
    EPSG_4248: {
      towgs84: '-307.7,265.3,-363.5'
    },
    EPSG_5561: {
      towgs84: '24,-121,-76'
    },
    EPSG_5233: {
      towgs84: '-0.293,766.95,87.713,0.195704,1.695068,3.473016,-0.039338'
    },
    ESRI_104130: {
      towgs84: '-86,-98,-119'
    },
    ESRI_104102: {
      towgs84: '682,-203,480'
    },
    ESRI_37207: {
      towgs84: '7,-10,-26'
    },
    EPSG_4675: {
      towgs84: '59.935,118.4,-10.871'
    },
    ESRI_104109: {
      towgs84: '-89.121,-348.182,260.871'
    },
    ESRI_104112: {
      towgs84: '-185.583,-230.096,281.361'
    },
    ESRI_104113: {
      towgs84: '25.1,-275.6,222.6'
    },
    IGNF_WGS72G: {
      towgs84: '0,12,6'
    },
    IGNF_NTFG: {
      towgs84: '-168,-60,320'
    },
    IGNF_EFATE57G: {
      towgs84: '-127,-769,472'
    },
    IGNF_PGP50G: {
      towgs84: '324.8,153.6,172.1'
    },
    IGNF_REUN47G: {
      towgs84: '94,-948,-1262'
    },
    IGNF_CSG67G: {
      towgs84: '-186,230,110'
    },
    IGNF_GUAD48G: {
      towgs84: '-467,-16,-300'
    },
    IGNF_TAHI51G: {
      towgs84: '162,117,154'
    },
    IGNF_TAHAAG: {
      towgs84: '65,342,77'
    },
    IGNF_NUKU72G: {
      towgs84: '84,274,65'
    },
    IGNF_PETRELS72G: {
      towgs84: '365,194,166'
    },
    IGNF_WALL78G: {
      towgs84: '253,-133,-127'
    },
    IGNF_MAYO50G: {
      towgs84: '-382,-59,-262'
    },
    IGNF_TANNAG: {
      towgs84: '-139,-967,436'
    },
    IGNF_IGN72G: {
      towgs84: '-13,-348,292'
    },
    IGNF_ATIGG: {
      towgs84: '1118,23,66'
    },
    IGNF_FANGA84G: {
      towgs84: '150.57,158.33,118.32'
    },
    IGNF_RUSAT84G: {
      towgs84: '202.13,174.6,-15.74'
    },
    IGNF_KAUE70G: {
      towgs84: '126.74,300.1,-75.49'
    },
    IGNF_MOP90G: {
      towgs84: '-10.8,-1.8,12.77'
    },
    IGNF_MHPF67G: {
      towgs84: '338.08,212.58,-296.17'
    },
    IGNF_TAHI79G: {
      towgs84: '160.61,116.05,153.69'
    },
    IGNF_ANAA92G: {
      towgs84: '1.5,3.84,4.81'
    },
    IGNF_MARQUI72G: {
      towgs84: '330.91,-13.92,58.56'
    },
    IGNF_APAT86G: {
      towgs84: '143.6,197.82,74.05'
    },
    IGNF_TUBU69G: {
      towgs84: '237.17,171.61,-77.84'
    },
    IGNF_STPM50G: {
      towgs84: '11.363,424.148,373.13'
    },
    EPSG_4150: {
      towgs84: '674.374,15.056,405.346'
    },
    EPSG_4754: {
      towgs84: '-208.4058,-109.8777,-2.5764'
    },
    ESRI_104101: {
      towgs84: '374,150,588'
    },
    EPSG_4693: {
      towgs84: '0,-0.15,0.68'
    },
    EPSG_6207: {
      towgs84: '293.17,726.18,245.36'
    },
    EPSG_4153: {
      towgs84: '-133.63,-157.5,-158.62'
    },
    EPSG_4132: {
      towgs84: '-241.54,-163.64,396.06'
    },
    EPSG_4221: {
      towgs84: '-154.5,150.7,100.4'
    },
    EPSG_4266: {
      towgs84: '-80.7,-132.5,41.1'
    },
    EPSG_4193: {
      towgs84: '-70.9,-151.8,-41.4'
    },
    EPSG_5340: {
      towgs84: '-0.41,0.46,-0.35'
    },
    EPSG_4246: {
      towgs84: '-294.7,-200.1,525.5'
    },
    EPSG_4318: {
      towgs84: '-3.2,-5.7,2.8'
    },
    EPSG_4121: {
      towgs84: '-199.87,74.79,246.62'
    },
    EPSG_4223: {
      towgs84: '-260.1,5.5,432.2'
    },
    EPSG_4158: {
      towgs84: '-0.465,372.095,171.736'
    },
    EPSG_4285: {
      towgs84: '-128.16,-282.42,21.93'
    },
    EPSG_4613: {
      towgs84: '-404.78,685.68,45.47'
    },
    EPSG_4607: {
      towgs84: '195.671,332.517,274.607'
    },
    EPSG_4475: {
      towgs84: '-381.788,-57.501,-256.673'
    },
    EPSG_4208: {
      towgs84: '-157.84,308.54,-146.6'
    },
    EPSG_4743: {
      towgs84: '70.995,-335.916,262.898'
    },
    EPSG_4710: {
      towgs84: '-323.65,551.39,-491.22'
    },
    EPSG_7881: {
      towgs84: '-0.077,0.079,0.086'
    },
    EPSG_4682: {
      towgs84: '283.729,735.942,261.143'
    },
    EPSG_4739: {
      towgs84: '-156,-271,-189'
    },
    EPSG_4679: {
      towgs84: '-80.01,253.26,291.19'
    },
    EPSG_4750: {
      towgs84: '-56.263,16.136,-22.856'
    },
    EPSG_4644: {
      towgs84: '-10.18,-350.43,291.37'
    },
    EPSG_4695: {
      towgs84: '-103.746,-9.614,-255.95'
    },
    EPSG_4292: {
      towgs84: '-355,21,72'
    },
    EPSG_4302: {
      towgs84: '-61.702,284.488,472.052'
    },
    EPSG_4143: {
      towgs84: '-124.76,53,466.79'
    },
    EPSG_4606: {
      towgs84: '-153,153,307'
    },
    EPSG_4699: {
      towgs84: '-770.1,158.4,-498.2'
    },
    EPSG_4247: {
      towgs84: '-273.5,110.6,-357.9'
    },
    EPSG_4160: {
      towgs84: '8.88,184.86,106.69'
    },
    EPSG_4161: {
      towgs84: '-233.43,6.65,173.64'
    },
    EPSG_9251: {
      towgs84: '-9.5,122.9,138.2'
    },
    EPSG_9253: {
      towgs84: '-78.1,101.6,133.3'
    },
    EPSG_4297: {
      towgs84: '-198.383,-240.517,-107.909'
    },
    EPSG_4269: {
      towgs84: '0,0,0'
    },
    EPSG_4301: {
      towgs84: '-147,506,687'
    },
    EPSG_4618: {
      towgs84: '-59,-11,-52'
    },
    EPSG_4612: {
      towgs84: '0,0,0'
    },
    EPSG_4678: {
      towgs84: '44.585,-131.212,-39.544'
    },
    EPSG_4250: {
      towgs84: '-130,29,364'
    },
    EPSG_4144: {
      towgs84: '214,804,268'
    },
    EPSG_4147: {
      towgs84: '-17.51,-108.32,-62.39'
    },
    EPSG_4259: {
      towgs84: '-254.1,-5.36,-100.29'
    },
    EPSG_4164: {
      towgs84: '-76,-138,67'
    },
    EPSG_4211: {
      towgs84: '-378.873,676.002,-46.255'
    },
    EPSG_4182: {
      towgs84: '-422.651,-172.995,84.02'
    },
    EPSG_4224: {
      towgs84: '-143.87,243.37,-33.52'
    },
    EPSG_4225: {
      towgs84: '-205.57,168.77,-4.12'
    },
    EPSG_5527: {
      towgs84: '-67.35,3.88,-38.22'
    },
    EPSG_4752: {
      towgs84: '98,390,-22'
    },
    EPSG_4310: {
      towgs84: '-30,190,89'
    },
    EPSG_9248: {
      towgs84: '-192.26,65.72,132.08'
    },
    EPSG_4680: {
      towgs84: '124.5,-63.5,-281'
    },
    EPSG_4701: {
      towgs84: '-79.9,-158,-168.9'
    },
    EPSG_4706: {
      towgs84: '-146.21,112.63,4.05'
    },
    EPSG_4805: {
      towgs84: '682,-203,480'
    },
    EPSG_4201: {
      towgs84: '-165,-11,206'
    },
    EPSG_4210: {
      towgs84: '-157,-2,-299'
    },
    EPSG_4183: {
      towgs84: '-104,167,-38'
    },
    EPSG_4139: {
      towgs84: '11,72,-101'
    },
    EPSG_4668: {
      towgs84: '-86,-98,-119'
    },
    EPSG_4717: {
      towgs84: '-2,151,181'
    },
    EPSG_4732: {
      towgs84: '102,52,-38'
    },
    EPSG_4280: {
      towgs84: '-377,681,-50'
    },
    EPSG_4209: {
      towgs84: '-138,-105,-289'
    },
    EPSG_4261: {
      towgs84: '31,146,47'
    },
    EPSG_4658: {
      towgs84: '-73,46,-86'
    },
    EPSG_4721: {
      towgs84: '265.025,384.929,-194.046'
    },
    EPSG_4222: {
      towgs84: '-136,-108,-292'
    },
    EPSG_4601: {
      towgs84: '-255,-15,71'
    },
    EPSG_4602: {
      towgs84: '725,685,536'
    },
    EPSG_4603: {
      towgs84: '72,213.7,93'
    },
    EPSG_4605: {
      towgs84: '9,183,236'
    },
    EPSG_4621: {
      towgs84: '137,248,-430'
    },
    EPSG_4657: {
      towgs84: '-28,199,5'
    },
    EPSG_4316: {
      towgs84: '103.25,-100.4,-307.19'
    },
    EPSG_4642: {
      towgs84: '-13,-348,292'
    },
    EPSG_4698: {
      towgs84: '145,-187,103'
    },
    EPSG_4192: {
      towgs84: '-206.1,-174.7,-87.7'
    },
    EPSG_4311: {
      towgs84: '-265,120,-358'
    },
    EPSG_4135: {
      towgs84: '58,-283,-182'
    },
    ESRI_104138: {
      towgs84: '198,-226,-347'
    },
    EPSG_4245: {
      towgs84: '-11,851,5'
    },
    EPSG_4142: {
      towgs84: '-125,53,467'
    },
    EPSG_4213: {
      towgs84: '-106,-87,188'
    },
    EPSG_4253: {
      towgs84: '-133,-77,-51'
    },
    EPSG_4129: {
      towgs84: '-132,-110,-335'
    },
    EPSG_4713: {
      towgs84: '-77,-128,142'
    },
    EPSG_4239: {
      towgs84: '217,823,299'
    },
    EPSG_4146: {
      towgs84: '295,736,257'
    },
    EPSG_4155: {
      towgs84: '-83,37,124'
    },
    EPSG_4165: {
      towgs84: '-173,253,27'
    },
    EPSG_4672: {
      towgs84: '175,-38,113'
    },
    EPSG_4236: {
      towgs84: '-637,-549,-203'
    },
    EPSG_4251: {
      towgs84: '-90,40,88'
    },
    EPSG_4271: {
      towgs84: '-2,374,172'
    },
    EPSG_4175: {
      towgs84: '-88,4,101'
    },
    EPSG_4716: {
      towgs84: '298,-304,-375'
    },
    EPSG_4315: {
      towgs84: '-23,259,-9'
    },
    EPSG_4744: {
      towgs84: '-242.2,-144.9,370.3'
    },
    EPSG_4244: {
      towgs84: '-97,787,86'
    },
    EPSG_4293: {
      towgs84: '616,97,-251'
    },
    EPSG_4714: {
      towgs84: '-127,-769,472'
    },
    EPSG_4736: {
      towgs84: '260,12,-147'
    },
    EPSG_6883: {
      towgs84: '-235,-110,393'
    },
    EPSG_6894: {
      towgs84: '-63,176,185'
    },
    EPSG_4205: {
      towgs84: '-43,-163,45'
    },
    EPSG_4256: {
      towgs84: '41,-220,-134'
    },
    EPSG_4262: {
      towgs84: '639,405,60'
    },
    EPSG_4604: {
      towgs84: '174,359,365'
    },
    EPSG_4169: {
      towgs84: '-115,118,426'
    },
    EPSG_4620: {
      towgs84: '-106,-129,165'
    },
    EPSG_4184: {
      towgs84: '-203,141,53'
    },
    EPSG_4616: {
      towgs84: '-289,-124,60'
    },
    EPSG_9403: {
      towgs84: '-307,-92,127'
    },
    EPSG_4684: {
      towgs84: '-133,-321,50'
    },
    EPSG_4708: {
      towgs84: '-491,-22,435'
    },
    EPSG_4707: {
      towgs84: '114,-116,-333'
    },
    EPSG_4709: {
      towgs84: '145,75,-272'
    },
    EPSG_4712: {
      towgs84: '-205,107,53'
    },
    EPSG_4711: {
      towgs84: '124,-234,-25'
    },
    EPSG_4718: {
      towgs84: '230,-199,-752'
    },
    EPSG_4719: {
      towgs84: '211,147,111'
    },
    EPSG_4724: {
      towgs84: '208,-435,-229'
    },
    EPSG_4725: {
      towgs84: '189,-79,-202'
    },
    EPSG_4735: {
      towgs84: '647,1777,-1124'
    },
    EPSG_4722: {
      towgs84: '-794,119,-298'
    },
    EPSG_4728: {
      towgs84: '-307,-92,127'
    },
    EPSG_4734: {
      towgs84: '-632,438,-609'
    },
    EPSG_4727: {
      towgs84: '912,-58,1227'
    },
    EPSG_4729: {
      towgs84: '185,165,42'
    },
    EPSG_4730: {
      towgs84: '170,42,84'
    },
    EPSG_4733: {
      towgs84: '276,-57,149'
    },
    ESRI_37218: {
      towgs84: '230,-199,-752'
    },
    ESRI_37240: {
      towgs84: '-7,215,225'
    },
    ESRI_37221: {
      towgs84: '252,-209,-751'
    },
    ESRI_4305: {
      towgs84: '-123,-206,219'
    },
    ESRI_104139: {
      towgs84: '-73,-247,227'
    },
    EPSG_4748: {
      towgs84: '51,391,-36'
    },
    EPSG_4219: {
      towgs84: '-384,664,-48'
    },
    EPSG_4255: {
      towgs84: '-333,-222,114'
    },
    EPSG_4257: {
      towgs84: '-587.8,519.75,145.76'
    },
    EPSG_4646: {
      towgs84: '-963,510,-359'
    },
    EPSG_6881: {
      towgs84: '-24,-203,268'
    },
    EPSG_6882: {
      towgs84: '-183,-15,273'
    },
    EPSG_4715: {
      towgs84: '-104,-129,239'
    },
    IGNF_RGF93GDD: {
      towgs84: '0,0,0'
    },
    IGNF_RGM04GDD: {
      towgs84: '0,0,0'
    },
    IGNF_RGSPM06GDD: {
      towgs84: '0,0,0'
    },
    IGNF_RGTAAF07GDD: {
      towgs84: '0,0,0'
    },
    IGNF_RGFG95GDD: {
      towgs84: '0,0,0'
    },
    IGNF_RGNCG: {
      towgs84: '0,0,0'
    },
    IGNF_RGPFGDD: {
      towgs84: '0,0,0'
    },
    IGNF_ETRS89G: {
      towgs84: '0,0,0'
    },
    IGNF_RGR92GDD: {
      towgs84: '0,0,0'
    },
    EPSG_4173: {
      towgs84: '0,0,0'
    },
    EPSG_4180: {
      towgs84: '0,0,0'
    },
    EPSG_4619: {
      towgs84: '0,0,0'
    },
    EPSG_4667: {
      towgs84: '0,0,0'
    },
    EPSG_4075: {
      towgs84: '0,0,0'
    },
    EPSG_6706: {
      towgs84: '0,0,0'
    },
    EPSG_7798: {
      towgs84: '0,0,0'
    },
    EPSG_4661: {
      towgs84: '0,0,0'
    },
    EPSG_4669: {
      towgs84: '0,0,0'
    },
    EPSG_8685: {
      towgs84: '0,0,0'
    },
    EPSG_4151: {
      towgs84: '0,0,0'
    },
    EPSG_9702: {
      towgs84: '0,0,0'
    },
    EPSG_4758: {
      towgs84: '0,0,0'
    },
    EPSG_4761: {
      towgs84: '0,0,0'
    },
    EPSG_4765: {
      towgs84: '0,0,0'
    },
    EPSG_8997: {
      towgs84: '0,0,0'
    },
    EPSG_4023: {
      towgs84: '0,0,0'
    },
    EPSG_4670: {
      towgs84: '0,0,0'
    },
    EPSG_4694: {
      towgs84: '0,0,0'
    },
    EPSG_4148: {
      towgs84: '0,0,0'
    },
    EPSG_4163: {
      towgs84: '0,0,0'
    },
    EPSG_4167: {
      towgs84: '0,0,0'
    },
    EPSG_4189: {
      towgs84: '0,0,0'
    },
    EPSG_4190: {
      towgs84: '0,0,0'
    },
    EPSG_4176: {
      towgs84: '0,0,0'
    },
    EPSG_4659: {
      towgs84: '0,0,0'
    },
    EPSG_3824: {
      towgs84: '0,0,0'
    },
    EPSG_3889: {
      towgs84: '0,0,0'
    },
    EPSG_4046: {
      towgs84: '0,0,0'
    },
    EPSG_4081: {
      towgs84: '0,0,0'
    },
    EPSG_4558: {
      towgs84: '0,0,0'
    },
    EPSG_4483: {
      towgs84: '0,0,0'
    },
    EPSG_5013: {
      towgs84: '0,0,0'
    },
    EPSG_5264: {
      towgs84: '0,0,0'
    },
    EPSG_5324: {
      towgs84: '0,0,0'
    },
    EPSG_5354: {
      towgs84: '0,0,0'
    },
    EPSG_5371: {
      towgs84: '0,0,0'
    },
    EPSG_5373: {
      towgs84: '0,0,0'
    },
    EPSG_5381: {
      towgs84: '0,0,0'
    },
    EPSG_5393: {
      towgs84: '0,0,0'
    },
    EPSG_5489: {
      towgs84: '0,0,0'
    },
    EPSG_5593: {
      towgs84: '0,0,0'
    },
    EPSG_6135: {
      towgs84: '0,0,0'
    },
    EPSG_6365: {
      towgs84: '0,0,0'
    },
    EPSG_5246: {
      towgs84: '0,0,0'
    },
    EPSG_7886: {
      towgs84: '0,0,0'
    },
    EPSG_8431: {
      towgs84: '0,0,0'
    },
    EPSG_8427: {
      towgs84: '0,0,0'
    },
    EPSG_8699: {
      towgs84: '0,0,0'
    },
    EPSG_8818: {
      towgs84: '0,0,0'
    },
    EPSG_4757: {
      towgs84: '0,0,0'
    },
    EPSG_9140: {
      towgs84: '0,0,0'
    },
    EPSG_8086: {
      towgs84: '0,0,0'
    },
    EPSG_4686: {
      towgs84: '0,0,0'
    },
    EPSG_4737: {
      towgs84: '0,0,0'
    },
    EPSG_4702: {
      towgs84: '0,0,0'
    },
    EPSG_4747: {
      towgs84: '0,0,0'
    },
    EPSG_4749: {
      towgs84: '0,0,0'
    },
    EPSG_4674: {
      towgs84: '0,0,0'
    },
    EPSG_4755: {
      towgs84: '0,0,0'
    },
    EPSG_4759: {
      towgs84: '0,0,0'
    },
    EPSG_4762: {
      towgs84: '0,0,0'
    },
    EPSG_4763: {
      towgs84: '0,0,0'
    },
    EPSG_4764: {
      towgs84: '0,0,0'
    },
    EPSG_4166: {
      towgs84: '0,0,0'
    },
    EPSG_4170: {
      towgs84: '0,0,0'
    },
    EPSG_5546: {
      towgs84: '0,0,0'
    },
    EPSG_7844: {
      towgs84: '0,0,0'
    },
    EPSG_4818: {
      towgs84: '589,76,480'
    }
  };

  for (var key in datums) {
    var datum$1 = datums[key];
    if (!datum$1.datumName) {
      continue;
    }
    datums[datum$1.datumName] = datum$1;
  }

  function datum(datumCode, datum_params, a, b, es, ep2, nadgrids) {
    var out = {};

    if (datumCode === undefined || datumCode === 'none') {
      out.datum_type = PJD_NODATUM;
    } else {
      out.datum_type = PJD_WGS84;
    }

    if (datum_params) {
      out.datum_params = datum_params.map(parseFloat);
      if (out.datum_params[0] !== 0 || out.datum_params[1] !== 0 || out.datum_params[2] !== 0) {
        out.datum_type = PJD_3PARAM;
      }
      if (out.datum_params.length > 3) {
        if (out.datum_params[3] !== 0 || out.datum_params[4] !== 0 || out.datum_params[5] !== 0 || out.datum_params[6] !== 0) {
          out.datum_type = PJD_7PARAM;
          out.datum_params[3] *= SEC_TO_RAD;
          out.datum_params[4] *= SEC_TO_RAD;
          out.datum_params[5] *= SEC_TO_RAD;
          out.datum_params[6] = (out.datum_params[6] / 1000000.0) + 1.0;
        }
      }
    }

    if (nadgrids) {
      out.datum_type = PJD_GRIDSHIFT;
      out.grids = nadgrids;
    }
    out.a = a; // datum object also uses these values
    out.b = b;
    out.es = es;
    out.ep2 = ep2;
    return out;
  }

  /**
   * Resources for details of NTv2 file formats:
   * - https://web.archive.org/web/20140127204822if_/http://www.mgs.gov.on.ca:80/stdprodconsume/groups/content/@mgs/@iandit/documents/resourcelist/stel02_047447.pdf
   * - http://mimaka.com/help/gs/html/004_NTV2%20Data%20Format.htm
   */

  var loadedNadgrids = {};

  /**
   * Load a binary NTv2 file (.gsb) to a key that can be used in a proj string like +nadgrids=<key>. Pass the NTv2 file
   * as an ArrayBuffer.
   */
  function nadgrid(key, data, options) {
    var includeErrorFields = true;
    if (options !== undefined && options.includeErrorFields === false) {
      includeErrorFields = false;
    }
    var view = new DataView(data);
    var isLittleEndian = detectLittleEndian(view);
    var header = readHeader(view, isLittleEndian);
    var subgrids = readSubgrids(view, header, isLittleEndian, includeErrorFields);
    var nadgrid = { header: header, subgrids: subgrids };
    loadedNadgrids[key] = nadgrid;
    return nadgrid;
  }

  /**
   * Given a proj4 value for nadgrids, return an array of loaded grids
   */
  function getNadgrids(nadgrids) {
    // Format details: http://proj.maptools.org/gen_parms.html
    if (nadgrids === undefined) {
      return null;
    }
    var grids = nadgrids.split(',');
    return grids.map(parseNadgridString);
  }

  function parseNadgridString(value) {
    if (value.length === 0) {
      return null;
    }
    var optional = value[0] === '@';
    if (optional) {
      value = value.slice(1);
    }
    if (value === 'null') {
      return { name: 'null', mandatory: !optional, grid: null, isNull: true };
    }
    return {
      name: value,
      mandatory: !optional,
      grid: loadedNadgrids[value] || null,
      isNull: false
    };
  }

  function secondsToRadians(seconds) {
    return (seconds / 3600) * Math.PI / 180;
  }

  function detectLittleEndian(view) {
    var nFields = view.getInt32(8, false);
    if (nFields === 11) {
      return false;
    }
    nFields = view.getInt32(8, true);
    if (nFields !== 11) {
      console.warn('Failed to detect nadgrid endian-ness, defaulting to little-endian');
    }
    return true;
  }

  function readHeader(view, isLittleEndian) {
    return {
      nFields: view.getInt32(8, isLittleEndian),
      nSubgridFields: view.getInt32(24, isLittleEndian),
      nSubgrids: view.getInt32(40, isLittleEndian),
      shiftType: decodeString(view, 56, 56 + 8).trim(),
      fromSemiMajorAxis: view.getFloat64(120, isLittleEndian),
      fromSemiMinorAxis: view.getFloat64(136, isLittleEndian),
      toSemiMajorAxis: view.getFloat64(152, isLittleEndian),
      toSemiMinorAxis: view.getFloat64(168, isLittleEndian)
    };
  }

  function decodeString(view, start, end) {
    return String.fromCharCode.apply(null, new Uint8Array(view.buffer.slice(start, end)));
  }

  function readSubgrids(view, header, isLittleEndian, includeErrorFields) {
    var gridOffset = 176;
    var grids = [];
    for (var i = 0; i < header.nSubgrids; i++) {
      var subHeader = readGridHeader(view, gridOffset, isLittleEndian);
      var nodes = readGridNodes(view, gridOffset, subHeader, isLittleEndian, includeErrorFields);
      var lngColumnCount = Math.round(
        1 + (subHeader.upperLongitude - subHeader.lowerLongitude) / subHeader.longitudeInterval);
      var latColumnCount = Math.round(
        1 + (subHeader.upperLatitude - subHeader.lowerLatitude) / subHeader.latitudeInterval);
      // Proj4 operates on radians whereas the coordinates are in seconds in the grid
      grids.push({
        ll: [secondsToRadians(subHeader.lowerLongitude), secondsToRadians(subHeader.lowerLatitude)],
        del: [secondsToRadians(subHeader.longitudeInterval), secondsToRadians(subHeader.latitudeInterval)],
        lim: [lngColumnCount, latColumnCount],
        count: subHeader.gridNodeCount,
        cvs: mapNodes(nodes)
      });
      var rowSize = 16;
      if (includeErrorFields === false) {
        rowSize = 8;
      }
      gridOffset += 176 + subHeader.gridNodeCount * rowSize;
    }
    return grids;
  }

  function mapNodes(nodes) {
    return nodes.map(function (r) {
      return [secondsToRadians(r.longitudeShift), secondsToRadians(r.latitudeShift)];
    });
  }

  function readGridHeader(view, offset, isLittleEndian) {
    return {
      name: decodeString(view, offset + 8, offset + 16).trim(),
      parent: decodeString(view, offset + 24, offset + 24 + 8).trim(),
      lowerLatitude: view.getFloat64(offset + 72, isLittleEndian),
      upperLatitude: view.getFloat64(offset + 88, isLittleEndian),
      lowerLongitude: view.getFloat64(offset + 104, isLittleEndian),
      upperLongitude: view.getFloat64(offset + 120, isLittleEndian),
      latitudeInterval: view.getFloat64(offset + 136, isLittleEndian),
      longitudeInterval: view.getFloat64(offset + 152, isLittleEndian),
      gridNodeCount: view.getInt32(offset + 168, isLittleEndian)
    };
  }

  function readGridNodes(view, offset, gridHeader, isLittleEndian, includeErrorFields) {
    var nodesOffset = offset + 176;
    var gridRecordLength = 16;

    if (includeErrorFields === false) {
      gridRecordLength = 8;
    }

    var gridShiftRecords = [];
    for (var i = 0; i < gridHeader.gridNodeCount; i++) {
      var record = {
        latitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength, isLittleEndian),
        longitudeShift: view.getFloat32(nodesOffset + i * gridRecordLength + 4, isLittleEndian)

      };

      if (includeErrorFields !== false) {
        record.latitudeAccuracy = view.getFloat32(nodesOffset + i * gridRecordLength + 8, isLittleEndian);
        record.longitudeAccuracy = view.getFloat32(nodesOffset + i * gridRecordLength + 12, isLittleEndian);
      }

      gridShiftRecords.push(record);
    }
    return gridShiftRecords;
  }

  function Projection(srsCode, callback) {
    if (!(this instanceof Projection)) {
      return new Projection(srsCode);
    }
    callback = callback || function (error) {
      if (error) {
        throw error;
      }
    };
    var json = parse(srsCode);
    if (typeof json !== 'object') {
      callback('Could not parse to valid json: ' + srsCode);
      return;
    }
    var ourProj = Projection.projections.get(json.projName);
    if (!ourProj) {
      callback('Could not get projection name from: ' + srsCode);
      return;
    }
    if (json.datumCode && json.datumCode !== 'none') {
      var datumDef = match(datums, json.datumCode);
      if (datumDef) {
        json.datum_params = json.datum_params || (datumDef.towgs84 ? datumDef.towgs84.split(',') : null);
        json.ellps = datumDef.ellipse;
        json.datumName = datumDef.datumName ? datumDef.datumName : json.datumCode;
      }
    }
    json.k0 = json.k0 || 1.0;
    json.axis = json.axis || 'enu';
    json.ellps = json.ellps || 'wgs84';
    json.lat1 = json.lat1 || json.lat0; // Lambert_Conformal_Conic_1SP, for example, needs this

    var sphere_ = sphere(json.a, json.b, json.rf, json.ellps, json.sphere);
    var ecc = eccentricity(sphere_.a, sphere_.b, sphere_.rf, json.R_A);
    var nadgrids = getNadgrids(json.nadgrids);
    var datumObj = json.datum || datum(json.datumCode, json.datum_params, sphere_.a, sphere_.b, ecc.es, ecc.ep2,
      nadgrids);

    extend(this, json); // transfer everything over from the projection because we don't know what we'll need
    extend(this, ourProj); // transfer all the methods from the projection

    // copy the 4 things over we calculated in deriveConstants.sphere
    this.a = sphere_.a;
    this.b = sphere_.b;
    this.rf = sphere_.rf;
    this.sphere = sphere_.sphere;

    // copy the 3 things we calculated in deriveConstants.eccentricity
    this.es = ecc.es;
    this.e = ecc.e;
    this.ep2 = ecc.ep2;

    // add in the datum object
    this.datum = datumObj;

    // init the projection
    this.init();

    // legecy callback from back in the day when it went to spatialreference.org
    callback(null, this);
  }
  Projection.projections = projections;
  Projection.projections.start();

  function compareDatums(source, dest) {
    if (source.datum_type !== dest.datum_type) {
      return false; // false, datums are not equal
    } else if (source.a !== dest.a || Math.abs(source.es - dest.es) > 0.000000000050) {
      // the tolerance for es is to ensure that GRS80 and WGS84
      // are considered identical
      return false;
    } else if (source.datum_type === PJD_3PARAM) {
      return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2]);
    } else if (source.datum_type === PJD_7PARAM) {
      return (source.datum_params[0] === dest.datum_params[0] && source.datum_params[1] === dest.datum_params[1] && source.datum_params[2] === dest.datum_params[2] && source.datum_params[3] === dest.datum_params[3] && source.datum_params[4] === dest.datum_params[4] && source.datum_params[5] === dest.datum_params[5] && source.datum_params[6] === dest.datum_params[6]);
    } else {
      return true; // datums are equal
    }
  } // cs_compare_datums()

  /*
   * The function Convert_Geodetic_To_Geocentric converts geodetic coordinates
   * (latitude, longitude, and height) to geocentric coordinates (X, Y, Z),
   * according to the current ellipsoid parameters.
   *
   *    Latitude  : Geodetic latitude in radians                     (input)
   *    Longitude : Geodetic longitude in radians                    (input)
   *    Height    : Geodetic height, in meters                       (input)
   *    X         : Calculated Geocentric X coordinate, in meters    (output)
   *    Y         : Calculated Geocentric Y coordinate, in meters    (output)
   *    Z         : Calculated Geocentric Z coordinate, in meters    (output)
   *
   */
  function geodeticToGeocentric(p, es, a) {
    var Longitude = p.x;
    var Latitude = p.y;
    var Height = p.z ? p.z : 0; // Z value not always supplied

    var Rn; /*  Earth radius at location  */
    var Sin_Lat; /*  Math.sin(Latitude)  */
    var Sin2_Lat; /*  Square of Math.sin(Latitude)  */
    var Cos_Lat; /*  Math.cos(Latitude)  */

    /*
     ** Don't blow up if Latitude is just a little out of the value
     ** range as it may just be a rounding issue.  Also removed longitude
     ** test, it should be wrapped by Math.cos() and Math.sin().  NFW for PROJ.4, Sep/2001.
     */
    if (Latitude < -HALF_PI && Latitude > -1.001 * HALF_PI) {
      Latitude = -HALF_PI;
    } else if (Latitude > HALF_PI && Latitude < 1.001 * HALF_PI) {
      Latitude = HALF_PI;
    } else if (Latitude < -HALF_PI) {
      /* Latitude out of range */
      // ..reportError('geocent:lat out of range:' + Latitude);
      return { x: -Infinity, y: -Infinity, z: p.z };
    } else if (Latitude > HALF_PI) {
      /* Latitude out of range */
      return { x: Infinity, y: Infinity, z: p.z };
    }

    if (Longitude > Math.PI) {
      Longitude -= (2 * Math.PI);
    }
    Sin_Lat = Math.sin(Latitude);
    Cos_Lat = Math.cos(Latitude);
    Sin2_Lat = Sin_Lat * Sin_Lat;
    Rn = a / (Math.sqrt(1.0e0 - es * Sin2_Lat));
    return {
      x: (Rn + Height) * Cos_Lat * Math.cos(Longitude),
      y: (Rn + Height) * Cos_Lat * Math.sin(Longitude),
      z: ((Rn * (1 - es)) + Height) * Sin_Lat
    };
  } // cs_geodetic_to_geocentric()

  function geocentricToGeodetic(p, es, a, b) {
    /* local defintions and variables */
    /* end-criterium of loop, accuracy of sin(Latitude) */
    var genau = 1e-12;
    var genau2 = (genau * genau);
    var maxiter = 30;

    var P; /* distance between semi-minor axis and location */
    var RR; /* distance between center and location */
    var CT; /* sin of geocentric latitude */
    var ST; /* cos of geocentric latitude */
    var RX;
    var RK;
    var RN; /* Earth radius at location */
    var CPHI0; /* cos of start or old geodetic latitude in iterations */
    var SPHI0; /* sin of start or old geodetic latitude in iterations */
    var CPHI; /* cos of searched geodetic latitude */
    var SPHI; /* sin of searched geodetic latitude */
    var SDPHI; /* end-criterium: addition-theorem of sin(Latitude(iter)-Latitude(iter-1)) */
    var iter; /* # of continous iteration, max. 30 is always enough (s.a.) */

    var X = p.x;
    var Y = p.y;
    var Z = p.z ? p.z : 0.0; // Z value not always supplied
    var Longitude;
    var Latitude;
    var Height;

    P = Math.sqrt(X * X + Y * Y);
    RR = Math.sqrt(X * X + Y * Y + Z * Z);

    /*      special cases for latitude and longitude */
    if (P / a < genau) {
      /*  special case, if P=0. (X=0., Y=0.) */
      Longitude = 0.0;

      /*  if (X,Y,Z)=(0.,0.,0.) then Height becomes semi-minor axis
       *  of ellipsoid (=center of mass), Latitude becomes PI/2 */
      if (RR / a < genau) {
        Latitude = HALF_PI;
        Height = -b;
        return {
          x: p.x,
          y: p.y,
          z: p.z
        };
      }
    } else {
      /*  ellipsoidal (geodetic) longitude
       *  interval: -PI < Longitude <= +PI */
      Longitude = Math.atan2(Y, X);
    }

    /* --------------------------------------------------------------
     * Following iterative algorithm was developped by
     * "Institut for Erdmessung", University of Hannover, July 1988.
     * Internet: www.ife.uni-hannover.de
     * Iterative computation of CPHI,SPHI and Height.
     * Iteration of CPHI and SPHI to 10**-12 radian resp.
     * 2*10**-7 arcsec.
     * --------------------------------------------------------------
     */
    CT = Z / RR;
    ST = P / RR;
    RX = 1.0 / Math.sqrt(1.0 - es * (2.0 - es) * ST * ST);
    CPHI0 = ST * (1.0 - es) * RX;
    SPHI0 = CT * RX;
    iter = 0;

    /* loop to find sin(Latitude) resp. Latitude
     * until |sin(Latitude(iter)-Latitude(iter-1))| < genau */
    do {
      iter++;
      RN = a / Math.sqrt(1.0 - es * SPHI0 * SPHI0);

      /*  ellipsoidal (geodetic) height */
      Height = P * CPHI0 + Z * SPHI0 - RN * (1.0 - es * SPHI0 * SPHI0);

      RK = es * RN / (RN + Height);
      RX = 1.0 / Math.sqrt(1.0 - RK * (2.0 - RK) * ST * ST);
      CPHI = ST * (1.0 - RK) * RX;
      SPHI = CT * RX;
      SDPHI = SPHI * CPHI0 - CPHI * SPHI0;
      CPHI0 = CPHI;
      SPHI0 = SPHI;
    }
    while (SDPHI * SDPHI > genau2 && iter < maxiter);

    /*      ellipsoidal (geodetic) latitude */
    Latitude = Math.atan(SPHI / Math.abs(CPHI));
    return {
      x: Longitude,
      y: Latitude,
      z: Height
    };
  } // cs_geocentric_to_geodetic()

  /****************************************************************/
  // pj_geocentic_to_wgs84( p )
  //  p = point to transform in geocentric coordinates (x,y,z)

  /** point object, nothing fancy, just allows values to be
      passed back and forth by reference rather than by value.
      Other point classes may be used as long as they have
      x and y properties, which will get modified in the transform method.
  */
  function geocentricToWgs84(p, datum_type, datum_params) {
    if (datum_type === PJD_3PARAM) {
      // if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: p.x + datum_params[0],
        y: p.y + datum_params[1],
        z: p.z + datum_params[2]
      };
    } else if (datum_type === PJD_7PARAM) {
      var Dx_BF = datum_params[0];
      var Dy_BF = datum_params[1];
      var Dz_BF = datum_params[2];
      var Rx_BF = datum_params[3];
      var Ry_BF = datum_params[4];
      var Rz_BF = datum_params[5];
      var M_BF = datum_params[6];
      // if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: M_BF * (p.x - Rz_BF * p.y + Ry_BF * p.z) + Dx_BF,
        y: M_BF * (Rz_BF * p.x + p.y - Rx_BF * p.z) + Dy_BF,
        z: M_BF * (-Ry_BF * p.x + Rx_BF * p.y + p.z) + Dz_BF
      };
    }
  } // cs_geocentric_to_wgs84

  /****************************************************************/
  // pj_geocentic_from_wgs84()
  //  coordinate system definition,
  //  point to transform in geocentric coordinates (x,y,z)
  function geocentricFromWgs84(p, datum_type, datum_params) {
    if (datum_type === PJD_3PARAM) {
      // if( x[io] === HUGE_VAL )
      //    continue;
      return {
        x: p.x - datum_params[0],
        y: p.y - datum_params[1],
        z: p.z - datum_params[2]
      };
    } else if (datum_type === PJD_7PARAM) {
      var Dx_BF = datum_params[0];
      var Dy_BF = datum_params[1];
      var Dz_BF = datum_params[2];
      var Rx_BF = datum_params[3];
      var Ry_BF = datum_params[4];
      var Rz_BF = datum_params[5];
      var M_BF = datum_params[6];
      var x_tmp = (p.x - Dx_BF) / M_BF;
      var y_tmp = (p.y - Dy_BF) / M_BF;
      var z_tmp = (p.z - Dz_BF) / M_BF;
      // if( x[io] === HUGE_VAL )
      //    continue;

      return {
        x: x_tmp + Rz_BF * y_tmp - Ry_BF * z_tmp,
        y: -Rz_BF * x_tmp + y_tmp + Rx_BF * z_tmp,
        z: Ry_BF * x_tmp - Rx_BF * y_tmp + z_tmp
      };
    } // cs_geocentric_from_wgs84()
  }

  function checkParams(type) {
    return (type === PJD_3PARAM || type === PJD_7PARAM);
  }

  function datum_transform (source, dest, point) {
    // Short cut if the datums are identical.
    if (compareDatums(source, dest)) {
      return point; // in this case, zero is sucess,
      // whereas cs_compare_datums returns 1 to indicate TRUE
      // confusing, should fix this
    }

    // Explicitly skip datum transform by setting 'datum=none' as parameter for either source or dest
    if (source.datum_type === PJD_NODATUM || dest.datum_type === PJD_NODATUM) {
      return point;
    }

    // If this datum requires grid shifts, then apply it to geodetic coordinates.
    var source_a = source.a;
    var source_es = source.es;
    if (source.datum_type === PJD_GRIDSHIFT) {
      var gridShiftCode = applyGridShift(source, false, point);
      if (gridShiftCode !== 0) {
        return undefined;
      }
      source_a = SRS_WGS84_SEMIMAJOR;
      source_es = SRS_WGS84_ESQUARED;
    }

    var dest_a = dest.a;
    var dest_b = dest.b;
    var dest_es = dest.es;
    if (dest.datum_type === PJD_GRIDSHIFT) {
      dest_a = SRS_WGS84_SEMIMAJOR;
      dest_b = SRS_WGS84_SEMIMINOR;
      dest_es = SRS_WGS84_ESQUARED;
    }

    // Do we need to go through geocentric coordinates?
    if (source_es === dest_es && source_a === dest_a && !checkParams(source.datum_type) && !checkParams(dest.datum_type)) {
      return point;
    }

    // Convert to geocentric coordinates.
    point = geodeticToGeocentric(point, source_es, source_a);
    // Convert between datums
    if (checkParams(source.datum_type)) {
      point = geocentricToWgs84(point, source.datum_type, source.datum_params);
    }
    if (checkParams(dest.datum_type)) {
      point = geocentricFromWgs84(point, dest.datum_type, dest.datum_params);
    }
    point = geocentricToGeodetic(point, dest_es, dest_a, dest_b);

    if (dest.datum_type === PJD_GRIDSHIFT) {
      var destGridShiftResult = applyGridShift(dest, true, point);
      if (destGridShiftResult !== 0) {
        return undefined;
      }
    }

    return point;
  }

  function applyGridShift(source, inverse, point) {
    if (source.grids === null || source.grids.length === 0) {
      console.log('Grid shift grids not found');
      return -1;
    }
    var input = { x: -point.x, y: point.y };
    var output = { x: Number.NaN, y: Number.NaN };
    var attemptedGrids = [];
    outer:
    for (var i = 0; i < source.grids.length; i++) {
      var grid = source.grids[i];
      attemptedGrids.push(grid.name);
      if (grid.isNull) {
        output = input;
        break;
      }
      if (grid.grid === null) {
        if (grid.mandatory) {
          console.log('Unable to find mandatory grid \'' + grid.name + '\'');
          return -1;
        }
        continue;
      }
      var subgrids = grid.grid.subgrids;
      for (var j = 0, jj = subgrids.length; j < jj; j++) {
        var subgrid = subgrids[j];
        // skip tables that don't match our point at all
        var epsilon = (Math.abs(subgrid.del[1]) + Math.abs(subgrid.del[0])) / 10000.0;
        var minX = subgrid.ll[0] - epsilon;
        var minY = subgrid.ll[1] - epsilon;
        var maxX = subgrid.ll[0] + (subgrid.lim[0] - 1) * subgrid.del[0] + epsilon;
        var maxY = subgrid.ll[1] + (subgrid.lim[1] - 1) * subgrid.del[1] + epsilon;
        if (minY > input.y || minX > input.x || maxY < input.y || maxX < input.x) {
          continue;
        }
        output = applySubgridShift(input, inverse, subgrid);
        if (!isNaN(output.x)) {
          break outer;
        }
      }
    }
    if (isNaN(output.x)) {
      console.log('Failed to find a grid shift table for location \''
        + -input.x * R2D + ' ' + input.y * R2D + ' tried: \'' + attemptedGrids + '\'');
      return -1;
    }
    point.x = -output.x;
    point.y = output.y;
    return 0;
  }

  function applySubgridShift(pin, inverse, ct) {
    var val = { x: Number.NaN, y: Number.NaN };
    if (isNaN(pin.x)) {
      return val;
    }
    var tb = { x: pin.x, y: pin.y };
    tb.x -= ct.ll[0];
    tb.y -= ct.ll[1];
    tb.x = adjust_lon(tb.x - Math.PI) + Math.PI;
    var t = nadInterpolate(tb, ct);
    if (inverse) {
      if (isNaN(t.x)) {
        return val;
      }
      t.x = tb.x - t.x;
      t.y = tb.y - t.y;
      var i = 9, tol = 1e-12;
      var dif, del;
      do {
        del = nadInterpolate(t, ct);
        if (isNaN(del.x)) {
          console.log('Inverse grid shift iteration failed, presumably at grid edge.  Using first approximation.');
          break;
        }
        dif = { x: tb.x - (del.x + t.x), y: tb.y - (del.y + t.y) };
        t.x += dif.x;
        t.y += dif.y;
      } while (i-- && Math.abs(dif.x) > tol && Math.abs(dif.y) > tol);
      if (i < 0) {
        console.log('Inverse grid shift iterator failed to converge.');
        return val;
      }
      val.x = adjust_lon(t.x + ct.ll[0]);
      val.y = t.y + ct.ll[1];
    } else {
      if (!isNaN(t.x)) {
        val.x = pin.x + t.x;
        val.y = pin.y + t.y;
      }
    }
    return val;
  }

  function nadInterpolate(pin, ct) {
    var t = { x: pin.x / ct.del[0], y: pin.y / ct.del[1] };
    var indx = { x: Math.floor(t.x), y: Math.floor(t.y) };
    var frct = { x: t.x - 1.0 * indx.x, y: t.y - 1.0 * indx.y };
    var val = { x: Number.NaN, y: Number.NaN };
    var inx;
    if (indx.x < 0 || indx.x >= ct.lim[0]) {
      return val;
    }
    if (indx.y < 0 || indx.y >= ct.lim[1]) {
      return val;
    }
    inx = (indx.y * ct.lim[0]) + indx.x;
    var f00 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
    inx++;
    var f10 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
    inx += ct.lim[0];
    var f11 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
    inx--;
    var f01 = { x: ct.cvs[inx][0], y: ct.cvs[inx][1] };
    var m11 = frct.x * frct.y, m10 = frct.x * (1.0 - frct.y),
      m00 = (1.0 - frct.x) * (1.0 - frct.y), m01 = (1.0 - frct.x) * frct.y;
    val.x = (m00 * f00.x + m10 * f10.x + m01 * f01.x + m11 * f11.x);
    val.y = (m00 * f00.y + m10 * f10.y + m01 * f01.y + m11 * f11.y);
    return val;
  }

  function adjust_axis (crs, denorm, point) {
    var xin = point.x,
      yin = point.y,
      zin = point.z || 0.0;
    var v, t, i;
    var out = {};
    for (i = 0; i < 3; i++) {
      if (denorm && i === 2 && point.z === undefined) {
        continue;
      }
      if (i === 0) {
        v = xin;
        if ('ew'.indexOf(crs.axis[i]) !== -1) {
          t = 'x';
        } else {
          t = 'y';
        }
      } else if (i === 1) {
        v = yin;
        if ('ns'.indexOf(crs.axis[i]) !== -1) {
          t = 'y';
        } else {
          t = 'x';
        }
      } else {
        v = zin;
        t = 'z';
      }
      switch (crs.axis[i]) {
        case 'e':
          out[t] = v;
          break;
        case 'w':
          out[t] = -v;
          break;
        case 'n':
          out[t] = v;
          break;
        case 's':
          out[t] = -v;
          break;
        case 'u':
          if (point[t] !== undefined) {
            out.z = v;
          }
          break;
        case 'd':
          if (point[t] !== undefined) {
            out.z = -v;
          }
          break;
        default:
        // console.log("ERROR: unknow axis ("+crs.axis[i]+") - check definition of "+crs.projName);
          return null;
      }
    }
    return out;
  }

  function common (array) {
    var out = {
      x: array[0],
      y: array[1]
    };
    if (array.length > 2) {
      out.z = array[2];
    }
    if (array.length > 3) {
      out.m = array[3];
    }
    return out;
  }

  function checkSanity (point) {
    checkCoord(point.x);
    checkCoord(point.y);
  }
  function checkCoord(num) {
    if (typeof Number.isFinite === 'function') {
      if (Number.isFinite(num)) {
        return;
      }
      throw new TypeError('coordinates must be finite numbers');
    }
    if (typeof num !== 'number' || num !== num || !isFinite(num)) {
      throw new TypeError('coordinates must be finite numbers');
    }
  }

  function checkNotWGS(source, dest) {
    return (
      (source.datum.datum_type === PJD_3PARAM || source.datum.datum_type === PJD_7PARAM || source.datum.datum_type === PJD_GRIDSHIFT) && dest.datumCode !== 'WGS84')
    || ((dest.datum.datum_type === PJD_3PARAM || dest.datum.datum_type === PJD_7PARAM || dest.datum.datum_type === PJD_GRIDSHIFT) && source.datumCode !== 'WGS84');
  }

  function transform(source, dest, point, enforceAxis) {
    var wgs84;
    if (Array.isArray(point)) {
      point = common(point);
    } else {
      // Clone the point object so inputs don't get modified
      point = {
        x: point.x,
        y: point.y,
        z: point.z,
        m: point.m
      };
    }
    var hasZ = point.z !== undefined;
    checkSanity(point);
    // Workaround for datum shifts towgs84, if either source or destination projection is not wgs84
    if (source.datum && dest.datum && checkNotWGS(source, dest)) {
      wgs84 = new Projection('WGS84');
      point = transform(source, wgs84, point, enforceAxis);
      source = wgs84;
    }
    // DGR, 2010/11/12
    if (enforceAxis && source.axis !== 'enu') {
      point = adjust_axis(source, false, point);
    }
    // Transform source points to long/lat, if they aren't already.
    if (source.projName === 'longlat') {
      point = {
        x: point.x * D2R$1,
        y: point.y * D2R$1,
        z: point.z || 0
      };
    } else {
      if (source.to_meter) {
        point = {
          x: point.x * source.to_meter,
          y: point.y * source.to_meter,
          z: point.z || 0
        };
      }
      point = source.inverse(point); // Convert Cartesian to longlat
      if (!point) {
        return;
      }
    }
    // Adjust for the prime meridian if necessary
    if (source.from_greenwich) {
      point.x += source.from_greenwich;
    }

    // Convert datums if needed, and if possible.
    point = datum_transform(source.datum, dest.datum, point);
    if (!point) {
      return;
    }

    // Adjust for the prime meridian if necessary
    if (dest.from_greenwich) {
      point = {
        x: point.x - dest.from_greenwich,
        y: point.y,
        z: point.z || 0
      };
    }

    if (dest.projName === 'longlat') {
      // convert radians to decimal degrees
      point = {
        x: point.x * R2D,
        y: point.y * R2D,
        z: point.z || 0
      };
    } else { // else project
      point = dest.forward(point);
      if (dest.to_meter) {
        point = {
          x: point.x / dest.to_meter,
          y: point.y / dest.to_meter,
          z: point.z || 0
        };
      }
    }

    // DGR, 2010/11/12
    if (enforceAxis && dest.axis !== 'enu') {
      return adjust_axis(dest, true, point);
    }

    if (point && !hasZ) {
      delete point.z;
    }
    return point;
  }

  var wgs84 = Projection('WGS84');

  function transformer(from, to, coords, enforceAxis) {
    var transformedArray, out, keys;
    if (Array.isArray(coords)) {
      transformedArray = transform(from, to, coords, enforceAxis) || { x: NaN, y: NaN };
      if (coords.length > 2) {
        if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
          if (typeof transformedArray.z === 'number') {
            return [transformedArray.x, transformedArray.y, transformedArray.z].concat(coords.slice(3));
          } else {
            return [transformedArray.x, transformedArray.y, coords[2]].concat(coords.slice(3));
          }
        } else {
          return [transformedArray.x, transformedArray.y].concat(coords.slice(2));
        }
      } else {
        return [transformedArray.x, transformedArray.y];
      }
    } else {
      out = transform(from, to, coords, enforceAxis);
      keys = Object.keys(coords);
      if (keys.length === 2) {
        return out;
      }
      keys.forEach(function (key) {
        if ((typeof from.name !== 'undefined' && from.name === 'geocent') || (typeof to.name !== 'undefined' && to.name === 'geocent')) {
          if (key === 'x' || key === 'y' || key === 'z') {
            return;
          }
        } else {
          if (key === 'x' || key === 'y') {
            return;
          }
        }
        out[key] = coords[key];
      });
      return out;
    }
  }

  function checkProj(item) {
    if (item instanceof Projection) {
      return item;
    }
    if (item.oProj) {
      return item.oProj;
    }
    return Projection(item);
  }

  function proj4(fromProj, toProj, coord) {
    fromProj = checkProj(fromProj);
    var single = false;
    var obj;
    if (typeof toProj === 'undefined') {
      toProj = fromProj;
      fromProj = wgs84;
      single = true;
    } else if (typeof toProj.x !== 'undefined' || Array.isArray(toProj)) {
      coord = toProj;
      toProj = fromProj;
      fromProj = wgs84;
      single = true;
    }
    toProj = checkProj(toProj);
    if (coord) {
      return transformer(fromProj, toProj, coord);
    } else {
      obj = {
        forward: function (coords, enforceAxis) {
          return transformer(fromProj, toProj, coords, enforceAxis);
        },
        inverse: function (coords, enforceAxis) {
          return transformer(toProj, fromProj, coords, enforceAxis);
        }
      };
      if (single) {
        obj.oProj = toProj;
      }
      return obj;
    }
  }

  /**
   * UTM zones are grouped, and assigned to one of a group of 6
   * sets.
   *
   * {int} @private
   */
  var NUM_100K_SETS = 6;

  /**
   * The column letters (for easting) of the lower left value, per
   * set.
   *
   * {string} @private
   */
  var SET_ORIGIN_COLUMN_LETTERS = 'AJSAJS';

  /**
   * The row letters (for northing) of the lower left value, per
   * set.
   *
   * {string} @private
   */
  var SET_ORIGIN_ROW_LETTERS = 'AFAFAF';

  var A = 65; // A
  var I = 73; // I
  var O = 79; // O
  var V = 86; // V
  var Z = 90; // Z
  var mgrs = {
    forward: forward$u,
    inverse: inverse$u,
    toPoint: toPoint
  };
  /**
   * Conversion of lat/lon to MGRS.
   *
   * @param {object} ll Object literal with lat and lon properties on a
   *     WGS84 ellipsoid.
   * @param {int} accuracy Accuracy in digits (5 for 1 m, 4 for 10 m, 3 for
   *      100 m, 2 for 1000 m or 1 for 10000 m). Optional, default is 5.
   * @return {string} the MGRS string for the given location and accuracy.
   */
  function forward$u(ll, accuracy) {
    accuracy = accuracy || 5; // default accuracy 1m
    return encode(LLtoUTM({
      lat: ll[1],
      lon: ll[0]
    }), accuracy);
  }
  /**
   * Conversion of MGRS to lat/lon.
   *
   * @param {string} mgrs MGRS string.
   * @return {array} An array with left (longitude), bottom (latitude), right
   *     (longitude) and top (latitude) values in WGS84, representing the
   *     bounding box for the provided MGRS reference.
   */
  function inverse$u(mgrs) {
    var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
    if (bbox.lat && bbox.lon) {
      return [bbox.lon, bbox.lat, bbox.lon, bbox.lat];
    }
    return [bbox.left, bbox.bottom, bbox.right, bbox.top];
  }
  function toPoint(mgrs) {
    var bbox = UTMtoLL(decode(mgrs.toUpperCase()));
    if (bbox.lat && bbox.lon) {
      return [bbox.lon, bbox.lat];
    }
    return [(bbox.left + bbox.right) / 2, (bbox.top + bbox.bottom) / 2];
  }/**
   * Conversion from degrees to radians.
   *
   * @private
   * @param {number} deg the angle in degrees.
   * @return {number} the angle in radians.
   */
  function degToRad(deg) {
    return (deg * (Math.PI / 180.0));
  }

  /**
   * Conversion from radians to degrees.
   *
   * @private
   * @param {number} rad the angle in radians.
   * @return {number} the angle in degrees.
   */
  function radToDeg(rad) {
    return (180.0 * (rad / Math.PI));
  }

  /**
   * Converts a set of Longitude and Latitude co-ordinates to UTM
   * using the WGS84 ellipsoid.
   *
   * @private
   * @param {object} ll Object literal with lat and lon properties
   *     representing the WGS84 coordinate to be converted.
   * @return {object} Object literal containing the UTM value with easting,
   *     northing, zoneNumber and zoneLetter properties, and an optional
   *     accuracy property in digits. Returns null if the conversion failed.
   */
  function LLtoUTM(ll) {
    var Lat = ll.lat;
    var Long = ll.lon;
    var a = 6378137.0; //ellip.radius;
    var eccSquared = 0.00669438; //ellip.eccsq;
    var k0 = 0.9996;
    var LongOrigin;
    var eccPrimeSquared;
    var N, T, C, A, M;
    var LatRad = degToRad(Lat);
    var LongRad = degToRad(Long);
    var LongOriginRad;
    var ZoneNumber;
    // (int)
    ZoneNumber = Math.floor((Long + 180) / 6) + 1;

    //Make sure the longitude 180.00 is in Zone 60
    if (Long === 180) {
      ZoneNumber = 60;
    }

    // Special zone for Norway
    if (Lat >= 56.0 && Lat < 64.0 && Long >= 3.0 && Long < 12.0) {
      ZoneNumber = 32;
    }

    // Special zones for Svalbard
    if (Lat >= 72.0 && Lat < 84.0) {
      if (Long >= 0.0 && Long < 9.0) {
        ZoneNumber = 31;
      }
      else if (Long >= 9.0 && Long < 21.0) {
        ZoneNumber = 33;
      }
      else if (Long >= 21.0 && Long < 33.0) {
        ZoneNumber = 35;
      }
      else if (Long >= 33.0 && Long < 42.0) {
        ZoneNumber = 37;
      }
    }

    LongOrigin = (ZoneNumber - 1) * 6 - 180 + 3; //+3 puts origin
    // in middle of
    // zone
    LongOriginRad = degToRad(LongOrigin);

    eccPrimeSquared = (eccSquared) / (1 - eccSquared);

    N = a / Math.sqrt(1 - eccSquared * Math.sin(LatRad) * Math.sin(LatRad));
    T = Math.tan(LatRad) * Math.tan(LatRad);
    C = eccPrimeSquared * Math.cos(LatRad) * Math.cos(LatRad);
    A = Math.cos(LatRad) * (LongRad - LongOriginRad);

    M = a * ((1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256) * LatRad - (3 * eccSquared / 8 + 3 * eccSquared * eccSquared / 32 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(2 * LatRad) + (15 * eccSquared * eccSquared / 256 + 45 * eccSquared * eccSquared * eccSquared / 1024) * Math.sin(4 * LatRad) - (35 * eccSquared * eccSquared * eccSquared / 3072) * Math.sin(6 * LatRad));

    var UTMEasting = (k0 * N * (A + (1 - T + C) * A * A * A / 6.0 + (5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * A * A * A * A * A / 120.0) + 500000.0);

    var UTMNorthing = (k0 * (M + N * Math.tan(LatRad) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A * A * A * A / 24.0 + (61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * A * A * A * A * A * A / 720.0)));
    if (Lat < 0.0) {
      UTMNorthing += 10000000.0; //10000000 meter offset for
      // southern hemisphere
    }

    return {
      northing: Math.round(UTMNorthing),
      easting: Math.round(UTMEasting),
      zoneNumber: ZoneNumber,
      zoneLetter: getLetterDesignator(Lat)
    };
  }

  /**
   * Converts UTM coords to lat/long, using the WGS84 ellipsoid. This is a convenience
   * class where the Zone can be specified as a single string eg."60N" which
   * is then broken down into the ZoneNumber and ZoneLetter.
   *
   * @private
   * @param {object} utm An object literal with northing, easting, zoneNumber
   *     and zoneLetter properties. If an optional accuracy property is
   *     provided (in meters), a bounding box will be returned instead of
   *     latitude and longitude.
   * @return {object} An object literal containing either lat and lon values
   *     (if no accuracy was provided), or top, right, bottom and left values
   *     for the bounding box calculated according to the provided accuracy.
   *     Returns null if the conversion failed.
   */
  function UTMtoLL(utm) {

    var UTMNorthing = utm.northing;
    var UTMEasting = utm.easting;
    var zoneLetter = utm.zoneLetter;
    var zoneNumber = utm.zoneNumber;
    // check the ZoneNummber is valid
    if (zoneNumber < 0 || zoneNumber > 60) {
      return null;
    }

    var k0 = 0.9996;
    var a = 6378137.0; //ellip.radius;
    var eccSquared = 0.00669438; //ellip.eccsq;
    var eccPrimeSquared;
    var e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
    var N1, T1, C1, R1, D, M;
    var LongOrigin;
    var mu, phi1Rad;

    // remove 500,000 meter offset for longitude
    var x = UTMEasting - 500000.0;
    var y = UTMNorthing;

    // We must know somehow if we are in the Northern or Southern
    // hemisphere, this is the only time we use the letter So even
    // if the Zone letter isn't exactly correct it should indicate
    // the hemisphere correctly
    if (zoneLetter < 'N') {
      y -= 10000000.0; // remove 10,000,000 meter offset used
      // for southern hemisphere
    }

    // There are 60 zones with zone 1 being at West -180 to -174
    LongOrigin = (zoneNumber - 1) * 6 - 180 + 3; // +3 puts origin
    // in middle of
    // zone

    eccPrimeSquared = (eccSquared) / (1 - eccSquared);

    M = y / k0;
    mu = M / (a * (1 - eccSquared / 4 - 3 * eccSquared * eccSquared / 64 - 5 * eccSquared * eccSquared * eccSquared / 256));

    phi1Rad = mu + (3 * e1 / 2 - 27 * e1 * e1 * e1 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 * e1 * e1 * e1 / 32) * Math.sin(4 * mu) + (151 * e1 * e1 * e1 / 96) * Math.sin(6 * mu);
    // double phi1 = ProjMath.radToDeg(phi1Rad);

    N1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad));
    T1 = Math.tan(phi1Rad) * Math.tan(phi1Rad);
    C1 = eccPrimeSquared * Math.cos(phi1Rad) * Math.cos(phi1Rad);
    R1 = a * (1 - eccSquared) / Math.pow(1 - eccSquared * Math.sin(phi1Rad) * Math.sin(phi1Rad), 1.5);
    D = x / (N1 * k0);

    var lat = phi1Rad - (N1 * Math.tan(phi1Rad) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * eccPrimeSquared) * D * D * D * D / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * eccPrimeSquared - 3 * C1 * C1) * D * D * D * D * D * D / 720);
    lat = radToDeg(lat);

    var lon = (D - (1 + 2 * T1 + C1) * D * D * D / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * eccPrimeSquared + 24 * T1 * T1) * D * D * D * D * D / 120) / Math.cos(phi1Rad);
    lon = LongOrigin + radToDeg(lon);

    var result;
    if (utm.accuracy) {
      var topRight = UTMtoLL({
        northing: utm.northing + utm.accuracy,
        easting: utm.easting + utm.accuracy,
        zoneLetter: utm.zoneLetter,
        zoneNumber: utm.zoneNumber
      });
      result = {
        top: topRight.lat,
        right: topRight.lon,
        bottom: lat,
        left: lon
      };
    }
    else {
      result = {
        lat: lat,
        lon: lon
      };
    }
    return result;
  }

  /**
   * Calculates the MGRS letter designator for the given latitude.
   *
   * @private
   * @param {number} lat The latitude in WGS84 to get the letter designator
   *     for.
   * @return {char} The letter designator.
   */
  function getLetterDesignator(lat) {
    //This is here as an error flag to show that the Latitude is
    //outside MGRS limits
    var LetterDesignator = 'Z';

    if ((84 >= lat) && (lat >= 72)) {
      LetterDesignator = 'X';
    }
    else if ((72 > lat) && (lat >= 64)) {
      LetterDesignator = 'W';
    }
    else if ((64 > lat) && (lat >= 56)) {
      LetterDesignator = 'V';
    }
    else if ((56 > lat) && (lat >= 48)) {
      LetterDesignator = 'U';
    }
    else if ((48 > lat) && (lat >= 40)) {
      LetterDesignator = 'T';
    }
    else if ((40 > lat) && (lat >= 32)) {
      LetterDesignator = 'S';
    }
    else if ((32 > lat) && (lat >= 24)) {
      LetterDesignator = 'R';
    }
    else if ((24 > lat) && (lat >= 16)) {
      LetterDesignator = 'Q';
    }
    else if ((16 > lat) && (lat >= 8)) {
      LetterDesignator = 'P';
    }
    else if ((8 > lat) && (lat >= 0)) {
      LetterDesignator = 'N';
    }
    else if ((0 > lat) && (lat >= -8)) {
      LetterDesignator = 'M';
    }
    else if ((-8 > lat) && (lat >= -16)) {
      LetterDesignator = 'L';
    }
    else if ((-16 > lat) && (lat >= -24)) {
      LetterDesignator = 'K';
    }
    else if ((-24 > lat) && (lat >= -32)) {
      LetterDesignator = 'J';
    }
    else if ((-32 > lat) && (lat >= -40)) {
      LetterDesignator = 'H';
    }
    else if ((-40 > lat) && (lat >= -48)) {
      LetterDesignator = 'G';
    }
    else if ((-48 > lat) && (lat >= -56)) {
      LetterDesignator = 'F';
    }
    else if ((-56 > lat) && (lat >= -64)) {
      LetterDesignator = 'E';
    }
    else if ((-64 > lat) && (lat >= -72)) {
      LetterDesignator = 'D';
    }
    else if ((-72 > lat) && (lat >= -80)) {
      LetterDesignator = 'C';
    }
    return LetterDesignator;
  }

  /**
   * Encodes a UTM location as MGRS string.
   *
   * @private
   * @param {object} utm An object literal with easting, northing,
   *     zoneLetter, zoneNumber
   * @param {number} accuracy Accuracy in digits (1-5).
   * @return {string} MGRS string for the given UTM location.
   */
  function encode(utm, accuracy) {
    // prepend with leading zeroes
    var seasting = "00000" + utm.easting,
      snorthing = "00000" + utm.northing;

    return utm.zoneNumber + utm.zoneLetter + get100kID(utm.easting, utm.northing, utm.zoneNumber) + seasting.substr(seasting.length - 5, accuracy) + snorthing.substr(snorthing.length - 5, accuracy);
  }

  /**
   * Get the two letter 100k designator for a given UTM easting,
   * northing and zone number value.
   *
   * @private
   * @param {number} easting
   * @param {number} northing
   * @param {number} zoneNumber
   * @return the two letter 100k designator for the given UTM location.
   */
  function get100kID(easting, northing, zoneNumber) {
    var setParm = get100kSetForZone(zoneNumber);
    var setColumn = Math.floor(easting / 100000);
    var setRow = Math.floor(northing / 100000) % 20;
    return getLetter100kID(setColumn, setRow, setParm);
  }

  /**
   * Given a UTM zone number, figure out the MGRS 100K set it is in.
   *
   * @private
   * @param {number} i An UTM zone number.
   * @return {number} the 100k set the UTM zone is in.
   */
  function get100kSetForZone(i) {
    var setParm = i % NUM_100K_SETS;
    if (setParm === 0) {
      setParm = NUM_100K_SETS;
    }

    return setParm;
  }

  /**
   * Get the two-letter MGRS 100k designator given information
   * translated from the UTM northing, easting and zone number.
   *
   * @private
   * @param {number} column the column index as it relates to the MGRS
   *        100k set spreadsheet, created from the UTM easting.
   *        Values are 1-8.
   * @param {number} row the row index as it relates to the MGRS 100k set
   *        spreadsheet, created from the UTM northing value. Values
   *        are from 0-19.
   * @param {number} parm the set block, as it relates to the MGRS 100k set
   *        spreadsheet, created from the UTM zone. Values are from
   *        1-60.
   * @return two letter MGRS 100k code.
   */
  function getLetter100kID(column, row, parm) {
    // colOrigin and rowOrigin are the letters at the origin of the set
    var index = parm - 1;
    var colOrigin = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(index);
    var rowOrigin = SET_ORIGIN_ROW_LETTERS.charCodeAt(index);

    // colInt and rowInt are the letters to build to return
    var colInt = colOrigin + column - 1;
    var rowInt = rowOrigin + row;
    var rollover = false;

    if (colInt > Z) {
      colInt = colInt - Z + A - 1;
      rollover = true;
    }

    if (colInt === I || (colOrigin < I && colInt > I) || ((colInt > I || colOrigin < I) && rollover)) {
      colInt++;
    }

    if (colInt === O || (colOrigin < O && colInt > O) || ((colInt > O || colOrigin < O) && rollover)) {
      colInt++;

      if (colInt === I) {
        colInt++;
      }
    }

    if (colInt > Z) {
      colInt = colInt - Z + A - 1;
    }

    if (rowInt > V) {
      rowInt = rowInt - V + A - 1;
      rollover = true;
    }
    else {
      rollover = false;
    }

    if (((rowInt === I) || ((rowOrigin < I) && (rowInt > I))) || (((rowInt > I) || (rowOrigin < I)) && rollover)) {
      rowInt++;
    }

    if (((rowInt === O) || ((rowOrigin < O) && (rowInt > O))) || (((rowInt > O) || (rowOrigin < O)) && rollover)) {
      rowInt++;

      if (rowInt === I) {
        rowInt++;
      }
    }

    if (rowInt > V) {
      rowInt = rowInt - V + A - 1;
    }

    var twoLetter = String.fromCharCode(colInt) + String.fromCharCode(rowInt);
    return twoLetter;
  }

  /**
   * Decode the UTM parameters from a MGRS string.
   *
   * @private
   * @param {string} mgrsString an UPPERCASE coordinate string is expected.
   * @return {object} An object literal with easting, northing, zoneLetter,
   *     zoneNumber and accuracy (in meters) properties.
   */
  function decode(mgrsString) {

    if (mgrsString && mgrsString.length === 0) {
      throw ("MGRSPoint coverting from nothing");
    }

    var length = mgrsString.length;

    var hunK = null;
    var sb = "";
    var testChar;
    var i = 0;

    // get Zone number
    while (!(/[A-Z]/).test(testChar = mgrsString.charAt(i))) {
      if (i >= 2) {
        throw ("MGRSPoint bad conversion from: " + mgrsString);
      }
      sb += testChar;
      i++;
    }

    var zoneNumber = parseInt(sb, 10);

    if (i === 0 || i + 3 > length) {
      // A good MGRS string has to be 4-5 digits long,
      // ##AAA/#AAA at least.
      throw ("MGRSPoint bad conversion from: " + mgrsString);
    }

    var zoneLetter = mgrsString.charAt(i++);

    // Should we check the zone letter here? Why not.
    if (zoneLetter <= 'A' || zoneLetter === 'B' || zoneLetter === 'Y' || zoneLetter >= 'Z' || zoneLetter === 'I' || zoneLetter === 'O') {
      throw ("MGRSPoint zone letter " + zoneLetter + " not handled: " + mgrsString);
    }

    hunK = mgrsString.substring(i, i += 2);

    var set = get100kSetForZone(zoneNumber);

    var east100k = getEastingFromChar(hunK.charAt(0), set);
    var north100k = getNorthingFromChar(hunK.charAt(1), set);

    // We have a bug where the northing may be 2000000 too low.
    // How
    // do we know when to roll over?

    while (north100k < getMinNorthing(zoneLetter)) {
      north100k += 2000000;
    }

    // calculate the char index for easting/northing separator
    var remainder = length - i;

    if (remainder % 2 !== 0) {
      throw ("MGRSPoint has to have an even number \nof digits after the zone letter and two 100km letters - front \nhalf for easting meters, second half for \nnorthing meters" + mgrsString);
    }

    var sep = remainder / 2;

    var sepEasting = 0.0;
    var sepNorthing = 0.0;
    var accuracyBonus, sepEastingString, sepNorthingString, easting, northing;
    if (sep > 0) {
      accuracyBonus = 100000.0 / Math.pow(10, sep);
      sepEastingString = mgrsString.substring(i, i + sep);
      sepEasting = parseFloat(sepEastingString) * accuracyBonus;
      sepNorthingString = mgrsString.substring(i + sep);
      sepNorthing = parseFloat(sepNorthingString) * accuracyBonus;
    }

    easting = sepEasting + east100k;
    northing = sepNorthing + north100k;

    return {
      easting: easting,
      northing: northing,
      zoneLetter: zoneLetter,
      zoneNumber: zoneNumber,
      accuracy: accuracyBonus
    };
  }

  /**
   * Given the first letter from a two-letter MGRS 100k zone, and given the
   * MGRS table set for the zone number, figure out the easting value that
   * should be added to the other, secondary easting value.
   *
   * @private
   * @param {char} e The first letter from a two-letter MGRS 100´k zone.
   * @param {number} set The MGRS table set for the zone number.
   * @return {number} The easting value for the given letter and set.
   */
  function getEastingFromChar(e, set) {
    // colOrigin is the letter at the origin of the set for the
    // column
    var curCol = SET_ORIGIN_COLUMN_LETTERS.charCodeAt(set - 1);
    var eastingValue = 100000.0;
    var rewindMarker = false;

    while (curCol !== e.charCodeAt(0)) {
      curCol++;
      if (curCol === I) {
        curCol++;
      }
      if (curCol === O) {
        curCol++;
      }
      if (curCol > Z) {
        if (rewindMarker) {
          throw ("Bad character: " + e);
        }
        curCol = A;
        rewindMarker = true;
      }
      eastingValue += 100000.0;
    }

    return eastingValue;
  }

  /**
   * Given the second letter from a two-letter MGRS 100k zone, and given the
   * MGRS table set for the zone number, figure out the northing value that
   * should be added to the other, secondary northing value. You have to
   * remember that Northings are determined from the equator, and the vertical
   * cycle of letters mean a 2000000 additional northing meters. This happens
   * approx. every 18 degrees of latitude. This method does *NOT* count any
   * additional northings. You have to figure out how many 2000000 meters need
   * to be added for the zone letter of the MGRS coordinate.
   *
   * @private
   * @param {char} n Second letter of the MGRS 100k zone
   * @param {number} set The MGRS table set number, which is dependent on the
   *     UTM zone number.
   * @return {number} The northing value for the given letter and set.
   */
  function getNorthingFromChar(n, set) {

    if (n > 'V') {
      throw ("MGRSPoint given invalid Northing " + n);
    }

    // rowOrigin is the letter at the origin of the set for the
    // column
    var curRow = SET_ORIGIN_ROW_LETTERS.charCodeAt(set - 1);
    var northingValue = 0.0;
    var rewindMarker = false;

    while (curRow !== n.charCodeAt(0)) {
      curRow++;
      if (curRow === I) {
        curRow++;
      }
      if (curRow === O) {
        curRow++;
      }
      // fixing a bug making whole application hang in this loop
      // when 'n' is a wrong character
      if (curRow > V) {
        if (rewindMarker) { // making sure that this loop ends
          throw ("Bad character: " + n);
        }
        curRow = A;
        rewindMarker = true;
      }
      northingValue += 100000.0;
    }

    return northingValue;
  }

  /**
   * The function getMinNorthing returns the minimum northing value of a MGRS
   * zone.
   *
   * Ported from Geotrans' c Lattitude_Band_Value structure table.
   *
   * @private
   * @param {char} zoneLetter The MGRS zone to get the min northing for.
   * @return {number}
   */
  function getMinNorthing(zoneLetter) {
    var northing;
    switch (zoneLetter) {
    case 'C':
      northing = 1100000.0;
      break;
    case 'D':
      northing = 2000000.0;
      break;
    case 'E':
      northing = 2800000.0;
      break;
    case 'F':
      northing = 3700000.0;
      break;
    case 'G':
      northing = 4600000.0;
      break;
    case 'H':
      northing = 5500000.0;
      break;
    case 'J':
      northing = 6400000.0;
      break;
    case 'K':
      northing = 7300000.0;
      break;
    case 'L':
      northing = 8200000.0;
      break;
    case 'M':
      northing = 9100000.0;
      break;
    case 'N':
      northing = 0.0;
      break;
    case 'P':
      northing = 800000.0;
      break;
    case 'Q':
      northing = 1700000.0;
      break;
    case 'R':
      northing = 2600000.0;
      break;
    case 'S':
      northing = 3500000.0;
      break;
    case 'T':
      northing = 4400000.0;
      break;
    case 'U':
      northing = 5300000.0;
      break;
    case 'V':
      northing = 6200000.0;
      break;
    case 'W':
      northing = 7000000.0;
      break;
    case 'X':
      northing = 7900000.0;
      break;
    default:
      northing = -1;
    }
    if (northing >= 0.0) {
      return northing;
    }
    else {
      throw ("Invalid zone letter: " + zoneLetter);
    }

  }

  function Point(x, y, z) {
    if (!(this instanceof Point)) {
      return new Point(x, y, z);
    }
    if (Array.isArray(x)) {
      this.x = x[0];
      this.y = x[1];
      this.z = x[2] || 0.0;
    } else if (typeof x === 'object') {
      this.x = x.x;
      this.y = x.y;
      this.z = x.z || 0.0;
    } else if (typeof x === 'string' && typeof y === 'undefined') {
      var coords = x.split(',');
      this.x = parseFloat(coords[0], 10);
      this.y = parseFloat(coords[1], 10);
      this.z = parseFloat(coords[2], 10) || 0.0;
    } else {
      this.x = x;
      this.y = y;
      this.z = z || 0.0;
    }
    console.warn('proj4.Point will be removed in version 3, use proj4.toPoint');
  }

  Point.fromMGRS = function (mgrsStr) {
    return new Point(toPoint(mgrsStr));
  };
  Point.prototype.toMGRS = function (accuracy) {
    return forward$u([this.x, this.y], accuracy);
  };

  var C00 = 1;
  var C02 = 0.25;
  var C04 = 0.046875;
  var C06 = 0.01953125;
  var C08 = 0.01068115234375;
  var C22 = 0.75;
  var C44 = 0.46875;
  var C46 = 0.01302083333333333333;
  var C48 = 0.00712076822916666666;
  var C66 = 0.36458333333333333333;
  var C68 = 0.00569661458333333333;
  var C88 = 0.3076171875;

  function pj_enfn (es) {
    var en = [];
    en[0] = C00 - es * (C02 + es * (C04 + es * (C06 + es * C08)));
    en[1] = es * (C22 - es * (C04 + es * (C06 + es * C08)));
    var t = es * es;
    en[2] = t * (C44 - es * (C46 + es * C48));
    t *= es;
    en[3] = t * (C66 - es * C68);
    en[4] = t * es * C88;
    return en;
  }

  function pj_mlfn (phi, sphi, cphi, en) {
    cphi *= sphi;
    sphi *= sphi;
    return (en[0] * phi - cphi * (en[1] + sphi * (en[2] + sphi * (en[3] + sphi * en[4]))));
  }

  var MAX_ITER$3 = 20;

  function pj_inv_mlfn (arg, es, en) {
    var k = 1 / (1 - es);
    var phi = arg;
    for (var i = MAX_ITER$3; i; --i) { /* rarely goes over 2 iterations */
      var s = Math.sin(phi);
      var t = 1 - es * s * s;
      // t = this.pj_mlfn(phi, s, Math.cos(phi), en) - arg;
      // phi -= t * (t * Math.sqrt(t)) * k;
      t = (pj_mlfn(phi, s, Math.cos(phi), en) - arg) * (t * Math.sqrt(t)) * k;
      phi -= t;
      if (Math.abs(t) < EPSLN) {
        return phi;
      }
    }
    // ..reportError("cass:pj_inv_mlfn: Convergence error");
    return phi;
  }

  // Heavily based on this tmerc projection implementation
  // https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/tmerc.js


  function init$v() {
    this.x0 = this.x0 !== undefined ? this.x0 : 0;
    this.y0 = this.y0 !== undefined ? this.y0 : 0;
    this.long0 = this.long0 !== undefined ? this.long0 : 0;
    this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

    if (this.es) {
      this.en = pj_enfn(this.es);
      this.ml0 = pj_mlfn(this.lat0, Math.sin(this.lat0), Math.cos(this.lat0), this.en);
    }
  }

  /**
      Transverse Mercator Forward  - long/lat to x/y
      long/lat in radians
    */
  function forward$t(p) {
    var lon = p.x;
    var lat = p.y;

    var delta_lon = adjust_lon(lon - this.long0);
    var con;
    var x, y;
    var sin_phi = Math.sin(lat);
    var cos_phi = Math.cos(lat);

    if (!this.es) {
      var b = cos_phi * Math.sin(delta_lon);

      if ((Math.abs(Math.abs(b) - 1)) < EPSLN) {
        return (93);
      } else {
        x = 0.5 * this.a * this.k0 * Math.log((1 + b) / (1 - b)) + this.x0;
        y = cos_phi * Math.cos(delta_lon) / Math.sqrt(1 - Math.pow(b, 2));
        b = Math.abs(y);

        if (b >= 1) {
          if ((b - 1) > EPSLN) {
            return (93);
          } else {
            y = 0;
          }
        } else {
          y = Math.acos(y);
        }

        if (lat < 0) {
          y = -y;
        }

        y = this.a * this.k0 * (y - this.lat0) + this.y0;
      }
    } else {
      var al = cos_phi * delta_lon;
      var als = Math.pow(al, 2);
      var c = this.ep2 * Math.pow(cos_phi, 2);
      var cs = Math.pow(c, 2);
      var tq = Math.abs(cos_phi) > EPSLN ? Math.tan(lat) : 0;
      var t = Math.pow(tq, 2);
      var ts = Math.pow(t, 2);
      con = 1 - this.es * Math.pow(sin_phi, 2);
      al = al / Math.sqrt(con);
      var ml = pj_mlfn(lat, sin_phi, cos_phi, this.en);

      x = this.a * (this.k0 * al * (1
        + als / 6 * (1 - t + c
          + als / 20 * (5 - 18 * t + ts + 14 * c - 58 * t * c
            + als / 42 * (61 + 179 * ts - ts * t - 479 * t)))))
          + this.x0;

      y = this.a * (this.k0 * (ml - this.ml0
        + sin_phi * delta_lon * al / 2 * (1
          + als / 12 * (5 - t + 9 * c + 4 * cs
            + als / 30 * (61 + ts - 58 * t + 270 * c - 330 * t * c
              + als / 56 * (1385 + 543 * ts - ts * t - 3111 * t))))))
            + this.y0;
    }

    p.x = x;
    p.y = y;

    return p;
  }

  /**
      Transverse Mercator Inverse  -  x/y to long/lat
    */
  function inverse$t(p) {
    var con, phi;
    var lat, lon;
    var x = (p.x - this.x0) * (1 / this.a);
    var y = (p.y - this.y0) * (1 / this.a);

    if (!this.es) {
      var f = Math.exp(x / this.k0);
      var g = 0.5 * (f - 1 / f);
      var temp = this.lat0 + y / this.k0;
      var h = Math.cos(temp);
      con = Math.sqrt((1 - Math.pow(h, 2)) / (1 + Math.pow(g, 2)));
      lat = Math.asin(con);

      if (y < 0) {
        lat = -lat;
      }

      if ((g === 0) && (h === 0)) {
        lon = 0;
      } else {
        lon = adjust_lon(Math.atan2(g, h) + this.long0);
      }
    } else { // ellipsoidal form
      con = this.ml0 + y / this.k0;
      phi = pj_inv_mlfn(con, this.es, this.en);

      if (Math.abs(phi) < HALF_PI) {
        var sin_phi = Math.sin(phi);
        var cos_phi = Math.cos(phi);
        var tan_phi = Math.abs(cos_phi) > EPSLN ? Math.tan(phi) : 0;
        var c = this.ep2 * Math.pow(cos_phi, 2);
        var cs = Math.pow(c, 2);
        var t = Math.pow(tan_phi, 2);
        var ts = Math.pow(t, 2);
        con = 1 - this.es * Math.pow(sin_phi, 2);
        var d = x * Math.sqrt(con) / this.k0;
        var ds = Math.pow(d, 2);
        con = con * tan_phi;

        lat = phi - (con * ds / (1 - this.es)) * 0.5 * (1
          - ds / 12 * (5 + 3 * t - 9 * c * t + c - 4 * cs
            - ds / 30 * (61 + 90 * t - 252 * c * t + 45 * ts + 46 * c
              - ds / 56 * (1385 + 3633 * t + 4095 * ts + 1574 * ts * t))));

        lon = adjust_lon(this.long0 + (d * (1
          - ds / 6 * (1 + 2 * t + c
            - ds / 20 * (5 + 28 * t + 24 * ts + 8 * c * t + 6 * c
              - ds / 42 * (61 + 662 * t + 1320 * ts + 720 * ts * t)))) / cos_phi));
      } else {
        lat = HALF_PI * sign(y);
        lon = 0;
      }
    }

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$u = ['Fast_Transverse_Mercator', 'Fast Transverse Mercator'];
  var tmerc = {
    init: init$v,
    forward: forward$t,
    inverse: inverse$t,
    names: names$u
  };

  function sinh (x) {
    var r = Math.exp(x);
    r = (r - 1 / r) / 2;
    return r;
  }

  function hypot (x, y) {
    x = Math.abs(x);
    y = Math.abs(y);
    var a = Math.max(x, y);
    var b = Math.min(x, y) / (a ? a : 1);

    return a * Math.sqrt(1 + Math.pow(b, 2));
  }

  function log1py (x) {
    var y = 1 + x;
    var z = y - 1;

    return z === 0 ? x : x * Math.log(y) / z;
  }

  function asinhy (x) {
    var y = Math.abs(x);
    y = log1py(y * (1 + y / (hypot(1, y) + 1)));

    return x < 0 ? -y : y;
  }

  function gatg (pp, B) {
    var cos_2B = 2 * Math.cos(2 * B);
    var i = pp.length - 1;
    var h1 = pp[i];
    var h2 = 0;
    var h;

    while (--i >= 0) {
      h = -h2 + cos_2B * h1 + pp[i];
      h2 = h1;
      h1 = h;
    }

    return (B + h * Math.sin(2 * B));
  }

  function clens (pp, arg_r) {
    var r = 2 * Math.cos(arg_r);
    var i = pp.length - 1;
    var hr1 = pp[i];
    var hr2 = 0;
    var hr;

    while (--i >= 0) {
      hr = -hr2 + r * hr1 + pp[i];
      hr2 = hr1;
      hr1 = hr;
    }

    return Math.sin(arg_r) * hr;
  }

  function cosh (x) {
    var r = Math.exp(x);
    r = (r + 1 / r) / 2;
    return r;
  }

  function clens_cmplx (pp, arg_r, arg_i) {
    var sin_arg_r = Math.sin(arg_r);
    var cos_arg_r = Math.cos(arg_r);
    var sinh_arg_i = sinh(arg_i);
    var cosh_arg_i = cosh(arg_i);
    var r = 2 * cos_arg_r * cosh_arg_i;
    var i = -2 * sin_arg_r * sinh_arg_i;
    var j = pp.length - 1;
    var hr = pp[j];
    var hi1 = 0;
    var hr1 = 0;
    var hi = 0;
    var hr2;
    var hi2;

    while (--j >= 0) {
      hr2 = hr1;
      hi2 = hi1;
      hr1 = hr;
      hi1 = hi;
      hr = -hr2 + r * hr1 - i * hi1 + pp[j];
      hi = -hi2 + i * hr1 + r * hi1;
    }

    r = sin_arg_r * cosh_arg_i;
    i = cos_arg_r * sinh_arg_i;

    return [r * hr - i * hi, r * hi + i * hr];
  }

  // Heavily based on this etmerc projection implementation
  // https://github.com/mbloch/mapshaper-proj/blob/master/src/projections/etmerc.js


  function init$u() {
    if (!this.approx && (isNaN(this.es) || this.es <= 0)) {
      throw new Error('Incorrect elliptical usage. Try using the +approx option in the proj string, or PROJECTION["Fast_Transverse_Mercator"] in the WKT.');
    }
    if (this.approx) {
      // When '+approx' is set, use tmerc instead
      tmerc.init.apply(this);
      this.forward = tmerc.forward;
      this.inverse = tmerc.inverse;
    }

    this.x0 = this.x0 !== undefined ? this.x0 : 0;
    this.y0 = this.y0 !== undefined ? this.y0 : 0;
    this.long0 = this.long0 !== undefined ? this.long0 : 0;
    this.lat0 = this.lat0 !== undefined ? this.lat0 : 0;

    this.cgb = [];
    this.cbg = [];
    this.utg = [];
    this.gtu = [];

    var f = this.es / (1 + Math.sqrt(1 - this.es));
    var n = f / (2 - f);
    var np = n;

    this.cgb[0] = n * (2 + n * (-2 / 3 + n * (-2 + n * (116 / 45 + n * (26 / 45 + n * (-2854 / 675))))));
    this.cbg[0] = n * (-2 + n * (2 / 3 + n * (4 / 3 + n * (-82 / 45 + n * (32 / 45 + n * (4642 / 4725))))));

    np = np * n;
    this.cgb[1] = np * (7 / 3 + n * (-8 / 5 + n * (-227 / 45 + n * (2704 / 315 + n * (2323 / 945)))));
    this.cbg[1] = np * (5 / 3 + n * (-16 / 15 + n * (-13 / 9 + n * (904 / 315 + n * (-1522 / 945)))));

    np = np * n;
    this.cgb[2] = np * (56 / 15 + n * (-136 / 35 + n * (-1262 / 105 + n * (73814 / 2835))));
    this.cbg[2] = np * (-26 / 15 + n * (34 / 21 + n * (8 / 5 + n * (-12686 / 2835))));

    np = np * n;
    this.cgb[3] = np * (4279 / 630 + n * (-332 / 35 + n * (-399572 / 14175)));
    this.cbg[3] = np * (1237 / 630 + n * (-12 / 5 + n * (-24832 / 14175)));

    np = np * n;
    this.cgb[4] = np * (4174 / 315 + n * (-144838 / 6237));
    this.cbg[4] = np * (-734 / 315 + n * (109598 / 31185));

    np = np * n;
    this.cgb[5] = np * (601676 / 22275);
    this.cbg[5] = np * (444337 / 155925);

    np = Math.pow(n, 2);
    this.Qn = this.k0 / (1 + n) * (1 + np * (1 / 4 + np * (1 / 64 + np / 256)));

    this.utg[0] = n * (-0.5 + n * (2 / 3 + n * (-37 / 96 + n * (1 / 360 + n * (81 / 512 + n * (-96199 / 604800))))));
    this.gtu[0] = n * (0.5 + n * (-2 / 3 + n * (5 / 16 + n * (41 / 180 + n * (-127 / 288 + n * (7891 / 37800))))));

    this.utg[1] = np * (-1 / 48 + n * (-1 / 15 + n * (437 / 1440 + n * (-46 / 105 + n * (1118711 / 3870720)))));
    this.gtu[1] = np * (13 / 48 + n * (-3 / 5 + n * (557 / 1440 + n * (281 / 630 + n * (-1983433 / 1935360)))));

    np = np * n;
    this.utg[2] = np * (-17 / 480 + n * (37 / 840 + n * (209 / 4480 + n * (-5569 / 90720))));
    this.gtu[2] = np * (61 / 240 + n * (-103 / 140 + n * (15061 / 26880 + n * (167603 / 181440))));

    np = np * n;
    this.utg[3] = np * (-4397 / 161280 + n * (11 / 504 + n * (830251 / 7257600)));
    this.gtu[3] = np * (49561 / 161280 + n * (-179 / 168 + n * (6601661 / 7257600)));

    np = np * n;
    this.utg[4] = np * (-4583 / 161280 + n * (108847 / 3991680));
    this.gtu[4] = np * (34729 / 80640 + n * (-3418889 / 1995840));

    np = np * n;
    this.utg[5] = np * (-20648693 / 638668800);
    this.gtu[5] = np * (212378941 / 319334400);

    var Z = gatg(this.cbg, this.lat0);
    this.Zb = -this.Qn * (Z + clens(this.gtu, 2 * Z));
  }

  function forward$s(p) {
    var Ce = adjust_lon(p.x - this.long0);
    var Cn = p.y;

    Cn = gatg(this.cbg, Cn);
    var sin_Cn = Math.sin(Cn);
    var cos_Cn = Math.cos(Cn);
    var sin_Ce = Math.sin(Ce);
    var cos_Ce = Math.cos(Ce);

    Cn = Math.atan2(sin_Cn, cos_Ce * cos_Cn);
    Ce = Math.atan2(sin_Ce * cos_Cn, hypot(sin_Cn, cos_Cn * cos_Ce));
    Ce = asinhy(Math.tan(Ce));

    var tmp = clens_cmplx(this.gtu, 2 * Cn, 2 * Ce);

    Cn = Cn + tmp[0];
    Ce = Ce + tmp[1];

    var x;
    var y;

    if (Math.abs(Ce) <= 2.623395162778) {
      x = this.a * (this.Qn * Ce) + this.x0;
      y = this.a * (this.Qn * Cn + this.Zb) + this.y0;
    } else {
      x = Infinity;
      y = Infinity;
    }

    p.x = x;
    p.y = y;

    return p;
  }

  function inverse$s(p) {
    var Ce = (p.x - this.x0) * (1 / this.a);
    var Cn = (p.y - this.y0) * (1 / this.a);

    Cn = (Cn - this.Zb) / this.Qn;
    Ce = Ce / this.Qn;

    var lon;
    var lat;

    if (Math.abs(Ce) <= 2.623395162778) {
      var tmp = clens_cmplx(this.utg, 2 * Cn, 2 * Ce);

      Cn = Cn + tmp[0];
      Ce = Ce + tmp[1];
      Ce = Math.atan(sinh(Ce));

      var sin_Cn = Math.sin(Cn);
      var cos_Cn = Math.cos(Cn);
      var sin_Ce = Math.sin(Ce);
      var cos_Ce = Math.cos(Ce);

      Cn = Math.atan2(sin_Cn * cos_Ce, hypot(sin_Ce, cos_Ce * cos_Cn));
      Ce = Math.atan2(sin_Ce, cos_Ce * cos_Cn);

      lon = adjust_lon(Ce + this.long0);
      lat = gatg(this.cgb, Cn);
    } else {
      lon = Infinity;
      lat = Infinity;
    }

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$t = ['Extended_Transverse_Mercator', 'Extended Transverse Mercator', 'etmerc', 'Transverse_Mercator', 'Transverse Mercator', 'Gauss Kruger', 'Gauss_Kruger', 'tmerc'];
  var etmerc = {
    init: init$u,
    forward: forward$s,
    inverse: inverse$s,
    names: names$t
  };

  function adjust_zone (zone, lon) {
    if (zone === undefined) {
      zone = Math.floor((adjust_lon(lon) + Math.PI) * 30 / Math.PI) + 1;

      if (zone < 0) {
        return 0;
      } else if (zone > 60) {
        return 60;
      }
    }
    return zone;
  }

  var dependsOn = 'etmerc';

  function init$t() {
    var zone = adjust_zone(this.zone, this.long0);
    if (zone === undefined) {
      throw new Error('unknown utm zone');
    }
    this.lat0 = 0;
    this.long0 = ((6 * Math.abs(zone)) - 183) * D2R$1;
    this.x0 = 500000;
    this.y0 = this.utmSouth ? 10000000 : 0;
    this.k0 = 0.9996;

    etmerc.init.apply(this);
    this.forward = etmerc.forward;
    this.inverse = etmerc.inverse;
  }

  var names$s = ['Universal Transverse Mercator System', 'utm'];
  var utm = {
    init: init$t,
    names: names$s,
    dependsOn: dependsOn
  };

  function srat (esinp, exp) {
    return (Math.pow((1 - esinp) / (1 + esinp), exp));
  }

  var MAX_ITER$2 = 20;

  function init$s() {
    var sphi = Math.sin(this.lat0);
    var cphi = Math.cos(this.lat0);
    cphi *= cphi;
    this.rc = Math.sqrt(1 - this.es) / (1 - this.es * sphi * sphi);
    this.C = Math.sqrt(1 + this.es * cphi * cphi / (1 - this.es));
    this.phic0 = Math.asin(sphi / this.C);
    this.ratexp = 0.5 * this.C * this.e;
    this.K = Math.tan(0.5 * this.phic0 + FORTPI) / (Math.pow(Math.tan(0.5 * this.lat0 + FORTPI), this.C) * srat(this.e * sphi, this.ratexp));
  }

  function forward$r(p) {
    var lon = p.x;
    var lat = p.y;

    p.y = 2 * Math.atan(this.K * Math.pow(Math.tan(0.5 * lat + FORTPI), this.C) * srat(this.e * Math.sin(lat), this.ratexp)) - HALF_PI;
    p.x = this.C * lon;
    return p;
  }

  function inverse$r(p) {
    var DEL_TOL = 1e-14;
    var lon = p.x / this.C;
    var lat = p.y;
    var num = Math.pow(Math.tan(0.5 * lat + FORTPI) / this.K, 1 / this.C);
    for (var i = MAX_ITER$2; i > 0; --i) {
      lat = 2 * Math.atan(num * srat(this.e * Math.sin(p.y), -0.5 * this.e)) - HALF_PI;
      if (Math.abs(lat - p.y) < DEL_TOL) {
        break;
      }
      p.y = lat;
    }
    /* convergence failed */
    if (!i) {
      return null;
    }
    p.x = lon;
    p.y = lat;
    return p;
  }
  var gauss = {
    init: init$s,
    forward: forward$r,
    inverse: inverse$r};

  function init$r() {
    gauss.init.apply(this);
    if (!this.rc) {
      return;
    }
    this.sinc0 = Math.sin(this.phic0);
    this.cosc0 = Math.cos(this.phic0);
    this.R2 = 2 * this.rc;
    if (!this.title) {
      this.title = 'Oblique Stereographic Alternative';
    }
  }

  function forward$q(p) {
    var sinc, cosc, cosl, k;
    p.x = adjust_lon(p.x - this.long0);
    gauss.forward.apply(this, [p]);
    sinc = Math.sin(p.y);
    cosc = Math.cos(p.y);
    cosl = Math.cos(p.x);
    k = this.k0 * this.R2 / (1 + this.sinc0 * sinc + this.cosc0 * cosc * cosl);
    p.x = k * cosc * Math.sin(p.x);
    p.y = k * (this.cosc0 * sinc - this.sinc0 * cosc * cosl);
    p.x = this.a * p.x + this.x0;
    p.y = this.a * p.y + this.y0;
    return p;
  }

  function inverse$q(p) {
    var sinc, cosc, lon, lat, rho;
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    p.x /= this.k0;
    p.y /= this.k0;
    if ((rho = hypot(p.x, p.y))) {
      var c = 2 * Math.atan2(rho, this.R2);
      sinc = Math.sin(c);
      cosc = Math.cos(c);
      lat = Math.asin(cosc * this.sinc0 + p.y * sinc * this.cosc0 / rho);
      lon = Math.atan2(p.x * sinc, rho * this.cosc0 * cosc - p.y * this.sinc0 * sinc);
    } else {
      lat = this.phic0;
      lon = 0;
    }

    p.x = lon;
    p.y = lat;
    gauss.inverse.apply(this, [p]);
    p.x = adjust_lon(p.x + this.long0);
    return p;
  }

  var names$r = ['Stereographic_North_Pole', 'Oblique_Stereographic', 'sterea', 'Oblique Stereographic Alternative', 'Double_Stereographic'];
  var sterea = {
    init: init$r,
    forward: forward$q,
    inverse: inverse$q,
    names: names$r
  };

  function ssfn_(phit, sinphi, eccen) {
    sinphi *= eccen;
    return (Math.tan(0.5 * (HALF_PI + phit)) * Math.pow((1 - sinphi) / (1 + sinphi), 0.5 * eccen));
  }

  function init$q() {
    // setting default parameters
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;

    this.coslat0 = Math.cos(this.lat0);
    this.sinlat0 = Math.sin(this.lat0);
    if (this.sphere) {
      if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN) {
        this.k0 = 0.5 * (1 + sign(this.lat0) * Math.sin(this.lat_ts));
      }
    } else {
      if (Math.abs(this.coslat0) <= EPSLN) {
        if (this.lat0 > 0) {
          // North pole
          // trace('stere:north pole');
          this.con = 1;
        } else {
          // South pole
          // trace('stere:south pole');
          this.con = -1;
        }
      }
      this.cons = Math.sqrt(Math.pow(1 + this.e, 1 + this.e) * Math.pow(1 - this.e, 1 - this.e));
      if (this.k0 === 1 && !isNaN(this.lat_ts) && Math.abs(this.coslat0) <= EPSLN && Math.abs(Math.cos(this.lat_ts)) > EPSLN) {
        // When k0 is 1 (default value) and lat_ts is a vaild number and lat0 is at a pole and lat_ts is not at a pole
        // Recalculate k0 using formula 21-35 from p161 of Snyder, 1987
        this.k0 = 0.5 * this.cons * msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts)) / tsfnz(this.e, this.con * this.lat_ts, this.con * Math.sin(this.lat_ts));
      }
      this.ms1 = msfnz(this.e, this.sinlat0, this.coslat0);
      this.X0 = 2 * Math.atan(this.ssfn_(this.lat0, this.sinlat0, this.e)) - HALF_PI;
      this.cosX0 = Math.cos(this.X0);
      this.sinX0 = Math.sin(this.X0);
    }
  }

  // Stereographic forward equations--mapping lat,long to x,y
  function forward$p(p) {
    var lon = p.x;
    var lat = p.y;
    var sinlat = Math.sin(lat);
    var coslat = Math.cos(lat);
    var A, X, sinX, cosX, ts, rh;
    var dlon = adjust_lon(lon - this.long0);

    if (Math.abs(Math.abs(lon - this.long0) - Math.PI) <= EPSLN && Math.abs(lat + this.lat0) <= EPSLN) {
      // case of the origine point
      // trace('stere:this is the origin point');
      p.x = NaN;
      p.y = NaN;
      return p;
    }
    if (this.sphere) {
      // trace('stere:sphere case');
      A = 2 * this.k0 / (1 + this.sinlat0 * sinlat + this.coslat0 * coslat * Math.cos(dlon));
      p.x = this.a * A * coslat * Math.sin(dlon) + this.x0;
      p.y = this.a * A * (this.coslat0 * sinlat - this.sinlat0 * coslat * Math.cos(dlon)) + this.y0;
      return p;
    } else {
      X = 2 * Math.atan(this.ssfn_(lat, sinlat, this.e)) - HALF_PI;
      cosX = Math.cos(X);
      sinX = Math.sin(X);
      if (Math.abs(this.coslat0) <= EPSLN) {
        ts = tsfnz(this.e, lat * this.con, this.con * sinlat);
        rh = 2 * this.a * this.k0 * ts / this.cons;
        p.x = this.x0 + rh * Math.sin(lon - this.long0);
        p.y = this.y0 - this.con * rh * Math.cos(lon - this.long0);
        // trace(p.toString());
        return p;
      } else if (Math.abs(this.sinlat0) < EPSLN) {
        // Eq
        // trace('stere:equateur');
        A = 2 * this.a * this.k0 / (1 + cosX * Math.cos(dlon));
        p.y = A * sinX;
      } else {
        // other case
        // trace('stere:normal case');
        A = 2 * this.a * this.k0 * this.ms1 / (this.cosX0 * (1 + this.sinX0 * sinX + this.cosX0 * cosX * Math.cos(dlon)));
        p.y = A * (this.cosX0 * sinX - this.sinX0 * cosX * Math.cos(dlon)) + this.y0;
      }
      p.x = A * cosX * Math.sin(dlon) + this.x0;
    }
    // trace(p.toString());
    return p;
  }

  //* Stereographic inverse equations--mapping x,y to lat/long
  function inverse$p(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var lon, lat, ts, ce, Chi;
    var rh = Math.sqrt(p.x * p.x + p.y * p.y);
    if (this.sphere) {
      var c = 2 * Math.atan(rh / (2 * this.a * this.k0));
      lon = this.long0;
      lat = this.lat0;
      if (rh <= EPSLN) {
        p.x = lon;
        p.y = lat;
        return p;
      }
      lat = Math.asin(Math.cos(c) * this.sinlat0 + p.y * Math.sin(c) * this.coslat0 / rh);
      if (Math.abs(this.coslat0) < EPSLN) {
        if (this.lat0 > 0) {
          lon = adjust_lon(this.long0 + Math.atan2(p.x, -1 * p.y));
        } else {
          lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
        }
      } else {
        lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(c), rh * this.coslat0 * Math.cos(c) - p.y * this.sinlat0 * Math.sin(c)));
      }
      p.x = lon;
      p.y = lat;
      return p;
    } else {
      if (Math.abs(this.coslat0) <= EPSLN) {
        if (rh <= EPSLN) {
          lat = this.lat0;
          lon = this.long0;
          p.x = lon;
          p.y = lat;
          // trace(p.toString());
          return p;
        }
        p.x *= this.con;
        p.y *= this.con;
        ts = rh * this.cons / (2 * this.a * this.k0);
        lat = this.con * phi2z(this.e, ts);
        lon = this.con * adjust_lon(this.con * this.long0 + Math.atan2(p.x, -1 * p.y));
      } else {
        ce = 2 * Math.atan(rh * this.cosX0 / (2 * this.a * this.k0 * this.ms1));
        lon = this.long0;
        if (rh <= EPSLN) {
          Chi = this.X0;
        } else {
          Chi = Math.asin(Math.cos(ce) * this.sinX0 + p.y * Math.sin(ce) * this.cosX0 / rh);
          lon = adjust_lon(this.long0 + Math.atan2(p.x * Math.sin(ce), rh * this.cosX0 * Math.cos(ce) - p.y * this.sinX0 * Math.sin(ce)));
        }
        lat = -1 * phi2z(this.e, Math.tan(0.5 * (HALF_PI + Chi)));
      }
    }
    p.x = lon;
    p.y = lat;

    // trace(p.toString());
    return p;
  }

  var names$q = ['stere', 'Stereographic_South_Pole', 'Polar_Stereographic_variant_A', 'Polar_Stereographic_variant_B', 'Polar_Stereographic'];
  var stere = {
    init: init$q,
    forward: forward$p,
    inverse: inverse$p,
    names: names$q,
    ssfn_: ssfn_
  };

  /*
    references:
      Formules et constantes pour le Calcul pour la
      projection cylindrique conforme à axe oblique et pour la transformation entre
      des systèmes de référence.
      http://www.swisstopo.admin.ch/internet/swisstopo/fr/home/topics/survey/sys/refsys/switzerland.parsysrelated1.31216.downloadList.77004.DownloadFile.tmp/swissprojectionfr.pdf
    */

  function init$p() {
    var phy0 = this.lat0;
    this.lambda0 = this.long0;
    var sinPhy0 = Math.sin(phy0);
    var semiMajorAxis = this.a;
    var invF = this.rf;
    var flattening = 1 / invF;
    var e2 = 2 * flattening - Math.pow(flattening, 2);
    var e = this.e = Math.sqrt(e2);
    this.R = this.k0 * semiMajorAxis * Math.sqrt(1 - e2) / (1 - e2 * Math.pow(sinPhy0, 2));
    this.alpha = Math.sqrt(1 + e2 / (1 - e2) * Math.pow(Math.cos(phy0), 4));
    this.b0 = Math.asin(sinPhy0 / this.alpha);
    var k1 = Math.log(Math.tan(Math.PI / 4 + this.b0 / 2));
    var k2 = Math.log(Math.tan(Math.PI / 4 + phy0 / 2));
    var k3 = Math.log((1 + e * sinPhy0) / (1 - e * sinPhy0));
    this.K = k1 - this.alpha * k2 + this.alpha * e / 2 * k3;
  }

  function forward$o(p) {
    var Sa1 = Math.log(Math.tan(Math.PI / 4 - p.y / 2));
    var Sa2 = this.e / 2 * Math.log((1 + this.e * Math.sin(p.y)) / (1 - this.e * Math.sin(p.y)));
    var S = -this.alpha * (Sa1 + Sa2) + this.K;

    // spheric latitude
    var b = 2 * (Math.atan(Math.exp(S)) - Math.PI / 4);

    // spheric longitude
    var I = this.alpha * (p.x - this.lambda0);

    // psoeudo equatorial rotation
    var rotI = Math.atan(Math.sin(I) / (Math.sin(this.b0) * Math.tan(b) + Math.cos(this.b0) * Math.cos(I)));

    var rotB = Math.asin(Math.cos(this.b0) * Math.sin(b) - Math.sin(this.b0) * Math.cos(b) * Math.cos(I));

    p.y = this.R / 2 * Math.log((1 + Math.sin(rotB)) / (1 - Math.sin(rotB))) + this.y0;
    p.x = this.R * rotI + this.x0;
    return p;
  }

  function inverse$o(p) {
    var Y = p.x - this.x0;
    var X = p.y - this.y0;

    var rotI = Y / this.R;
    var rotB = 2 * (Math.atan(Math.exp(X / this.R)) - Math.PI / 4);

    var b = Math.asin(Math.cos(this.b0) * Math.sin(rotB) + Math.sin(this.b0) * Math.cos(rotB) * Math.cos(rotI));
    var I = Math.atan(Math.sin(rotI) / (Math.cos(this.b0) * Math.cos(rotI) - Math.sin(this.b0) * Math.tan(rotB)));

    var lambda = this.lambda0 + I / this.alpha;

    var S = 0;
    var phy = b;
    var prevPhy = -1e3;
    var iteration = 0;
    while (Math.abs(phy - prevPhy) > 0.0000001) {
      if (++iteration > 20) {
        // ...reportError("omercFwdInfinity");
        return;
      }
      // S = Math.log(Math.tan(Math.PI / 4 + phy / 2));
      S = 1 / this.alpha * (Math.log(Math.tan(Math.PI / 4 + b / 2)) - this.K) + this.e * Math.log(Math.tan(Math.PI / 4 + Math.asin(this.e * Math.sin(phy)) / 2));
      prevPhy = phy;
      phy = 2 * Math.atan(Math.exp(S)) - Math.PI / 2;
    }

    p.x = lambda;
    p.y = phy;
    return p;
  }

  var names$p = ['somerc'];
  var somerc = {
    init: init$p,
    forward: forward$o,
    inverse: inverse$o,
    names: names$p
  };

  var TOL = 1e-7;

  function isTypeA(P) {
    var typeAProjections = ['Hotine_Oblique_Mercator', 'Hotine_Oblique_Mercator_variant_A', 'Hotine_Oblique_Mercator_Azimuth_Natural_Origin'];
    var projectionName = typeof P.projName === 'object' ? Object.keys(P.projName)[0] : P.projName;

    return 'no_uoff' in P || 'no_off' in P || typeAProjections.indexOf(projectionName) !== -1 || typeAProjections.indexOf(getNormalizedProjName(projectionName)) !== -1;
  }

  /* Initialize the Oblique Mercator  projection
      ------------------------------------------ */
  function init$o() {
    var con, com, cosph0, D, F, H, L, sinph0, p, J, gamma = 0,
      gamma0, lamc = 0, lam1 = 0, lam2 = 0, phi1 = 0, phi2 = 0, alpha_c = 0;

    // only Type A uses the no_off or no_uoff property
    // https://github.com/OSGeo/proj.4/issues/104
    this.no_off = isTypeA(this);
    this.no_rot = 'no_rot' in this;

    var alp = false;
    if ('alpha' in this) {
      alp = true;
    }

    var gam = false;
    if ('rectified_grid_angle' in this) {
      gam = true;
    }

    if (alp) {
      alpha_c = this.alpha;
    }

    if (gam) {
      gamma = this.rectified_grid_angle;
    }

    if (alp || gam) {
      lamc = this.longc;
    } else {
      lam1 = this.long1;
      phi1 = this.lat1;
      lam2 = this.long2;
      phi2 = this.lat2;

      if (Math.abs(phi1 - phi2) <= TOL || (con = Math.abs(phi1)) <= TOL
        || Math.abs(con - HALF_PI) <= TOL || Math.abs(Math.abs(this.lat0) - HALF_PI) <= TOL
        || Math.abs(Math.abs(phi2) - HALF_PI) <= TOL) {
        throw new Error();
      }
    }

    var one_es = 1.0 - this.es;
    com = Math.sqrt(one_es);

    if (Math.abs(this.lat0) > EPSLN) {
      sinph0 = Math.sin(this.lat0);
      cosph0 = Math.cos(this.lat0);
      con = 1 - this.es * sinph0 * sinph0;
      this.B = cosph0 * cosph0;
      this.B = Math.sqrt(1 + this.es * this.B * this.B / one_es);
      this.A = this.B * this.k0 * com / con;
      D = this.B * com / (cosph0 * Math.sqrt(con));
      F = D * D - 1;

      if (F <= 0) {
        F = 0;
      } else {
        F = Math.sqrt(F);
        if (this.lat0 < 0) {
          F = -F;
        }
      }

      this.E = F += D;
      this.E *= Math.pow(tsfnz(this.e, this.lat0, sinph0), this.B);
    } else {
      this.B = 1 / com;
      this.A = this.k0;
      this.E = D = F = 1;
    }

    if (alp || gam) {
      if (alp) {
        gamma0 = Math.asin(Math.sin(alpha_c) / D);
        if (!gam) {
          gamma = alpha_c;
        }
      } else {
        gamma0 = gamma;
        alpha_c = Math.asin(D * Math.sin(gamma0));
      }
      this.lam0 = lamc - Math.asin(0.5 * (F - 1 / F) * Math.tan(gamma0)) / this.B;
    } else {
      H = Math.pow(tsfnz(this.e, phi1, Math.sin(phi1)), this.B);
      L = Math.pow(tsfnz(this.e, phi2, Math.sin(phi2)), this.B);
      F = this.E / H;
      p = (L - H) / (L + H);
      J = this.E * this.E;
      J = (J - L * H) / (J + L * H);
      con = lam1 - lam2;

      if (con < -Math.pi) {
        lam2 -= TWO_PI;
      } else if (con > Math.pi) {
        lam2 += TWO_PI;
      }

      this.lam0 = adjust_lon(0.5 * (lam1 + lam2) - Math.atan(J * Math.tan(0.5 * this.B * (lam1 - lam2)) / p) / this.B);
      gamma0 = Math.atan(2 * Math.sin(this.B * adjust_lon(lam1 - this.lam0)) / (F - 1 / F));
      gamma = alpha_c = Math.asin(D * Math.sin(gamma0));
    }

    this.singam = Math.sin(gamma0);
    this.cosgam = Math.cos(gamma0);
    this.sinrot = Math.sin(gamma);
    this.cosrot = Math.cos(gamma);

    this.rB = 1 / this.B;
    this.ArB = this.A * this.rB;
    this.BrA = 1 / this.ArB;

    if (this.no_off) {
      this.u_0 = 0;
    } else {
      this.u_0 = Math.abs(this.ArB * Math.atan(Math.sqrt(D * D - 1) / Math.cos(alpha_c)));

      if (this.lat0 < 0) {
        this.u_0 = -this.u_0;
      }
    }

    F = 0.5 * gamma0;
    this.v_pole_n = this.ArB * Math.log(Math.tan(FORTPI - F));
    this.v_pole_s = this.ArB * Math.log(Math.tan(FORTPI + F));
  }

  /* Oblique Mercator forward equations--mapping lat,long to x,y
      ---------------------------------------------------------- */
  function forward$n(p) {
    var coords = {};
    var S, T, U, V, W, temp, u, v;
    p.x = p.x - this.lam0;

    if (Math.abs(Math.abs(p.y) - HALF_PI) > EPSLN) {
      W = this.E / Math.pow(tsfnz(this.e, p.y, Math.sin(p.y)), this.B);

      temp = 1 / W;
      S = 0.5 * (W - temp);
      T = 0.5 * (W + temp);
      V = Math.sin(this.B * p.x);
      U = (S * this.singam - V * this.cosgam) / T;

      if (Math.abs(Math.abs(U) - 1.0) < EPSLN) {
        throw new Error();
      }

      v = 0.5 * this.ArB * Math.log((1 - U) / (1 + U));
      temp = Math.cos(this.B * p.x);

      if (Math.abs(temp) < TOL) {
        u = this.A * p.x;
      } else {
        u = this.ArB * Math.atan2((S * this.cosgam + V * this.singam), temp);
      }
    } else {
      v = p.y > 0 ? this.v_pole_n : this.v_pole_s;
      u = this.ArB * p.y;
    }

    if (this.no_rot) {
      coords.x = u;
      coords.y = v;
    } else {
      u -= this.u_0;
      coords.x = v * this.cosrot + u * this.sinrot;
      coords.y = u * this.cosrot - v * this.sinrot;
    }

    coords.x = (this.a * coords.x + this.x0);
    coords.y = (this.a * coords.y + this.y0);

    return coords;
  }

  function inverse$n(p) {
    var u, v, Qp, Sp, Tp, Vp, Up;
    var coords = {};

    p.x = (p.x - this.x0) * (1.0 / this.a);
    p.y = (p.y - this.y0) * (1.0 / this.a);

    if (this.no_rot) {
      v = p.y;
      u = p.x;
    } else {
      v = p.x * this.cosrot - p.y * this.sinrot;
      u = p.y * this.cosrot + p.x * this.sinrot + this.u_0;
    }

    Qp = Math.exp(-this.BrA * v);
    Sp = 0.5 * (Qp - 1 / Qp);
    Tp = 0.5 * (Qp + 1 / Qp);
    Vp = Math.sin(this.BrA * u);
    Up = (Vp * this.cosgam + Sp * this.singam) / Tp;

    if (Math.abs(Math.abs(Up) - 1) < EPSLN) {
      coords.x = 0;
      coords.y = Up < 0 ? -HALF_PI : HALF_PI;
    } else {
      coords.y = this.E / Math.sqrt((1 + Up) / (1 - Up));
      coords.y = phi2z(this.e, Math.pow(coords.y, 1 / this.B));

      if (coords.y === Infinity) {
        throw new Error();
      }

      coords.x = -this.rB * Math.atan2((Sp * this.cosgam - Vp * this.singam), Math.cos(this.BrA * u));
    }

    coords.x += this.lam0;

    return coords;
  }

  var names$o = ['Hotine_Oblique_Mercator', 'Hotine Oblique Mercator', 'Hotine_Oblique_Mercator_variant_A', 'Hotine_Oblique_Mercator_Variant_B', 'Hotine_Oblique_Mercator_Azimuth_Natural_Origin', 'Hotine_Oblique_Mercator_Two_Point_Natural_Origin', 'Hotine_Oblique_Mercator_Azimuth_Center', 'Oblique_Mercator', 'omerc'];
  var omerc = {
    init: init$o,
    forward: forward$n,
    inverse: inverse$n,
    names: names$o
  };

  function init$n() {
    // double lat0;                    /* the reference latitude               */
    // double long0;                   /* the reference longitude              */
    // double lat1;                    /* first standard parallel              */
    // double lat2;                    /* second standard parallel             */
    // double r_maj;                   /* major axis                           */
    // double r_min;                   /* minor axis                           */
    // double false_east;              /* x offset in meters                   */
    // double false_north;             /* y offset in meters                   */

    // the above value can be set with proj4.defs
    // example: proj4.defs("EPSG:2154","+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs");

    if (!this.lat2) {
      this.lat2 = this.lat1;
    } // if lat2 is not defined
    if (!this.k0) {
      this.k0 = 1;
    }
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    // Standard Parallels cannot be equal and on opposite sides of the equator
    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }

    var temp = this.b / this.a;
    this.e = Math.sqrt(1 - temp * temp);

    var sin1 = Math.sin(this.lat1);
    var cos1 = Math.cos(this.lat1);
    var ms1 = msfnz(this.e, sin1, cos1);
    var ts1 = tsfnz(this.e, this.lat1, sin1);

    var sin2 = Math.sin(this.lat2);
    var cos2 = Math.cos(this.lat2);
    var ms2 = msfnz(this.e, sin2, cos2);
    var ts2 = tsfnz(this.e, this.lat2, sin2);

    var ts0 = Math.abs(Math.abs(this.lat0) - HALF_PI) < EPSLN
      ? 0 // Handle poles by setting ts0 to 0
      : tsfnz(this.e, this.lat0, Math.sin(this.lat0));

    if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
      this.ns = Math.log(ms1 / ms2) / Math.log(ts1 / ts2);
    } else {
      this.ns = sin1;
    }
    if (isNaN(this.ns)) {
      this.ns = sin1;
    }
    this.f0 = ms1 / (this.ns * Math.pow(ts1, this.ns));
    this.rh = this.a * this.f0 * Math.pow(ts0, this.ns);
    if (!this.title) {
      this.title = 'Lambert Conformal Conic';
    }
  }

  // Lambert Conformal conic forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$m(p) {
    var lon = p.x;
    var lat = p.y;

    // singular cases :
    if (Math.abs(2 * Math.abs(lat) - Math.PI) <= EPSLN) {
      lat = sign(lat) * (HALF_PI - 2 * EPSLN);
    }

    var con = Math.abs(Math.abs(lat) - HALF_PI);
    var ts, rh1;
    if (con > EPSLN) {
      ts = tsfnz(this.e, lat, Math.sin(lat));
      rh1 = this.a * this.f0 * Math.pow(ts, this.ns);
    } else {
      con = lat * this.ns;
      if (con <= 0) {
        return null;
      }
      rh1 = 0;
    }
    var theta = this.ns * adjust_lon(lon - this.long0);
    p.x = this.k0 * (rh1 * Math.sin(theta)) + this.x0;
    p.y = this.k0 * (this.rh - rh1 * Math.cos(theta)) + this.y0;

    return p;
  }

  // Lambert Conformal Conic inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$m(p) {
    var rh1, con, ts;
    var lat, lon;
    var x = (p.x - this.x0) / this.k0;
    var y = (this.rh - (p.y - this.y0) / this.k0);
    if (this.ns > 0) {
      rh1 = Math.sqrt(x * x + y * y);
      con = 1;
    } else {
      rh1 = -Math.sqrt(x * x + y * y);
      con = -1;
    }
    var theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2((con * x), (con * y));
    }
    if ((rh1 !== 0) || (this.ns > 0)) {
      con = 1 / this.ns;
      ts = Math.pow((rh1 / (this.a * this.f0)), con);
      lat = phi2z(this.e, ts);
      if (lat === -9999) {
        return null;
      }
    } else {
      lat = -HALF_PI;
    }
    lon = adjust_lon(theta / this.ns + this.long0);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$n = [
    'Lambert Tangential Conformal Conic Projection',
    'Lambert_Conformal_Conic',
    'Lambert_Conformal_Conic_1SP',
    'Lambert_Conformal_Conic_2SP',
    'lcc',
    'Lambert Conic Conformal (1SP)',
    'Lambert Conic Conformal (2SP)'
  ];

  var lcc = {
    init: init$n,
    forward: forward$m,
    inverse: inverse$m,
    names: names$n
  };

  function init$m() {
    this.a = 6377397.155;
    this.es = 0.006674372230614;
    this.e = Math.sqrt(this.es);
    if (!this.lat0) {
      this.lat0 = 0.863937979737193;
    }
    if (!this.long0) {
      this.long0 = 0.7417649320975901 - 0.308341501185665;
    }
    /* if scale not set default to 0.9999 */
    if (!this.k0) {
      this.k0 = 0.9999;
    }
    this.s45 = 0.785398163397448; /* 45 */
    this.s90 = 2 * this.s45;
    this.fi0 = this.lat0;
    this.e2 = this.es;
    this.e = Math.sqrt(this.e2);
    this.alfa = Math.sqrt(1 + (this.e2 * Math.pow(Math.cos(this.fi0), 4)) / (1 - this.e2));
    this.uq = 1.04216856380474;
    this.u0 = Math.asin(Math.sin(this.fi0) / this.alfa);
    this.g = Math.pow((1 + this.e * Math.sin(this.fi0)) / (1 - this.e * Math.sin(this.fi0)), this.alfa * this.e / 2);
    this.k = Math.tan(this.u0 / 2 + this.s45) / Math.pow(Math.tan(this.fi0 / 2 + this.s45), this.alfa) * this.g;
    this.k1 = this.k0;
    this.n0 = this.a * Math.sqrt(1 - this.e2) / (1 - this.e2 * Math.pow(Math.sin(this.fi0), 2));
    this.s0 = 1.37008346281555;
    this.n = Math.sin(this.s0);
    this.ro0 = this.k1 * this.n0 / Math.tan(this.s0);
    this.ad = this.s90 - this.uq;
  }

  /* ellipsoid */
  /* calculate xy from lat/lon */
  /* Constants, identical to inverse transform function */
  function forward$l(p) {
    var gfi, u, deltav, s, d, eps, ro;
    var lon = p.x;
    var lat = p.y;
    var delta_lon = adjust_lon(lon - this.long0);
    /* Transformation */
    gfi = Math.pow(((1 + this.e * Math.sin(lat)) / (1 - this.e * Math.sin(lat))), (this.alfa * this.e / 2));
    u = 2 * (Math.atan(this.k * Math.pow(Math.tan(lat / 2 + this.s45), this.alfa) / gfi) - this.s45);
    deltav = -delta_lon * this.alfa;
    s = Math.asin(Math.cos(this.ad) * Math.sin(u) + Math.sin(this.ad) * Math.cos(u) * Math.cos(deltav));
    d = Math.asin(Math.cos(u) * Math.sin(deltav) / Math.cos(s));
    eps = this.n * d;
    ro = this.ro0 * Math.pow(Math.tan(this.s0 / 2 + this.s45), this.n) / Math.pow(Math.tan(s / 2 + this.s45), this.n);
    p.y = ro * Math.cos(eps) / 1;
    p.x = ro * Math.sin(eps) / 1;

    if (!this.czech) {
      p.y *= -1;
      p.x *= -1;
    }
    return (p);
  }

  /* calculate lat/lon from xy */
  function inverse$l(p) {
    var u, deltav, s, d, eps, ro, fi1;
    var ok;

    /* Transformation */
    /* revert y, x */
    var tmp = p.x;
    p.x = p.y;
    p.y = tmp;
    if (!this.czech) {
      p.y *= -1;
      p.x *= -1;
    }
    ro = Math.sqrt(p.x * p.x + p.y * p.y);
    eps = Math.atan2(p.y, p.x);
    d = eps / Math.sin(this.s0);
    s = 2 * (Math.atan(Math.pow(this.ro0 / ro, 1 / this.n) * Math.tan(this.s0 / 2 + this.s45)) - this.s45);
    u = Math.asin(Math.cos(this.ad) * Math.sin(s) - Math.sin(this.ad) * Math.cos(s) * Math.cos(d));
    deltav = Math.asin(Math.cos(s) * Math.sin(d) / Math.cos(u));
    p.x = this.long0 - deltav / this.alfa;
    fi1 = u;
    ok = 0;
    var iter = 0;
    do {
      p.y = 2 * (Math.atan(Math.pow(this.k, -1 / this.alfa) * Math.pow(Math.tan(u / 2 + this.s45), 1 / this.alfa) * Math.pow((1 + this.e * Math.sin(fi1)) / (1 - this.e * Math.sin(fi1)), this.e / 2)) - this.s45);
      if (Math.abs(fi1 - p.y) < 0.0000000001) {
        ok = 1;
      }
      fi1 = p.y;
      iter += 1;
    } while (ok === 0 && iter < 15);
    if (iter >= 15) {
      return null;
    }

    return (p);
  }

  var names$m = ['Krovak', 'krovak'];
  var krovak = {
    init: init$m,
    forward: forward$l,
    inverse: inverse$l,
    names: names$m
  };

  function mlfn (e0, e1, e2, e3, phi) {
    return (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi));
  }

  function e0fn (x) {
    return (1 - 0.25 * x * (1 + x / 16 * (3 + 1.25 * x)));
  }

  function e1fn (x) {
    return (0.375 * x * (1 + 0.25 * x * (1 + 0.46875 * x)));
  }

  function e2fn (x) {
    return (0.05859375 * x * x * (1 + 0.75 * x));
  }

  function e3fn (x) {
    return (x * x * x * (35 / 3072));
  }

  function gN (a, e, sinphi) {
    var temp = e * sinphi;
    return a / Math.sqrt(1 - temp * temp);
  }

  function adjust_lat (x) {
    return (Math.abs(x) < HALF_PI) ? x : (x - (sign(x) * Math.PI));
  }

  function imlfn (ml, e0, e1, e2, e3) {
    var phi;
    var dphi;

    phi = ml / e0;
    for (var i = 0; i < 15; i++) {
      dphi = (ml - (e0 * phi - e1 * Math.sin(2 * phi) + e2 * Math.sin(4 * phi) - e3 * Math.sin(6 * phi))) / (e0 - 2 * e1 * Math.cos(2 * phi) + 4 * e2 * Math.cos(4 * phi) - 6 * e3 * Math.cos(6 * phi));
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }

    // ..reportError("IMLFN-CONV:Latitude failed to converge after 15 iterations");
    return NaN;
  }

  function init$l() {
    if (!this.sphere) {
      this.e0 = e0fn(this.es);
      this.e1 = e1fn(this.es);
      this.e2 = e2fn(this.es);
      this.e3 = e3fn(this.es);
      this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
    }
  }

  /* Cassini forward equations--mapping lat,long to x,y
    ----------------------------------------------------------------------- */
  function forward$k(p) {
    /* Forward equations
        ----------------- */
    var x, y;
    var lam = p.x;
    var phi = p.y;
    lam = adjust_lon(lam - this.long0);

    if (this.sphere) {
      x = this.a * Math.asin(Math.cos(phi) * Math.sin(lam));
      y = this.a * (Math.atan2(Math.tan(phi), Math.cos(lam)) - this.lat0);
    } else {
      // ellipsoid
      var sinphi = Math.sin(phi);
      var cosphi = Math.cos(phi);
      var nl = gN(this.a, this.e, sinphi);
      var tl = Math.tan(phi) * Math.tan(phi);
      var al = lam * Math.cos(phi);
      var asq = al * al;
      var cl = this.es * cosphi * cosphi / (1 - this.es);
      var ml = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);

      x = nl * al * (1 - asq * tl * (1 / 6 - (8 - tl + 8 * cl) * asq / 120));
      y = ml - this.ml0 + nl * sinphi / cosphi * asq * (0.5 + (5 - tl + 6 * cl) * asq / 24);
    }

    p.x = x + this.x0;
    p.y = y + this.y0;
    return p;
  }

  /* Inverse equations
    ----------------- */
  function inverse$k(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var x = p.x / this.a;
    var y = p.y / this.a;
    var phi, lam;

    if (this.sphere) {
      var dd = y + this.lat0;
      phi = Math.asin(Math.sin(dd) * Math.cos(x));
      lam = Math.atan2(Math.tan(x), Math.cos(dd));
    } else {
      /* ellipsoid */
      var ml1 = this.ml0 / this.a + y;
      var phi1 = imlfn(ml1, this.e0, this.e1, this.e2, this.e3);
      if (Math.abs(Math.abs(phi1) - HALF_PI) <= EPSLN) {
        p.x = this.long0;
        p.y = HALF_PI;
        if (y < 0) {
          p.y *= -1;
        }
        return p;
      }
      var nl1 = gN(this.a, this.e, Math.sin(phi1));

      var rl1 = nl1 * nl1 * nl1 / this.a / this.a * (1 - this.es);
      var tl1 = Math.pow(Math.tan(phi1), 2);
      var dl = x * this.a / nl1;
      var dsq = dl * dl;
      phi = phi1 - nl1 * Math.tan(phi1) / rl1 * dl * dl * (0.5 - (1 + 3 * tl1) * dl * dl / 24);
      lam = dl * (1 - dsq * (tl1 / 3 + (1 + 3 * tl1) * tl1 * dsq / 15)) / Math.cos(phi1);
    }

    p.x = adjust_lon(lam + this.long0);
    p.y = adjust_lat(phi);
    return p;
  }

  var names$l = ['Cassini', 'Cassini_Soldner', 'cass'];
  var cass = {
    init: init$l,
    forward: forward$k,
    inverse: inverse$k,
    names: names$l
  };

  function qsfnz (eccent, sinphi) {
    var con;
    if (eccent > 1.0e-7) {
      con = eccent * sinphi;
      return ((1 - eccent * eccent) * (sinphi / (1 - con * con) - (0.5 / eccent) * Math.log((1 - con) / (1 + con))));
    } else {
      return (2 * sinphi);
    }
  }

  /*
    reference
      "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
      The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
    */

  var S_POLE = 1;

  var N_POLE = 2;
  var EQUIT = 3;
  var OBLIQ = 4;

  /* Initialize the Lambert Azimuthal Equal Area projection
    ------------------------------------------------------ */
  function init$k() {
    var t = Math.abs(this.lat0);
    if (Math.abs(t - HALF_PI) < EPSLN) {
      this.mode = this.lat0 < 0 ? this.S_POLE : this.N_POLE;
    } else if (Math.abs(t) < EPSLN) {
      this.mode = this.EQUIT;
    } else {
      this.mode = this.OBLIQ;
    }
    if (this.es > 0) {
      var sinphi;

      this.qp = qsfnz(this.e, 1);
      this.mmf = 0.5 / (1 - this.es);
      this.apa = authset(this.es);
      switch (this.mode) {
        case this.N_POLE:
          this.dd = 1;
          break;
        case this.S_POLE:
          this.dd = 1;
          break;
        case this.EQUIT:
          this.rq = Math.sqrt(0.5 * this.qp);
          this.dd = 1 / this.rq;
          this.xmf = 1;
          this.ymf = 0.5 * this.qp;
          break;
        case this.OBLIQ:
          this.rq = Math.sqrt(0.5 * this.qp);
          sinphi = Math.sin(this.lat0);
          this.sinb1 = qsfnz(this.e, sinphi) / this.qp;
          this.cosb1 = Math.sqrt(1 - this.sinb1 * this.sinb1);
          this.dd = Math.cos(this.lat0) / (Math.sqrt(1 - this.es * sinphi * sinphi) * this.rq * this.cosb1);
          this.ymf = (this.xmf = this.rq) / this.dd;
          this.xmf *= this.dd;
          break;
      }
    } else {
      if (this.mode === this.OBLIQ) {
        this.sinph0 = Math.sin(this.lat0);
        this.cosph0 = Math.cos(this.lat0);
      }
    }
  }

  /* Lambert Azimuthal Equal Area forward equations--mapping lat,long to x,y
    ----------------------------------------------------------------------- */
  function forward$j(p) {
    /* Forward equations
        ----------------- */
    var x, y, coslam, sinlam, sinphi, q, sinb, cosb, b, cosphi;
    var lam = p.x;
    var phi = p.y;

    lam = adjust_lon(lam - this.long0);
    if (this.sphere) {
      sinphi = Math.sin(phi);
      cosphi = Math.cos(phi);
      coslam = Math.cos(lam);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        y = (this.mode === this.EQUIT) ? 1 + cosphi * coslam : 1 + this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
        if (y <= EPSLN) {
          return null;
        }
        y = Math.sqrt(2 / y);
        x = y * cosphi * Math.sin(lam);
        y *= (this.mode === this.EQUIT) ? sinphi : this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
      } else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
        if (this.mode === this.N_POLE) {
          coslam = -coslam;
        }
        if (Math.abs(phi + this.lat0) < EPSLN) {
          return null;
        }
        y = FORTPI - phi * 0.5;
        y = 2 * ((this.mode === this.S_POLE) ? Math.cos(y) : Math.sin(y));
        x = y * Math.sin(lam);
        y *= coslam;
      }
    } else {
      sinb = 0;
      cosb = 0;
      b = 0;
      coslam = Math.cos(lam);
      sinlam = Math.sin(lam);
      sinphi = Math.sin(phi);
      q = qsfnz(this.e, sinphi);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        sinb = q / this.qp;
        cosb = Math.sqrt(1 - sinb * sinb);
      }
      switch (this.mode) {
        case this.OBLIQ:
          b = 1 + this.sinb1 * sinb + this.cosb1 * cosb * coslam;
          break;
        case this.EQUIT:
          b = 1 + cosb * coslam;
          break;
        case this.N_POLE:
          b = HALF_PI + phi;
          q = this.qp - q;
          break;
        case this.S_POLE:
          b = phi - HALF_PI;
          q = this.qp + q;
          break;
      }
      if (Math.abs(b) < EPSLN) {
        return null;
      }
      switch (this.mode) {
        case this.OBLIQ:
        case this.EQUIT:
          b = Math.sqrt(2 / b);
          if (this.mode === this.OBLIQ) {
            y = this.ymf * b * (this.cosb1 * sinb - this.sinb1 * cosb * coslam);
          } else {
            y = (b = Math.sqrt(2 / (1 + cosb * coslam))) * sinb * this.ymf;
          }
          x = this.xmf * b * cosb * sinlam;
          break;
        case this.N_POLE:
        case this.S_POLE:
          if (q >= 0) {
            x = (b = Math.sqrt(q)) * sinlam;
            y = coslam * ((this.mode === this.S_POLE) ? b : -b);
          } else {
            x = y = 0;
          }
          break;
      }
    }

    p.x = this.a * x + this.x0;
    p.y = this.a * y + this.y0;
    return p;
  }

  /* Inverse equations
    ----------------- */
  function inverse$j(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var x = p.x / this.a;
    var y = p.y / this.a;
    var lam, phi, cCe, sCe, q, rho, ab;
    if (this.sphere) {
      var cosz = 0,
        rh, sinz = 0;

      rh = Math.sqrt(x * x + y * y);
      phi = rh * 0.5;
      if (phi > 1) {
        return null;
      }
      phi = 2 * Math.asin(phi);
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        sinz = Math.sin(phi);
        cosz = Math.cos(phi);
      }
      switch (this.mode) {
        case this.EQUIT:
          phi = (Math.abs(rh) <= EPSLN) ? 0 : Math.asin(y * sinz / rh);
          x *= sinz;
          y = cosz * rh;
          break;
        case this.OBLIQ:
          phi = (Math.abs(rh) <= EPSLN) ? this.lat0 : Math.asin(cosz * this.sinph0 + y * sinz * this.cosph0 / rh);
          x *= sinz * this.cosph0;
          y = (cosz - Math.sin(phi) * this.sinph0) * rh;
          break;
        case this.N_POLE:
          y = -y;
          phi = HALF_PI - phi;
          break;
        case this.S_POLE:
          phi -= HALF_PI;
          break;
      }
      lam = (y === 0 && (this.mode === this.EQUIT || this.mode === this.OBLIQ)) ? 0 : Math.atan2(x, y);
    } else {
      ab = 0;
      if (this.mode === this.OBLIQ || this.mode === this.EQUIT) {
        x /= this.dd;
        y *= this.dd;
        rho = Math.sqrt(x * x + y * y);
        if (rho < EPSLN) {
          p.x = this.long0;
          p.y = this.lat0;
          return p;
        }
        sCe = 2 * Math.asin(0.5 * rho / this.rq);
        cCe = Math.cos(sCe);
        x *= (sCe = Math.sin(sCe));
        if (this.mode === this.OBLIQ) {
          ab = cCe * this.sinb1 + y * sCe * this.cosb1 / rho;
          q = this.qp * ab;
          y = rho * this.cosb1 * cCe - y * this.sinb1 * sCe;
        } else {
          ab = y * sCe / rho;
          q = this.qp * ab;
          y = rho * cCe;
        }
      } else if (this.mode === this.N_POLE || this.mode === this.S_POLE) {
        if (this.mode === this.N_POLE) {
          y = -y;
        }
        q = (x * x + y * y);
        if (!q) {
          p.x = this.long0;
          p.y = this.lat0;
          return p;
        }
        ab = 1 - q / this.qp;
        if (this.mode === this.S_POLE) {
          ab = -ab;
        }
      }
      lam = Math.atan2(x, y);
      phi = authlat(Math.asin(ab), this.apa);
    }

    p.x = adjust_lon(this.long0 + lam);
    p.y = phi;
    return p;
  }

  /* determine latitude from authalic latitude */
  var P00 = 0.33333333333333333333;

  var P01 = 0.17222222222222222222;
  var P02 = 0.10257936507936507936;
  var P10 = 0.06388888888888888888;
  var P11 = 0.06640211640211640211;
  var P20 = 0.01641501294219154443;

  function authset(es) {
    var t;
    var APA = [];
    APA[0] = es * P00;
    t = es * es;
    APA[0] += t * P01;
    APA[1] = t * P10;
    t *= es;
    APA[0] += t * P02;
    APA[1] += t * P11;
    APA[2] = t * P20;
    return APA;
  }

  function authlat(beta, APA) {
    var t = beta + beta;
    return (beta + APA[0] * Math.sin(t) + APA[1] * Math.sin(t + t) + APA[2] * Math.sin(t + t + t));
  }

  var names$k = ['Lambert Azimuthal Equal Area', 'Lambert_Azimuthal_Equal_Area', 'laea'];
  var laea = {
    init: init$k,
    forward: forward$j,
    inverse: inverse$j,
    names: names$k,
    S_POLE: S_POLE,
    N_POLE: N_POLE,
    EQUIT: EQUIT,
    OBLIQ: OBLIQ
  };

  function asinz (x) {
    if (Math.abs(x) > 1) {
      x = (x > 1) ? 1 : -1;
    }
    return Math.asin(x);
  }

  function init$j() {
    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2);
    this.e3 = Math.sqrt(this.es);

    this.sin_po = Math.sin(this.lat1);
    this.cos_po = Math.cos(this.lat1);
    this.t1 = this.sin_po;
    this.con = this.sin_po;
    this.ms1 = msfnz(this.e3, this.sin_po, this.cos_po);
    this.qs1 = qsfnz(this.e3, this.sin_po);

    this.sin_po = Math.sin(this.lat2);
    this.cos_po = Math.cos(this.lat2);
    this.t2 = this.sin_po;
    this.ms2 = msfnz(this.e3, this.sin_po, this.cos_po);
    this.qs2 = qsfnz(this.e3, this.sin_po);

    this.sin_po = Math.sin(this.lat0);
    this.cos_po = Math.cos(this.lat0);
    this.t3 = this.sin_po;
    this.qs0 = qsfnz(this.e3, this.sin_po);

    if (Math.abs(this.lat1 - this.lat2) > EPSLN) {
      this.ns0 = (this.ms1 * this.ms1 - this.ms2 * this.ms2) / (this.qs2 - this.qs1);
    } else {
      this.ns0 = this.con;
    }
    this.c = this.ms1 * this.ms1 + this.ns0 * this.qs1;
    this.rh = this.a * Math.sqrt(this.c - this.ns0 * this.qs0) / this.ns0;
  }

  /* Albers Conical Equal Area forward equations--mapping lat,long to x,y
    ------------------------------------------------------------------- */
  function forward$i(p) {
    var lon = p.x;
    var lat = p.y;

    this.sin_phi = Math.sin(lat);
    this.cos_phi = Math.cos(lat);

    var qs = qsfnz(this.e3, this.sin_phi);
    var rh1 = this.a * Math.sqrt(this.c - this.ns0 * qs) / this.ns0;
    var theta = this.ns0 * adjust_lon(lon - this.long0);
    var x = rh1 * Math.sin(theta) + this.x0;
    var y = this.rh - rh1 * Math.cos(theta) + this.y0;

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$i(p) {
    var rh1, qs, con, theta, lon, lat;

    p.x -= this.x0;
    p.y = this.rh - p.y + this.y0;
    if (this.ns0 >= 0) {
      rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
      con = 1;
    } else {
      rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
      con = -1;
    }
    theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2(con * p.x, con * p.y);
    }
    con = rh1 * this.ns0 / this.a;
    if (this.sphere) {
      lat = Math.asin((this.c - con * con) / (2 * this.ns0));
    } else {
      qs = (this.c - con * con) / this.ns0;
      lat = this.phi1z(this.e3, qs);
    }

    lon = adjust_lon(theta / this.ns0 + this.long0);
    p.x = lon;
    p.y = lat;
    return p;
  }

  /* Function to compute phi1, the latitude for the inverse of the
     Albers Conical Equal-Area projection.
  ------------------------------------------- */
  function phi1z(eccent, qs) {
    var sinphi, cosphi, con, com, dphi;
    var phi = asinz(0.5 * qs);
    if (eccent < EPSLN) {
      return phi;
    }

    var eccnts = eccent * eccent;
    for (var i = 1; i <= 25; i++) {
      sinphi = Math.sin(phi);
      cosphi = Math.cos(phi);
      con = eccent * sinphi;
      com = 1 - con * con;
      dphi = 0.5 * com * com / cosphi * (qs / (1 - eccnts) - sinphi / com + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
      phi = phi + dphi;
      if (Math.abs(dphi) <= 1e-7) {
        return phi;
      }
    }
    return null;
  }

  var names$j = ['Albers_Conic_Equal_Area', 'Albers_Equal_Area', 'Albers', 'aea'];
  var aea = {
    init: init$j,
    forward: forward$i,
    inverse: inverse$i,
    names: names$j,
    phi1z: phi1z
  };

  /*
    reference:
      Wolfram Mathworld "Gnomonic Projection"
      http://mathworld.wolfram.com/GnomonicProjection.html
      Accessed: 12th November 2009
    */
  function init$i() {
    /* Place parameters in static storage for common use
        ------------------------------------------------- */
    this.sin_p14 = Math.sin(this.lat0);
    this.cos_p14 = Math.cos(this.lat0);
    // Approximation for projecting points to the horizon (infinity)
    this.infinity_dist = 1000 * this.a;
    this.rc = 1;
  }

  /* Gnomonic forward equations--mapping lat,long to x,y
      --------------------------------------------------- */
  function forward$h(p) {
    var sinphi, cosphi; /* sin and cos value        */
    var dlon; /* delta longitude value      */
    var coslon; /* cos of longitude        */
    var ksp; /* scale factor          */
    var g;
    var x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        ----------------- */
    dlon = adjust_lon(lon - this.long0);

    sinphi = Math.sin(lat);
    cosphi = Math.cos(lat);

    coslon = Math.cos(dlon);
    g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
    ksp = 1;
    if ((g > 0) || (Math.abs(g) <= EPSLN)) {
      x = this.x0 + this.a * ksp * cosphi * Math.sin(dlon) / g;
      y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon) / g;
    } else {
      // Point is in the opposing hemisphere and is unprojectable
      // We still need to return a reasonable point, so we project
      // to infinity, on a bearing
      // equivalent to the northern hemisphere equivalent
      // This is a reasonable approximation for short shapes and lines that
      // straddle the horizon.

      x = this.x0 + this.infinity_dist * cosphi * Math.sin(dlon);
      y = this.y0 + this.infinity_dist * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);
    }
    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$h(p) {
    var rh; /* Rho */
    var sinc, cosc;
    var c;
    var lon, lat;

    /* Inverse equations
        ----------------- */
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    p.x /= this.k0;
    p.y /= this.k0;

    if ((rh = Math.sqrt(p.x * p.x + p.y * p.y))) {
      c = Math.atan2(rh, this.rc);
      sinc = Math.sin(c);
      cosc = Math.cos(c);

      lat = asinz(cosc * this.sin_p14 + (p.y * sinc * this.cos_p14) / rh);
      lon = Math.atan2(p.x * sinc, rh * this.cos_p14 * cosc - p.y * this.sin_p14 * sinc);
      lon = adjust_lon(this.long0 + lon);
    } else {
      lat = this.phic0;
      lon = 0;
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$i = ['gnom'];
  var gnom = {
    init: init$i,
    forward: forward$h,
    inverse: inverse$h,
    names: names$i
  };

  function iqsfnz (eccent, q) {
    var temp = 1 - (1 - eccent * eccent) / (2 * eccent) * Math.log((1 - eccent) / (1 + eccent));
    if (Math.abs(Math.abs(q) - temp) < 1.0E-6) {
      if (q < 0) {
        return (-1 * HALF_PI);
      } else {
        return HALF_PI;
      }
    }
    // var phi = 0.5* q/(1-eccent*eccent);
    var phi = Math.asin(0.5 * q);
    var dphi;
    var sin_phi;
    var cos_phi;
    var con;
    for (var i = 0; i < 30; i++) {
      sin_phi = Math.sin(phi);
      cos_phi = Math.cos(phi);
      con = eccent * sin_phi;
      dphi = Math.pow(1 - con * con, 2) / (2 * cos_phi) * (q / (1 - eccent * eccent) - sin_phi / (1 - con * con) + 0.5 / eccent * Math.log((1 - con) / (1 + con)));
      phi += dphi;
      if (Math.abs(dphi) <= 0.0000000001) {
        return phi;
      }
    }

    // console.log("IQSFN-CONV:Latitude failed to converge after 30 iterations");
    return NaN;
  }

  /*
    reference:
      "Cartographic Projection Procedures for the UNIX Environment-
      A User's Manual" by Gerald I. Evenden,
      USGS Open File Report 90-284and Release 4 Interim Reports (2003)
  */
  function init$h() {
    // no-op
    if (!this.sphere) {
      this.k0 = msfnz(this.e, Math.sin(this.lat_ts), Math.cos(this.lat_ts));
    }
  }

  /* Cylindrical Equal Area forward equations--mapping lat,long to x,y
      ------------------------------------------------------------ */
  function forward$g(p) {
    var lon = p.x;
    var lat = p.y;
    var x, y;
    /* Forward equations
        ----------------- */
    var dlon = adjust_lon(lon - this.long0);
    if (this.sphere) {
      x = this.x0 + this.a * dlon * Math.cos(this.lat_ts);
      y = this.y0 + this.a * Math.sin(lat) / Math.cos(this.lat_ts);
    } else {
      var qs = qsfnz(this.e, Math.sin(lat));
      x = this.x0 + this.a * this.k0 * dlon;
      y = this.y0 + this.a * qs * 0.5 / this.k0;
    }

    p.x = x;
    p.y = y;
    return p;
  }

  /* Cylindrical Equal Area inverse equations--mapping x,y to lat/long
      ------------------------------------------------------------ */
  function inverse$g(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var lon, lat;

    if (this.sphere) {
      lon = adjust_lon(this.long0 + (p.x / this.a) / Math.cos(this.lat_ts));
      lat = Math.asin((p.y / this.a) * Math.cos(this.lat_ts));
    } else {
      lat = iqsfnz(this.e, 2 * p.y * this.k0 / this.a);
      lon = adjust_lon(this.long0 + p.x / (this.a * this.k0));
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$h = ['cea'];
  var cea = {
    init: init$h,
    forward: forward$g,
    inverse: inverse$g,
    names: names$h
  };

  function init$g() {
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;
    this.lat_ts = this.lat_ts || 0;
    this.title = this.title || 'Equidistant Cylindrical (Plate Carre)';

    this.rc = Math.cos(this.lat_ts);
  }

  // forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$f(p) {
    var lon = p.x;
    var lat = p.y;

    var dlon = adjust_lon(lon - this.long0);
    var dlat = adjust_lat(lat - this.lat0);
    p.x = this.x0 + (this.a * dlon * this.rc);
    p.y = this.y0 + (this.a * dlat);
    return p;
  }

  // inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$f(p) {
    var x = p.x;
    var y = p.y;

    p.x = adjust_lon(this.long0 + ((x - this.x0) / (this.a * this.rc)));
    p.y = adjust_lat(this.lat0 + ((y - this.y0) / (this.a)));
    return p;
  }

  var names$g = ['Equirectangular', 'Equidistant_Cylindrical', 'Equidistant_Cylindrical_Spherical', 'eqc'];
  var eqc = {
    init: init$g,
    forward: forward$f,
    inverse: inverse$f,
    names: names$g
  };

  var MAX_ITER$1 = 20;

  function init$f() {
    /* Place parameters in static storage for common use
        ------------------------------------------------- */
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2); // devait etre dans tmerc.js mais n y est pas donc je commente sinon retour de valeurs nulles
    this.e = Math.sqrt(this.es);
    this.e0 = e0fn(this.es);
    this.e1 = e1fn(this.es);
    this.e2 = e2fn(this.es);
    this.e3 = e3fn(this.es);
    this.ml0 = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0); // si que des zeros le calcul ne se fait pas
  }

  /* Polyconic forward equations--mapping lat,long to x,y
      --------------------------------------------------- */
  function forward$e(p) {
    var lon = p.x;
    var lat = p.y;
    var x, y, el;
    var dlon = adjust_lon(lon - this.long0);
    el = dlon * Math.sin(lat);
    if (this.sphere) {
      if (Math.abs(lat) <= EPSLN) {
        x = this.a * dlon;
        y = -1 * this.a * this.lat0;
      } else {
        x = this.a * Math.sin(el) / Math.tan(lat);
        y = this.a * (adjust_lat(lat - this.lat0) + (1 - Math.cos(el)) / Math.tan(lat));
      }
    } else {
      if (Math.abs(lat) <= EPSLN) {
        x = this.a * dlon;
        y = -1 * this.ml0;
      } else {
        var nl = gN(this.a, this.e, Math.sin(lat)) / Math.tan(lat);
        x = nl * Math.sin(el);
        y = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, lat) - this.ml0 + nl * (1 - Math.cos(el));
      }
    }
    p.x = x + this.x0;
    p.y = y + this.y0;
    return p;
  }

  /* Inverse equations
    ----------------- */
  function inverse$e(p) {
    var lon, lat, x, y, i;
    var al, bl;
    var phi, dphi;
    x = p.x - this.x0;
    y = p.y - this.y0;

    if (this.sphere) {
      if (Math.abs(y + this.a * this.lat0) <= EPSLN) {
        lon = adjust_lon(x / this.a + this.long0);
        lat = 0;
      } else {
        al = this.lat0 + y / this.a;
        bl = x * x / this.a / this.a + al * al;
        phi = al;
        var tanphi;
        for (i = MAX_ITER$1; i; --i) {
          tanphi = Math.tan(phi);
          dphi = -1 * (al * (phi * tanphi + 1) - phi - 0.5 * (phi * phi + bl) * tanphi) / ((phi - al) / tanphi - 1);
          phi += dphi;
          if (Math.abs(dphi) <= EPSLN) {
            lat = phi;
            break;
          }
        }
        lon = adjust_lon(this.long0 + (Math.asin(x * Math.tan(phi) / this.a)) / Math.sin(lat));
      }
    } else {
      if (Math.abs(y + this.ml0) <= EPSLN) {
        lat = 0;
        lon = adjust_lon(this.long0 + x / this.a);
      } else {
        al = (this.ml0 + y) / this.a;
        bl = x * x / this.a / this.a + al * al;
        phi = al;
        var cl, mln, mlnp, ma;
        var con;
        for (i = MAX_ITER$1; i; --i) {
          con = this.e * Math.sin(phi);
          cl = Math.sqrt(1 - con * con) * Math.tan(phi);
          mln = this.a * mlfn(this.e0, this.e1, this.e2, this.e3, phi);
          mlnp = this.e0 - 2 * this.e1 * Math.cos(2 * phi) + 4 * this.e2 * Math.cos(4 * phi) - 6 * this.e3 * Math.cos(6 * phi);
          ma = mln / this.a;
          dphi = (al * (cl * ma + 1) - ma - 0.5 * cl * (ma * ma + bl)) / (this.es * Math.sin(2 * phi) * (ma * ma + bl - 2 * al * ma) / (4 * cl) + (al - ma) * (cl * mlnp - 2 / Math.sin(2 * phi)) - mlnp);
          phi -= dphi;
          if (Math.abs(dphi) <= EPSLN) {
            lat = phi;
            break;
          }
        }

        // lat=phi4z(this.e,this.e0,this.e1,this.e2,this.e3,al,bl,0,0);
        cl = Math.sqrt(1 - this.es * Math.pow(Math.sin(lat), 2)) * Math.tan(lat);
        lon = adjust_lon(this.long0 + Math.asin(x * cl / this.a) / Math.sin(lat));
      }
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$f = ['Polyconic', 'American_Polyconic', 'poly'];
  var poly = {
    init: init$f,
    forward: forward$e,
    inverse: inverse$e,
    names: names$f
  };

  function init$e() {
    this.A = [];
    this.A[1] = 0.6399175073;
    this.A[2] = -0.1358797613;
    this.A[3] = 0.063294409;
    this.A[4] = -0.02526853;
    this.A[5] = 0.0117879;
    this.A[6] = -55161e-7;
    this.A[7] = 0.0026906;
    this.A[8] = -1333e-6;
    this.A[9] = 0.00067;
    this.A[10] = -34e-5;

    this.B_re = [];
    this.B_im = [];
    this.B_re[1] = 0.7557853228;
    this.B_im[1] = 0;
    this.B_re[2] = 0.249204646;
    this.B_im[2] = 0.003371507;
    this.B_re[3] = -1541739e-9;
    this.B_im[3] = 0.041058560;
    this.B_re[4] = -0.10162907;
    this.B_im[4] = 0.01727609;
    this.B_re[5] = -0.26623489;
    this.B_im[5] = -0.36249218;
    this.B_re[6] = -0.6870983;
    this.B_im[6] = -1.1651967;

    this.C_re = [];
    this.C_im = [];
    this.C_re[1] = 1.3231270439;
    this.C_im[1] = 0;
    this.C_re[2] = -0.577245789;
    this.C_im[2] = -7809598e-9;
    this.C_re[3] = 0.508307513;
    this.C_im[3] = -0.112208952;
    this.C_re[4] = -0.15094762;
    this.C_im[4] = 0.18200602;
    this.C_re[5] = 1.01418179;
    this.C_im[5] = 1.64497696;
    this.C_re[6] = 1.9660549;
    this.C_im[6] = 2.5127645;

    this.D = [];
    this.D[1] = 1.5627014243;
    this.D[2] = 0.5185406398;
    this.D[3] = -0.03333098;
    this.D[4] = -0.1052906;
    this.D[5] = -0.0368594;
    this.D[6] = 0.007317;
    this.D[7] = 0.01220;
    this.D[8] = 0.00394;
    this.D[9] = -13e-4;
  }

  /**
      New Zealand Map Grid Forward  - long/lat to x/y
      long/lat in radians
    */
  function forward$d(p) {
    var n;
    var lon = p.x;
    var lat = p.y;

    var delta_lat = lat - this.lat0;
    var delta_lon = lon - this.long0;

    // 1. Calculate d_phi and d_psi    ...                          // and d_lambda
    // For this algorithm, delta_latitude is in seconds of arc x 10-5, so we need to scale to those units. Longitude is radians.
    var d_phi = delta_lat / SEC_TO_RAD * 1E-5;
    var d_lambda = delta_lon;
    var d_phi_n = 1; // d_phi^0

    var d_psi = 0;
    for (n = 1; n <= 10; n++) {
      d_phi_n = d_phi_n * d_phi;
      d_psi = d_psi + this.A[n] * d_phi_n;
    }

    // 2. Calculate theta
    var th_re = d_psi;
    var th_im = d_lambda;

    // 3. Calculate z
    var th_n_re = 1;
    var th_n_im = 0; // theta^0
    var th_n_re1;
    var th_n_im1;

    var z_re = 0;
    var z_im = 0;
    for (n = 1; n <= 6; n++) {
      th_n_re1 = th_n_re * th_re - th_n_im * th_im;
      th_n_im1 = th_n_im * th_re + th_n_re * th_im;
      th_n_re = th_n_re1;
      th_n_im = th_n_im1;
      z_re = z_re + this.B_re[n] * th_n_re - this.B_im[n] * th_n_im;
      z_im = z_im + this.B_im[n] * th_n_re + this.B_re[n] * th_n_im;
    }

    // 4. Calculate easting and northing
    p.x = (z_im * this.a) + this.x0;
    p.y = (z_re * this.a) + this.y0;

    return p;
  }

  /**
      New Zealand Map Grid Inverse  -  x/y to long/lat
    */
  function inverse$d(p) {
    var n;
    var x = p.x;
    var y = p.y;

    var delta_x = x - this.x0;
    var delta_y = y - this.y0;

    // 1. Calculate z
    var z_re = delta_y / this.a;
    var z_im = delta_x / this.a;

    // 2a. Calculate theta - first approximation gives km accuracy
    var z_n_re = 1;
    var z_n_im = 0; // z^0
    var z_n_re1;
    var z_n_im1;

    var th_re = 0;
    var th_im = 0;
    for (n = 1; n <= 6; n++) {
      z_n_re1 = z_n_re * z_re - z_n_im * z_im;
      z_n_im1 = z_n_im * z_re + z_n_re * z_im;
      z_n_re = z_n_re1;
      z_n_im = z_n_im1;
      th_re = th_re + this.C_re[n] * z_n_re - this.C_im[n] * z_n_im;
      th_im = th_im + this.C_im[n] * z_n_re + this.C_re[n] * z_n_im;
    }

    // 2b. Iterate to refine the accuracy of the calculation
    //        0 iterations gives km accuracy
    //        1 iteration gives m accuracy -- good enough for most mapping applications
    //        2 iterations bives mm accuracy
    for (var i = 0; i < this.iterations; i++) {
      var th_n_re = th_re;
      var th_n_im = th_im;
      var th_n_re1;
      var th_n_im1;

      var num_re = z_re;
      var num_im = z_im;
      for (n = 2; n <= 6; n++) {
        th_n_re1 = th_n_re * th_re - th_n_im * th_im;
        th_n_im1 = th_n_im * th_re + th_n_re * th_im;
        th_n_re = th_n_re1;
        th_n_im = th_n_im1;
        num_re = num_re + (n - 1) * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
        num_im = num_im + (n - 1) * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
      }

      th_n_re = 1;
      th_n_im = 0;
      var den_re = this.B_re[1];
      var den_im = this.B_im[1];
      for (n = 2; n <= 6; n++) {
        th_n_re1 = th_n_re * th_re - th_n_im * th_im;
        th_n_im1 = th_n_im * th_re + th_n_re * th_im;
        th_n_re = th_n_re1;
        th_n_im = th_n_im1;
        den_re = den_re + n * (this.B_re[n] * th_n_re - this.B_im[n] * th_n_im);
        den_im = den_im + n * (this.B_im[n] * th_n_re + this.B_re[n] * th_n_im);
      }

      // Complex division
      var den2 = den_re * den_re + den_im * den_im;
      th_re = (num_re * den_re + num_im * den_im) / den2;
      th_im = (num_im * den_re - num_re * den_im) / den2;
    }

    // 3. Calculate d_phi              ...                                    // and d_lambda
    var d_psi = th_re;
    var d_lambda = th_im;
    var d_psi_n = 1; // d_psi^0

    var d_phi = 0;
    for (n = 1; n <= 9; n++) {
      d_psi_n = d_psi_n * d_psi;
      d_phi = d_phi + this.D[n] * d_psi_n;
    }

    // 4. Calculate latitude and longitude
    // d_phi is calcuated in second of arc * 10^-5, so we need to scale back to radians. d_lambda is in radians.
    var lat = this.lat0 + (d_phi * SEC_TO_RAD * 1E5);
    var lon = this.long0 + d_lambda;

    p.x = lon;
    p.y = lat;

    return p;
  }

  var names$e = ['New_Zealand_Map_Grid', 'nzmg'];
  var nzmg = {
    init: init$e,
    forward: forward$d,
    inverse: inverse$d,
    names: names$e
  };

  /*
    reference
      "New Equal-Area Map Projections for Noncircular Regions", John P. Snyder,
      The American Cartographer, Vol 15, No. 4, October 1988, pp. 341-355.
    */

  /* Initialize the Miller Cylindrical projection
    ------------------------------------------- */
  function init$d() {
    // no-op
  }

  /* Miller Cylindrical forward equations--mapping lat,long to x,y
      ------------------------------------------------------------ */
  function forward$c(p) {
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        ----------------- */
    var dlon = adjust_lon(lon - this.long0);
    var x = this.x0 + this.a * dlon;
    var y = this.y0 + this.a * Math.log(Math.tan((Math.PI / 4) + (lat / 2.5))) * 1.25;

    p.x = x;
    p.y = y;
    return p;
  }

  /* Miller Cylindrical inverse equations--mapping x,y to lat/long
      ------------------------------------------------------------ */
  function inverse$c(p) {
    p.x -= this.x0;
    p.y -= this.y0;

    var lon = adjust_lon(this.long0 + p.x / this.a);
    var lat = 2.5 * (Math.atan(Math.exp(0.8 * p.y / this.a)) - Math.PI / 4);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$d = ['Miller_Cylindrical', 'mill'];
  var mill = {
    init: init$d,
    forward: forward$c,
    inverse: inverse$c,
    names: names$d
  };

  var MAX_ITER = 20;

  function init$c() {
    /* Place parameters in static storage for common use
      ------------------------------------------------- */

    if (!this.sphere) {
      this.en = pj_enfn(this.es);
    } else {
      this.n = 1;
      this.m = 0;
      this.es = 0;
      this.C_y = Math.sqrt((this.m + 1) / this.n);
      this.C_x = this.C_y / (this.m + 1);
    }
  }

  /* Sinusoidal forward equations--mapping lat,long to x,y
    ----------------------------------------------------- */
  function forward$b(p) {
    var x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
      ----------------- */
    lon = adjust_lon(lon - this.long0);

    if (this.sphere) {
      if (!this.m) {
        lat = this.n !== 1 ? Math.asin(this.n * Math.sin(lat)) : lat;
      } else {
        var k = this.n * Math.sin(lat);
        for (var i = MAX_ITER; i; --i) {
          var V = (this.m * lat + Math.sin(lat) - k) / (this.m + Math.cos(lat));
          lat -= V;
          if (Math.abs(V) < EPSLN) {
            break;
          }
        }
      }
      x = this.a * this.C_x * lon * (this.m + Math.cos(lat));
      y = this.a * this.C_y * lat;
    } else {
      var s = Math.sin(lat);
      var c = Math.cos(lat);
      y = this.a * pj_mlfn(lat, s, c, this.en);
      x = this.a * lon * c / Math.sqrt(1 - this.es * s * s);
    }

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$b(p) {
    var lat, temp, lon, s;

    p.x -= this.x0;
    lon = p.x / this.a;
    p.y -= this.y0;
    lat = p.y / this.a;

    if (this.sphere) {
      lat /= this.C_y;
      lon = lon / (this.C_x * (this.m + Math.cos(lat)));
      if (this.m) {
        lat = asinz((this.m * lat + Math.sin(lat)) / this.n);
      } else if (this.n !== 1) {
        lat = asinz(Math.sin(lat) / this.n);
      }
      lon = adjust_lon(lon + this.long0);
      lat = adjust_lat(lat);
    } else {
      lat = pj_inv_mlfn(p.y / this.a, this.es, this.en);
      s = Math.abs(lat);
      if (s < HALF_PI) {
        s = Math.sin(lat);
        temp = this.long0 + p.x * Math.sqrt(1 - this.es * s * s) / (this.a * Math.cos(lat));
        // temp = this.long0 + p.x / (this.a * Math.cos(lat));
        lon = adjust_lon(temp);
      } else if ((s - EPSLN) < HALF_PI) {
        lon = this.long0;
      }
    }
    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$c = ['Sinusoidal', 'sinu'];
  var sinu = {
    init: init$c,
    forward: forward$b,
    inverse: inverse$b,
    names: names$c
  };

  function init$b() {}
  /* Mollweide forward equations--mapping lat,long to x,y
      ---------------------------------------------------- */
  function forward$a(p) {
    /* Forward equations
        ----------------- */
    var lon = p.x;
    var lat = p.y;

    var delta_lon = adjust_lon(lon - this.long0);
    var theta = lat;
    var con = Math.PI * Math.sin(lat);

    /* Iterate using the Newton-Raphson method to find theta
        ----------------------------------------------------- */
    while (true) {
      var delta_theta = -(theta + Math.sin(theta) - con) / (1 + Math.cos(theta));
      theta += delta_theta;
      if (Math.abs(delta_theta) < EPSLN) {
        break;
      }
    }
    theta /= 2;

    /* If the latitude is 90 deg, force the x coordinate to be "0 + false easting"
         this is done here because of precision problems with "cos(theta)"
         -------------------------------------------------------------------------- */
    if (Math.PI / 2 - Math.abs(lat) < EPSLN) {
      delta_lon = 0;
    }
    var x = 0.900316316158 * this.a * delta_lon * Math.cos(theta) + this.x0;
    var y = 1.4142135623731 * this.a * Math.sin(theta) + this.y0;

    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$a(p) {
    var theta;
    var arg;

    /* Inverse equations
        ----------------- */
    p.x -= this.x0;
    p.y -= this.y0;
    arg = p.y / (1.4142135623731 * this.a);

    /* Because of division by zero problems, 'arg' can not be 1.  Therefore
         a number very close to one is used instead.
         ------------------------------------------------------------------- */
    if (Math.abs(arg) > 0.999999999999) {
      arg = 0.999999999999;
    }
    theta = Math.asin(arg);
    var lon = adjust_lon(this.long0 + (p.x / (0.900316316158 * this.a * Math.cos(theta))));
    if (lon < (-Math.PI)) {
      lon = -Math.PI;
    }
    if (lon > Math.PI) {
      lon = Math.PI;
    }
    arg = (2 * theta + Math.sin(2 * theta)) / Math.PI;
    if (Math.abs(arg) > 1) {
      arg = 1;
    }
    var lat = Math.asin(arg);

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$b = ['Mollweide', 'moll'];
  var moll = {
    init: init$b,
    forward: forward$a,
    inverse: inverse$a,
    names: names$b
  };

  function init$a() {
    /* Place parameters in static storage for common use
        ------------------------------------------------- */
    // Standard Parallels cannot be equal and on opposite sides of the equator
    if (Math.abs(this.lat1 + this.lat2) < EPSLN) {
      return;
    }
    this.lat2 = this.lat2 || this.lat1;
    this.temp = this.b / this.a;
    this.es = 1 - Math.pow(this.temp, 2);
    this.e = Math.sqrt(this.es);
    this.e0 = e0fn(this.es);
    this.e1 = e1fn(this.es);
    this.e2 = e2fn(this.es);
    this.e3 = e3fn(this.es);

    this.sinphi = Math.sin(this.lat1);
    this.cosphi = Math.cos(this.lat1);

    this.ms1 = msfnz(this.e, this.sinphi, this.cosphi);
    this.ml1 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat1);

    if (Math.abs(this.lat1 - this.lat2) < EPSLN) {
      this.ns = this.sinphi;
    } else {
      this.sinphi = Math.sin(this.lat2);
      this.cosphi = Math.cos(this.lat2);
      this.ms2 = msfnz(this.e, this.sinphi, this.cosphi);
      this.ml2 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat2);
      this.ns = (this.ms1 - this.ms2) / (this.ml2 - this.ml1);
    }
    this.g = this.ml1 + this.ms1 / this.ns;
    this.ml0 = mlfn(this.e0, this.e1, this.e2, this.e3, this.lat0);
    this.rh = this.a * (this.g - this.ml0);
  }

  /* Equidistant Conic forward equations--mapping lat,long to x,y
    ----------------------------------------------------------- */
  function forward$9(p) {
    var lon = p.x;
    var lat = p.y;
    var rh1;

    /* Forward equations
        ----------------- */
    if (this.sphere) {
      rh1 = this.a * (this.g - lat);
    } else {
      var ml = mlfn(this.e0, this.e1, this.e2, this.e3, lat);
      rh1 = this.a * (this.g - ml);
    }
    var theta = this.ns * adjust_lon(lon - this.long0);
    var x = this.x0 + rh1 * Math.sin(theta);
    var y = this.y0 + this.rh - rh1 * Math.cos(theta);
    p.x = x;
    p.y = y;
    return p;
  }

  /* Inverse equations
    ----------------- */
  function inverse$9(p) {
    p.x -= this.x0;
    p.y = this.rh - p.y + this.y0;
    var con, rh1, lat, lon;
    if (this.ns >= 0) {
      rh1 = Math.sqrt(p.x * p.x + p.y * p.y);
      con = 1;
    } else {
      rh1 = -Math.sqrt(p.x * p.x + p.y * p.y);
      con = -1;
    }
    var theta = 0;
    if (rh1 !== 0) {
      theta = Math.atan2(con * p.x, con * p.y);
    }

    if (this.sphere) {
      lon = adjust_lon(this.long0 + theta / this.ns);
      lat = adjust_lat(this.g - rh1 / this.a);
      p.x = lon;
      p.y = lat;
      return p;
    } else {
      var ml = this.g - rh1 / this.a;
      lat = imlfn(ml, this.e0, this.e1, this.e2, this.e3);
      lon = adjust_lon(this.long0 + theta / this.ns);
      p.x = lon;
      p.y = lat;
      return p;
    }
  }

  var names$a = ['Equidistant_Conic', 'eqdc'];
  var eqdc = {
    init: init$a,
    forward: forward$9,
    inverse: inverse$9,
    names: names$a
  };

  /* Initialize the Van Der Grinten projection
    ---------------------------------------- */
  function init$9() {
    // this.R = 6370997; //Radius of earth
    this.R = this.a;
  }

  function forward$8(p) {
    var lon = p.x;
    var lat = p.y;

    /* Forward equations
      ----------------- */
    var dlon = adjust_lon(lon - this.long0);
    var x, y;

    if (Math.abs(lat) <= EPSLN) {
      x = this.x0 + this.R * dlon;
      y = this.y0;
    }
    var theta = asinz(2 * Math.abs(lat / Math.PI));
    if ((Math.abs(dlon) <= EPSLN) || (Math.abs(Math.abs(lat) - HALF_PI) <= EPSLN)) {
      x = this.x0;
      if (lat >= 0) {
        y = this.y0 + Math.PI * this.R * Math.tan(0.5 * theta);
      } else {
        y = this.y0 + Math.PI * this.R * -Math.tan(0.5 * theta);
      }
      //  return(OK);
    }
    var al = 0.5 * Math.abs((Math.PI / dlon) - (dlon / Math.PI));
    var asq = al * al;
    var sinth = Math.sin(theta);
    var costh = Math.cos(theta);

    var g = costh / (sinth + costh - 1);
    var gsq = g * g;
    var m = g * (2 / sinth - 1);
    var msq = m * m;
    var con = Math.PI * this.R * (al * (g - msq) + Math.sqrt(asq * (g - msq) * (g - msq) - (msq + asq) * (gsq - msq))) / (msq + asq);
    if (dlon < 0) {
      con = -con;
    }
    x = this.x0 + con;
    // con = Math.abs(con / (Math.PI * this.R));
    var q = asq + g;
    con = Math.PI * this.R * (m * q - al * Math.sqrt((msq + asq) * (asq + 1) - q * q)) / (msq + asq);
    if (lat >= 0) {
      // y = this.y0 + Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
      y = this.y0 + con;
    } else {
      // y = this.y0 - Math.PI * this.R * Math.sqrt(1 - con * con - 2 * al * con);
      y = this.y0 - con;
    }
    p.x = x;
    p.y = y;
    return p;
  }

  /* Van Der Grinten inverse equations--mapping x,y to lat/long
    --------------------------------------------------------- */
  function inverse$8(p) {
    var lon, lat;
    var xx, yy, xys, c1, c2, c3;
    var a1;
    var m1;
    var con;
    var th1;
    var d;

    /* inverse equations
      ----------------- */
    p.x -= this.x0;
    p.y -= this.y0;
    con = Math.PI * this.R;
    xx = p.x / con;
    yy = p.y / con;
    xys = xx * xx + yy * yy;
    c1 = -Math.abs(yy) * (1 + xys);
    c2 = c1 - 2 * yy * yy + xx * xx;
    c3 = -2 * c1 + 1 + 2 * yy * yy + xys * xys;
    d = yy * yy / c3 + (2 * c2 * c2 * c2 / c3 / c3 / c3 - 9 * c1 * c2 / c3 / c3) / 27;
    a1 = (c1 - c2 * c2 / 3 / c3) / c3;
    m1 = 2 * Math.sqrt(-a1 / 3);
    con = ((3 * d) / a1) / m1;
    if (Math.abs(con) > 1) {
      if (con >= 0) {
        con = 1;
      } else {
        con = -1;
      }
    }
    th1 = Math.acos(con) / 3;
    if (p.y >= 0) {
      lat = (-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
    } else {
      lat = -(-m1 * Math.cos(th1 + Math.PI / 3) - c2 / 3 / c3) * Math.PI;
    }

    if (Math.abs(xx) < EPSLN) {
      lon = this.long0;
    } else {
      lon = adjust_lon(this.long0 + Math.PI * (xys - 1 + Math.sqrt(1 + 2 * (xx * xx - yy * yy) + xys * xys)) / 2 / xx);
    }

    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$9 = ['Van_der_Grinten_I', 'VanDerGrinten', 'Van_der_Grinten', 'vandg'];
  var vandg = {
    init: init$9,
    forward: forward$8,
    inverse: inverse$8,
    names: names$9
  };

  var geographiclibGeodesic_min = {exports: {}};

  var hasRequiredGeographiclibGeodesic_min;

  function requireGeographiclibGeodesic_min () {
  	if (hasRequiredGeographiclibGeodesic_min) return geographiclibGeodesic_min.exports;
  	hasRequiredGeographiclibGeodesic_min = 1;
  	(function (module) {
  		(function(cb){var geodesic={};geodesic.Constants={};geodesic.Math={};geodesic.Accumulator={};(function(c){c.WGS84={a:6378137,f:1/298.257223563};c.version={major:2,minor:1,patch:1};c.version_string="2.1.1";})(geodesic.Constants);(function(m){m.digits=53;m.epsilon=Math.pow(0.5,m.digits-1);m.degree=Math.PI/180;m.sq=function(x){return x*x;};m.hypot=function(x,y){return Math.sqrt(x*x+y*y);};m.cbrt=Math.cbrt||function(x){var y=Math.pow(Math.abs(x),1/3);return x>0?y:(x<0?-y:x);};m.log1p=Math.log1p||function(x){var y=1+x,z=y-1;return z===0?x:x*Math.log(y)/z;};m.atanh=Math.atanh||function(x){var y=Math.abs(x);y=m.log1p(2*y/(1-y))/2;return x>0?y:(x<0?-y:x);};m.copysign=function(x,y){return Math.abs(x)*(y<0||(y===0&&1/y<0)?-1:1);};m.sum=function(u,v){var s=u+v,up=s-v,vpp=s-up,t;up-=u;vpp-=v;t=s?0-(up+vpp):s;return {s:s,t:t};};m.polyval=function(N,p,s,x){var y=N<0?0:p[s++];while(--N>=0)y=y*x+p[s++];return y;};m.AngRound=function(x){var z=1/16,y=Math.abs(x);y=y<z?z-(z-y):y;return m.copysign(y,x);};m.remainder=function(x,y){x%=y;return x<-y/2?x+y:(x<y/2?x:x-y);};m.AngNormalize=function(x){var y=m.remainder(x,360);return Math.abs(y)===180?m.copysign(180,x):y;};m.LatFix=function(x){return Math.abs(x)>90?NaN:x;};m.AngDiff=function(x,y){var r=m.sum(m.remainder(-x,360),m.remainder(y,360)),d,e;r=m.sum(m.remainder(r.s,360),r.t);d=r.s;e=r.t;if(d===0||Math.abs(d)===180)
  		d=m.copysign(d,e===0?y-x:-e);return {d:d,e:e};};m.sincosd=function(x){var d,r,q,s,c,sinx,cosx;d=x%360;q=Math.round(d/90);d-=90*q;r=d*this.degree;s=Math.sin(r);c=Math.cos(r);if(Math.abs(d)===45){c=Math.sqrt(0.5);s=m.copysign(c,r);}else if(Math.abs(d)===30){c=Math.sqrt(0.75);s=m.copysign(0.5,r);}
  		switch(q&3){case 0:sinx=s;cosx=c;break;case 1:sinx=c;cosx=-s;break;case 2:sinx=-s;cosx=-c;break;default:sinx=-c;cosx=s;break;}
  		cosx+=0;if(sinx===0)sinx=m.copysign(sinx,x);return {s:sinx,c:cosx};};m.sincosde=function(x,t){var d,r,q,s,c,sinx,cosx;d=x%360;q=Math.round(d/90);d=m.AngRound((d-90*q)+t);r=d*this.degree;s=Math.sin(r);c=Math.cos(r);if(Math.abs(d)===45){c=Math.sqrt(0.5);s=m.copysign(c,r);}else if(Math.abs(d)===30){c=Math.sqrt(0.75);s=m.copysign(0.5,r);}
  		switch(q&3){case 0:sinx=s;cosx=c;break;case 1:sinx=c;cosx=-s;break;case 2:sinx=-s;cosx=-c;break;default:sinx=-c;cosx=s;break;}
  		cosx+=0;if(sinx===0)sinx=m.copysign(sinx,x+t);return {s:sinx,c:cosx};};m.atan2d=function(y,x){var q=0,ang;if(Math.abs(y)>Math.abs(x)){[y,x]=[x,y];q=2;}
  		if(m.copysign(1,x)<0){x=-x;++q;}
  		ang=Math.atan2(y,x)/this.degree;switch(q){case 1:ang=m.copysign(180,y)-ang;break;case 2:ang=90-ang;break;case 3:ang=-90+ang;break;}
  		return ang;};})(geodesic.Math);(function(a,m){a.Accumulator=function(y){this.Set(y);};a.Accumulator.prototype.Set=function(y){if(!y)y=0;if(y.constructor===a.Accumulator){this._s=y._s;this._t=y._t;}else {this._s=y;this._t=0;}};a.Accumulator.prototype.Add=function(y){var u=m.sum(y,this._t),v=m.sum(u.s,this._s);u=u.t;this._s=v.s;this._t=v.t;if(this._s===0)
  		this._s=u;else
  		this._t+=u;};a.Accumulator.prototype.Sum=function(y){var b;if(!y)
  		return this._s;else {b=new a.Accumulator(this);b.Add(y);return b._s;}};a.Accumulator.prototype.Negate=function(){this._s*=-1;this._t*=-1;};a.Accumulator.prototype.Remainder=function(y){this._s=m.remainder(this._s,y);this.Add(0);};})(geodesic.Accumulator,geodesic.Math);geodesic.Geodesic={};geodesic.GeodesicLine={};geodesic.PolygonArea={};(function(g,l,p,m,c){var GEOGRAPHICLIB_GEODESIC_ORDER=6,nA1_=GEOGRAPHICLIB_GEODESIC_ORDER,nA2_=GEOGRAPHICLIB_GEODESIC_ORDER,nA3_=GEOGRAPHICLIB_GEODESIC_ORDER,nA3x_=nA3_,nC3x_,nC4x_,maxit1_=20,maxit2_=maxit1_+m.digits+10,tol0_=m.epsilon,tol1_=200*tol0_,tol2_=Math.sqrt(tol0_),tolb_=tol0_,xthresh_=1000*tol2_,CAP_NONE=0,CAP_ALL=0x1F,OUT_ALL=0x7F80,astroid,A1m1f_coeff,C1f_coeff,C1pf_coeff,A2m1f_coeff,C2f_coeff,A3_coeff,C3_coeff,C4_coeff;g.tiny_=Math.sqrt(Number.MIN_VALUE/Number.EPSILON);g.nC1_=GEOGRAPHICLIB_GEODESIC_ORDER;g.nC1p_=GEOGRAPHICLIB_GEODESIC_ORDER;g.nC2_=GEOGRAPHICLIB_GEODESIC_ORDER;g.nC3_=GEOGRAPHICLIB_GEODESIC_ORDER;g.nC4_=GEOGRAPHICLIB_GEODESIC_ORDER;nC3x_=(g.nC3_*(g.nC3_-1))/2;nC4x_=(g.nC4_*(g.nC4_+1))/2;g.CAP_C1=1<<0;g.CAP_C1p=1<<1;g.CAP_C2=1<<2;g.CAP_C3=1<<3;g.CAP_C4=1<<4;g.NONE=0;g.ARC=1<<6;g.LATITUDE=1<<7|CAP_NONE;g.LONGITUDE=1<<8|g.CAP_C3;g.AZIMUTH=1<<9|CAP_NONE;g.DISTANCE=1<<10|g.CAP_C1;g.STANDARD=g.LATITUDE|g.LONGITUDE|g.AZIMUTH|g.DISTANCE;g.DISTANCE_IN=1<<11|g.CAP_C1|g.CAP_C1p;g.REDUCEDLENGTH=1<<12|g.CAP_C1|g.CAP_C2;g.GEODESICSCALE=1<<13|g.CAP_C1|g.CAP_C2;g.AREA=1<<14|g.CAP_C4;g.ALL=OUT_ALL|CAP_ALL;g.LONG_UNROLL=1<<15;g.OUT_MASK=OUT_ALL|g.LONG_UNROLL;g.SinCosSeries=function(sinp,sinx,cosx,c){var k=c.length,n=k-(sinp?1:0),ar=2*(cosx-sinx)*(cosx+sinx),y0=n&1?c[--k]:0,y1=0;n=Math.floor(n/2);while(n--){y1=ar*y0-y1+c[--k];y0=ar*y1-y0+c[--k];}
  		return(sinp?2*sinx*cosx*y0:cosx*(y0-y1));};astroid=function(x,y){var k,p=m.sq(x),q=m.sq(y),r=(p+q-1)/6,S,r2,r3,disc,u,T3,T,ang,v,uv,w;if(!(q===0&&r<=0)){S=p*q/4;r2=m.sq(r);r3=r*r2;disc=S*(S+2*r3);u=r;if(disc>=0){T3=S+r3;T3+=T3<0?-Math.sqrt(disc):Math.sqrt(disc);T=m.cbrt(T3);u+=T+(T!==0?r2/T:0);}else {ang=Math.atan2(Math.sqrt(-disc),-(S+r3));u+=2*r*Math.cos(ang/3);}
  		v=Math.sqrt(m.sq(u)+q);uv=u<0?q/(v-u):u+v;w=(uv-q)/(2*v);k=uv/(Math.sqrt(uv+m.sq(w))+w);}else {k=0;}
  		return k;};A1m1f_coeff=[1,4,64,0,256];g.A1m1f=function(eps){var p=Math.floor(nA1_/2),t=m.polyval(p,A1m1f_coeff,0,m.sq(eps))/A1m1f_coeff[p+1];return (t+eps)/(1-eps);};C1f_coeff=[-1,6,-16,32,-9,64,-128,2048,9,-16,768,3,-5,512,-7,1280,-7,2048];g.C1f=function(eps,c){var eps2=m.sq(eps),d=eps,o=0,l,p;for(l=1;l<=g.nC1_;++l){p=Math.floor((g.nC1_-l)/2);c[l]=d*m.polyval(p,C1f_coeff,o,eps2)/C1f_coeff[o+p+1];o+=p+2;d*=eps;}};C1pf_coeff=[205,-432,768,1536,4005,-4736,3840,12288,-225,116,384,-7173,2695,7680,3467,7680,38081,61440];g.C1pf=function(eps,c){var eps2=m.sq(eps),d=eps,o=0,l,p;for(l=1;l<=g.nC1p_;++l){p=Math.floor((g.nC1p_-l)/2);c[l]=d*m.polyval(p,C1pf_coeff,o,eps2)/C1pf_coeff[o+p+1];o+=p+2;d*=eps;}};A2m1f_coeff=[-11,-28,-192,0,256];g.A2m1f=function(eps){var p=Math.floor(nA2_/2),t=m.polyval(p,A2m1f_coeff,0,m.sq(eps))/A2m1f_coeff[p+1];return (t-eps)/(1+eps);};C2f_coeff=[1,2,16,32,35,64,384,2048,15,80,768,7,35,512,63,1280,77,2048];g.C2f=function(eps,c){var eps2=m.sq(eps),d=eps,o=0,l,p;for(l=1;l<=g.nC2_;++l){p=Math.floor((g.nC2_-l)/2);c[l]=d*m.polyval(p,C2f_coeff,o,eps2)/C2f_coeff[o+p+1];o+=p+2;d*=eps;}};g.Geodesic=function(a,f){this.a=a;this.f=f;this._f1=1-this.f;this._e2=this.f*(2-this.f);this._ep2=this._e2/m.sq(this._f1);this._n=this.f/(2-this.f);this._b=this.a*this._f1;this._c2=(m.sq(this.a)+m.sq(this._b)*(this._e2===0?1:(this._e2>0?m.atanh(Math.sqrt(this._e2)):Math.atan(Math.sqrt(-this._e2)))/Math.sqrt(Math.abs(this._e2))))/2;this._etol2=0.1*tol2_/Math.sqrt(Math.max(0.001,Math.abs(this.f))*Math.min(1,1-this.f/2)/2);if(!(isFinite(this.a)&&this.a>0))
  		throw new Error("Equatorial radius is not positive");if(!(isFinite(this._b)&&this._b>0))
  		throw new Error("Polar semi-axis is not positive");this._A3x=new Array(nA3x_);this._C3x=new Array(nC3x_);this._C4x=new Array(nC4x_);this.A3coeff();this.C3coeff();this.C4coeff();};A3_coeff=[-3,128,-2,-3,64,-1,-3,-1,16,3,-1,-2,8,1,-1,2,1,1];g.Geodesic.prototype.A3coeff=function(){var o=0,k=0,j,p;for(j=nA3_-1;j>=0;--j){p=Math.min(nA3_-j-1,j);this._A3x[k++]=m.polyval(p,A3_coeff,o,this._n)/A3_coeff[o+p+1];o+=p+2;}};C3_coeff=[3,128,2,5,128,-1,3,3,64,-1,0,1,8,-1,1,4,5,256,1,3,128,-3,-2,3,64,1,-3,2,32,7,512,-10,9,384,5,-9,5,192,7,512,-14,7,512,21,2560];g.Geodesic.prototype.C3coeff=function(){var o=0,k=0,l,j,p;for(l=1;l<g.nC3_;++l){for(j=g.nC3_-1;j>=l;--j){p=Math.min(g.nC3_-j-1,j);this._C3x[k++]=m.polyval(p,C3_coeff,o,this._n)/C3_coeff[o+p+1];o+=p+2;}}};C4_coeff=[97,15015,1088,156,45045,-224,-4784,1573,45045,-10656,14144,-4576,-858,45045,64,624,-4576,6864,-3003,15015,100,208,572,3432,-12012,30030,45045,1,9009,-2944,468,135135,5792,1040,-1287,135135,5952,-11648,9152,-2574,135135,-64,-624,4576,-6864,3003,135135,8,10725,1856,-936,225225,-8448,4992,-1144,225225,-1440,4160,-4576,1716,225225,-136,63063,1024,-208,105105,3584,-3328,1144,315315,-128,135135,-2560,832,405405,128,99099];g.Geodesic.prototype.C4coeff=function(){var o=0,k=0,l,j,p;for(l=0;l<g.nC4_;++l){for(j=g.nC4_-1;j>=l;--j){p=g.nC4_-j-1;this._C4x[k++]=m.polyval(p,C4_coeff,o,this._n)/C4_coeff[o+p+1];o+=p+2;}}};g.Geodesic.prototype.A3f=function(eps){return m.polyval(nA3x_-1,this._A3x,0,eps);};g.Geodesic.prototype.C3f=function(eps,c){var mult=1,o=0,l,p;for(l=1;l<g.nC3_;++l){p=g.nC3_-l-1;mult*=eps;c[l]=mult*m.polyval(p,this._C3x,o,eps);o+=p+1;}};g.Geodesic.prototype.C4f=function(eps,c){var mult=1,o=0,l,p;for(l=0;l<g.nC4_;++l){p=g.nC4_-l-1;c[l]=mult*m.polyval(p,this._C4x,o,eps);o+=p+1;mult*=eps;}};g.Geodesic.prototype.Lengths=function(eps,sig12,ssig1,csig1,dn1,ssig2,csig2,dn2,cbet1,cbet2,outmask,C1a,C2a){outmask&=g.OUT_MASK;var vals={},m0x=0,J12=0,A1=0,A2=0,B1,B2,l,csig12,t;if(outmask&(g.DISTANCE|g.REDUCEDLENGTH|g.GEODESICSCALE)){A1=g.A1m1f(eps);g.C1f(eps,C1a);if(outmask&(g.REDUCEDLENGTH|g.GEODESICSCALE)){A2=g.A2m1f(eps);g.C2f(eps,C2a);m0x=A1-A2;A2=1+A2;}
  		A1=1+A1;}
  		if(outmask&g.DISTANCE){B1=g.SinCosSeries(true,ssig2,csig2,C1a)-
  		g.SinCosSeries(true,ssig1,csig1,C1a);vals.s12b=A1*(sig12+B1);if(outmask&(g.REDUCEDLENGTH|g.GEODESICSCALE)){B2=g.SinCosSeries(true,ssig2,csig2,C2a)-
  		g.SinCosSeries(true,ssig1,csig1,C2a);J12=m0x*sig12+(A1*B1-A2*B2);}}else if(outmask&(g.REDUCEDLENGTH|g.GEODESICSCALE)){for(l=1;l<=g.nC2_;++l)
  		C2a[l]=A1*C1a[l]-A2*C2a[l];J12=m0x*sig12+(g.SinCosSeries(true,ssig2,csig2,C2a)-
  		g.SinCosSeries(true,ssig1,csig1,C2a));}
  		if(outmask&g.REDUCEDLENGTH){vals.m0=m0x;vals.m12b=dn2*(csig1*ssig2)-dn1*(ssig1*csig2)-
  		csig1*csig2*J12;}
  		if(outmask&g.GEODESICSCALE){csig12=csig1*csig2+ssig1*ssig2;t=this._ep2*(cbet1-cbet2)*(cbet1+cbet2)/(dn1+dn2);vals.M12=csig12+(t*ssig2-csig2*J12)*ssig1/dn1;vals.M21=csig12-(t*ssig1-csig1*J12)*ssig2/dn2;}
  		return vals;};g.Geodesic.prototype.InverseStart=function(sbet1,cbet1,dn1,sbet2,cbet2,dn2,lam12,slam12,clam12,C1a,C2a){var vals={},sbet12=sbet2*cbet1-cbet2*sbet1,cbet12=cbet2*cbet1+sbet2*sbet1,sbet12a,shortline,omg12,sbetm2,somg12,comg12,t,ssig12,csig12,x,y,lamscale,betscale,k2,eps,cbet12a,bet12a,m12b,m0,nvals,k,omg12a,lam12x;vals.sig12=-1;sbet12a=sbet2*cbet1;sbet12a+=cbet2*sbet1;shortline=cbet12>=0&&sbet12<0.5&&cbet2*lam12<0.5;if(shortline){sbetm2=m.sq(sbet1+sbet2);sbetm2/=sbetm2+m.sq(cbet1+cbet2);vals.dnm=Math.sqrt(1+this._ep2*sbetm2);omg12=lam12/(this._f1*vals.dnm);somg12=Math.sin(omg12);comg12=Math.cos(omg12);}else {somg12=slam12;comg12=clam12;}
  		vals.salp1=cbet2*somg12;vals.calp1=comg12>=0?sbet12+cbet2*sbet1*m.sq(somg12)/(1+comg12):sbet12a-cbet2*sbet1*m.sq(somg12)/(1-comg12);ssig12=m.hypot(vals.salp1,vals.calp1);csig12=sbet1*sbet2+cbet1*cbet2*comg12;if(shortline&&ssig12<this._etol2){vals.salp2=cbet1*somg12;vals.calp2=sbet12-cbet1*sbet2*(comg12>=0?m.sq(somg12)/(1+comg12):1-comg12);t=m.hypot(vals.salp2,vals.calp2);vals.salp2/=t;vals.calp2/=t;vals.sig12=Math.atan2(ssig12,csig12);}else if(Math.abs(this._n)>0.1||csig12>=0||ssig12>=6*Math.abs(this._n)*Math.PI*m.sq(cbet1));else {lam12x=Math.atan2(-slam12,-clam12);if(this.f>=0){k2=m.sq(sbet1)*this._ep2;eps=k2/(2*(1+Math.sqrt(1+k2))+k2);lamscale=this.f*cbet1*this.A3f(eps)*Math.PI;betscale=lamscale*cbet1;x=lam12x/lamscale;y=sbet12a/betscale;}else {cbet12a=cbet2*cbet1-sbet2*sbet1;bet12a=Math.atan2(sbet12a,cbet12a);nvals=this.Lengths(this._n,Math.PI+bet12a,sbet1,-cbet1,dn1,sbet2,cbet2,dn2,cbet1,cbet2,g.REDUCEDLENGTH,C1a,C2a);m12b=nvals.m12b;m0=nvals.m0;x=-1+m12b/(cbet1*cbet2*m0*Math.PI);betscale=x<-0.01?sbet12a/x:-this.f*m.sq(cbet1)*Math.PI;lamscale=betscale/cbet1;y=lam12/lamscale;}
  		if(y>-tol1_&&x>-1-xthresh_){if(this.f>=0){vals.salp1=Math.min(1,-x);vals.calp1=-Math.sqrt(1-m.sq(vals.salp1));}else {vals.calp1=Math.max(x>-tol1_?0:-1,x);vals.salp1=Math.sqrt(1-m.sq(vals.calp1));}}else {k=astroid(x,y);omg12a=lamscale*(this.f>=0?-x*k/(1+k):-y*(1+k)/k);somg12=Math.sin(omg12a);comg12=-Math.cos(omg12a);vals.salp1=cbet2*somg12;vals.calp1=sbet12a-
  		cbet2*sbet1*m.sq(somg12)/(1-comg12);}}
  		if(!(vals.salp1<=0)){t=m.hypot(vals.salp1,vals.calp1);vals.salp1/=t;vals.calp1/=t;}else {vals.salp1=1;vals.calp1=0;}
  		return vals;};g.Geodesic.prototype.Lambda12=function(sbet1,cbet1,dn1,sbet2,cbet2,dn2,salp1,calp1,slam120,clam120,diffp,C1a,C2a,C3a){var vals={},t,salp0,calp0,somg1,comg1,somg2,comg2,somg12,comg12,B312,eta,k2,nvals;if(sbet1===0&&calp1===0)
  		calp1=-g.tiny_;salp0=salp1*cbet1;calp0=m.hypot(calp1,salp1*sbet1);vals.ssig1=sbet1;somg1=salp0*sbet1;vals.csig1=comg1=calp1*cbet1;t=m.hypot(vals.ssig1,vals.csig1);vals.ssig1/=t;vals.csig1/=t;vals.salp2=cbet2!==cbet1?salp0/cbet2:salp1;vals.calp2=cbet2!==cbet1||Math.abs(sbet2)!==-sbet1?Math.sqrt(m.sq(calp1*cbet1)+(cbet1<-sbet1?(cbet2-cbet1)*(cbet1+cbet2):(sbet1-sbet2)*(sbet1+sbet2)))/cbet2:Math.abs(calp1);vals.ssig2=sbet2;somg2=salp0*sbet2;vals.csig2=comg2=vals.calp2*cbet2;t=m.hypot(vals.ssig2,vals.csig2);vals.ssig2/=t;vals.csig2/=t;vals.sig12=Math.atan2(Math.max(0,vals.csig1*vals.ssig2-
  		vals.ssig1*vals.csig2),vals.csig1*vals.csig2+
  		vals.ssig1*vals.ssig2);somg12=Math.max(0,comg1*somg2-somg1*comg2);comg12=comg1*comg2+somg1*somg2;eta=Math.atan2(somg12*clam120-comg12*slam120,comg12*clam120+somg12*slam120);k2=m.sq(calp0)*this._ep2;vals.eps=k2/(2*(1+Math.sqrt(1+k2))+k2);this.C3f(vals.eps,C3a);B312=(g.SinCosSeries(true,vals.ssig2,vals.csig2,C3a)-
  		g.SinCosSeries(true,vals.ssig1,vals.csig1,C3a));vals.domg12=-this.f*this.A3f(vals.eps)*salp0*(vals.sig12+B312);vals.lam12=eta+vals.domg12;if(diffp){if(vals.calp2===0)
  		vals.dlam12=-2*this._f1*dn1/sbet1;else {nvals=this.Lengths(vals.eps,vals.sig12,vals.ssig1,vals.csig1,dn1,vals.ssig2,vals.csig2,dn2,cbet1,cbet2,g.REDUCEDLENGTH,C1a,C2a);vals.dlam12=nvals.m12b;vals.dlam12*=this._f1/(vals.calp2*cbet2);}}
  		return vals;};g.Geodesic.prototype.Inverse=function(lat1,lon1,lat2,lon2,outmask){var r,vals;if(!outmask)outmask=g.STANDARD;if(outmask===g.LONG_UNROLL)outmask|=g.STANDARD;outmask&=g.OUT_MASK;r=this.InverseInt(lat1,lon1,lat2,lon2,outmask);vals=r.vals;if(outmask&g.AZIMUTH){vals.azi1=m.atan2d(r.salp1,r.calp1);vals.azi2=m.atan2d(r.salp2,r.calp2);}
  		return vals;};g.Geodesic.prototype.InverseInt=function(lat1,lon1,lat2,lon2,outmask){var vals={},lon12,lon12s,lonsign,t,swapp,latsign,sbet1,cbet1,sbet2,cbet2,s12x,m12x,dn1,dn2,lam12,slam12,clam12,sig12,calp1,salp1,calp2,salp2,C1a,C2a,C3a,meridian,nvals,ssig1,csig1,ssig2,csig2,eps,omg12,dnm,numit,salp1a,calp1a,salp1b,calp1b,tripn,tripb,v,dv,dalp1,sdalp1,cdalp1,nsalp1,lengthmask,salp0,calp0,alp12,k2,A4,C4a,B41,B42,somg12,comg12,domg12,dbet1,dbet2,salp12,calp12,sdomg12,cdomg12;vals.lat1=lat1=m.LatFix(lat1);vals.lat2=lat2=m.LatFix(lat2);lat1=m.AngRound(lat1);lat2=m.AngRound(lat2);lon12=m.AngDiff(lon1,lon2);lon12s=lon12.e;lon12=lon12.d;if(outmask&g.LONG_UNROLL){vals.lon1=lon1;vals.lon2=(lon1+lon12)+lon12s;}else {vals.lon1=m.AngNormalize(lon1);vals.lon2=m.AngNormalize(lon2);}
  		lonsign=m.copysign(1,lon12);lon12*=lonsign;lon12s*=lonsign;lam12=lon12*m.degree;t=m.sincosde(lon12,lon12s);slam12=t.s;clam12=t.c;lon12s=(180-lon12)-lon12s;swapp=Math.abs(lat1)<Math.abs(lat2)||isNaN(lat2)?-1:1;if(swapp<0){lonsign*=-1;[lat2,lat1]=[lat1,lat2];}
  		latsign=m.copysign(1,-lat1);lat1*=latsign;lat2*=latsign;t=m.sincosd(lat1);sbet1=this._f1*t.s;cbet1=t.c;t=m.hypot(sbet1,cbet1);sbet1/=t;cbet1/=t;cbet1=Math.max(g.tiny_,cbet1);t=m.sincosd(lat2);sbet2=this._f1*t.s;cbet2=t.c;t=m.hypot(sbet2,cbet2);sbet2/=t;cbet2/=t;cbet2=Math.max(g.tiny_,cbet2);if(cbet1<-sbet1){if(cbet2===cbet1)
  		sbet2=m.copysign(sbet1,sbet2);}else {if(Math.abs(sbet2)===-sbet1)
  		cbet2=cbet1;}
  		dn1=Math.sqrt(1+this._ep2*m.sq(sbet1));dn2=Math.sqrt(1+this._ep2*m.sq(sbet2));C1a=new Array(g.nC1_+1);C2a=new Array(g.nC2_+1);C3a=new Array(g.nC3_);meridian=lat1===-90||slam12===0;if(meridian){calp1=clam12;salp1=slam12;calp2=1;salp2=0;ssig1=sbet1;csig1=calp1*cbet1;ssig2=sbet2;csig2=calp2*cbet2;sig12=Math.atan2(Math.max(0,csig1*ssig2-ssig1*csig2),csig1*csig2+ssig1*ssig2);nvals=this.Lengths(this._n,sig12,ssig1,csig1,dn1,ssig2,csig2,dn2,cbet1,cbet2,outmask|g.DISTANCE|g.REDUCEDLENGTH,C1a,C2a);s12x=nvals.s12b;m12x=nvals.m12b;if(outmask&g.GEODESICSCALE){vals.M12=nvals.M12;vals.M21=nvals.M21;}
  		if(sig12<1||m12x>=0){if(sig12<3*g.tiny_||(sig12<tol0_&&(s12x<0||m12x<0)))
  		sig12=m12x=s12x=0;m12x*=this._b;s12x*=this._b;vals.a12=sig12/m.degree;}else
  		meridian=false;}
  		somg12=2;if(!meridian&&sbet1===0&&(this.f<=0||lon12s>=this.f*180)){calp1=calp2=0;salp1=salp2=1;s12x=this.a*lam12;sig12=omg12=lam12/this._f1;m12x=this._b*Math.sin(sig12);if(outmask&g.GEODESICSCALE)
  		vals.M12=vals.M21=Math.cos(sig12);vals.a12=lon12/this._f1;}else if(!meridian){nvals=this.InverseStart(sbet1,cbet1,dn1,sbet2,cbet2,dn2,lam12,slam12,clam12,C1a,C2a);sig12=nvals.sig12;salp1=nvals.salp1;calp1=nvals.calp1;if(sig12>=0){salp2=nvals.salp2;calp2=nvals.calp2;dnm=nvals.dnm;s12x=sig12*this._b*dnm;m12x=m.sq(dnm)*this._b*Math.sin(sig12/dnm);if(outmask&g.GEODESICSCALE)
  		vals.M12=vals.M21=Math.cos(sig12/dnm);vals.a12=sig12/m.degree;omg12=lam12/(this._f1*dnm);}else {numit=0;salp1a=g.tiny_;calp1a=1;salp1b=g.tiny_;calp1b=-1;for(tripn=false,tripb=false;;++numit){nvals=this.Lambda12(sbet1,cbet1,dn1,sbet2,cbet2,dn2,salp1,calp1,slam12,clam12,numit<maxit1_,C1a,C2a,C3a);v=nvals.lam12;salp2=nvals.salp2;calp2=nvals.calp2;sig12=nvals.sig12;ssig1=nvals.ssig1;csig1=nvals.csig1;ssig2=nvals.ssig2;csig2=nvals.csig2;eps=nvals.eps;domg12=nvals.domg12;dv=nvals.dlam12;if(tripb||!(Math.abs(v)>=(tripn?8:1)*tol0_)||numit==maxit2_)
  		break;if(v>0&&(numit<maxit1_||calp1/salp1>calp1b/salp1b)){salp1b=salp1;calp1b=calp1;}else if(v<0&&(numit<maxit1_||calp1/salp1<calp1a/salp1a)){salp1a=salp1;calp1a=calp1;}
  		if(numit<maxit1_&&dv>0){dalp1=-v/dv;if(Math.abs(dalp1)<Math.PI){sdalp1=Math.sin(dalp1);cdalp1=Math.cos(dalp1);nsalp1=salp1*cdalp1+calp1*sdalp1;if(nsalp1>0){calp1=calp1*cdalp1-salp1*sdalp1;salp1=nsalp1;t=m.hypot(salp1,calp1);salp1/=t;calp1/=t;tripn=Math.abs(v)<=16*tol0_;continue;}}}
  		salp1=(salp1a+salp1b)/2;calp1=(calp1a+calp1b)/2;t=m.hypot(salp1,calp1);salp1/=t;calp1/=t;tripn=false;tripb=(Math.abs(salp1a-salp1)+(calp1a-calp1)<tolb_||Math.abs(salp1-salp1b)+(calp1-calp1b)<tolb_);}
  		lengthmask=outmask|(outmask&(g.REDUCEDLENGTH|g.GEODESICSCALE)?g.DISTANCE:g.NONE);nvals=this.Lengths(eps,sig12,ssig1,csig1,dn1,ssig2,csig2,dn2,cbet1,cbet2,lengthmask,C1a,C2a);s12x=nvals.s12b;m12x=nvals.m12b;if(outmask&g.GEODESICSCALE){vals.M12=nvals.M12;vals.M21=nvals.M21;}
  		m12x*=this._b;s12x*=this._b;vals.a12=sig12/m.degree;if(outmask&g.AREA){sdomg12=Math.sin(domg12);cdomg12=Math.cos(domg12);somg12=slam12*cdomg12-clam12*sdomg12;comg12=clam12*cdomg12+slam12*sdomg12;}}}
  		if(outmask&g.DISTANCE)
  		vals.s12=0+s12x;if(outmask&g.REDUCEDLENGTH)
  		vals.m12=0+m12x;if(outmask&g.AREA){salp0=salp1*cbet1;calp0=m.hypot(calp1,salp1*sbet1);if(calp0!==0&&salp0!==0){ssig1=sbet1;csig1=calp1*cbet1;ssig2=sbet2;csig2=calp2*cbet2;k2=m.sq(calp0)*this._ep2;eps=k2/(2*(1+Math.sqrt(1+k2))+k2);A4=m.sq(this.a)*calp0*salp0*this._e2;t=m.hypot(ssig1,csig1);ssig1/=t;csig1/=t;t=m.hypot(ssig2,csig2);ssig2/=t;csig2/=t;C4a=new Array(g.nC4_);this.C4f(eps,C4a);B41=g.SinCosSeries(false,ssig1,csig1,C4a);B42=g.SinCosSeries(false,ssig2,csig2,C4a);vals.S12=A4*(B42-B41);}else
  		vals.S12=0;if(!meridian&&somg12==2){somg12=Math.sin(omg12);comg12=Math.cos(omg12);}
  		if(!meridian&&comg12>-0.7071&&sbet2-sbet1<1.75){domg12=1+comg12;dbet1=1+cbet1;dbet2=1+cbet2;alp12=2*Math.atan2(somg12*(sbet1*dbet2+sbet2*dbet1),domg12*(sbet1*sbet2+dbet1*dbet2));}else {salp12=salp2*calp1-calp2*salp1;calp12=calp2*calp1+salp2*salp1;if(salp12===0&&calp12<0){salp12=g.tiny_*calp1;calp12=-1;}
  		alp12=Math.atan2(salp12,calp12);}
  		vals.S12+=this._c2*alp12;vals.S12*=swapp*lonsign*latsign;vals.S12+=0;}
  		if(swapp<0){[salp2,salp1]=[salp1,salp2];[calp2,calp1]=[calp1,calp2];if(outmask&g.GEODESICSCALE){[vals.M21,vals.M12]=[vals.M12,vals.M21];}}
  		salp1*=swapp*lonsign;calp1*=swapp*latsign;salp2*=swapp*lonsign;calp2*=swapp*latsign;return {vals:vals,salp1:salp1,calp1:calp1,salp2:salp2,calp2:calp2};};g.Geodesic.prototype.GenDirect=function(lat1,lon1,azi1,arcmode,s12_a12,outmask){var line;if(!outmask)outmask=g.STANDARD;else if(outmask===g.LONG_UNROLL)outmask|=g.STANDARD;if(!arcmode)outmask|=g.DISTANCE_IN;line=new l.GeodesicLine(this,lat1,lon1,azi1,outmask);return line.GenPosition(arcmode,s12_a12,outmask);};g.Geodesic.prototype.Direct=function(lat1,lon1,azi1,s12,outmask){return this.GenDirect(lat1,lon1,azi1,false,s12,outmask);};g.Geodesic.prototype.ArcDirect=function(lat1,lon1,azi1,a12,outmask){return this.GenDirect(lat1,lon1,azi1,true,a12,outmask);};g.Geodesic.prototype.Line=function(lat1,lon1,azi1,caps){return new l.GeodesicLine(this,lat1,lon1,azi1,caps);};g.Geodesic.prototype.DirectLine=function(lat1,lon1,azi1,s12,caps){return this.GenDirectLine(lat1,lon1,azi1,false,s12,caps);};g.Geodesic.prototype.ArcDirectLine=function(lat1,lon1,azi1,a12,caps){return this.GenDirectLine(lat1,lon1,azi1,true,a12,caps);};g.Geodesic.prototype.GenDirectLine=function(lat1,lon1,azi1,arcmode,s12_a12,caps){var t;if(!caps)caps=g.STANDARD|g.DISTANCE_IN;if(!arcmode)caps|=g.DISTANCE_IN;t=new l.GeodesicLine(this,lat1,lon1,azi1,caps);t.GenSetDistance(arcmode,s12_a12);return t;};g.Geodesic.prototype.InverseLine=function(lat1,lon1,lat2,lon2,caps){var r,t,azi1;if(!caps)caps=g.STANDARD|g.DISTANCE_IN;r=this.InverseInt(lat1,lon1,lat2,lon2,g.ARC);azi1=m.atan2d(r.salp1,r.calp1);if(caps&(g.OUT_MASK&g.DISTANCE_IN))caps|=g.DISTANCE;t=new l.GeodesicLine(this,lat1,lon1,azi1,caps,r.salp1,r.calp1);t.SetArc(r.vals.a12);return t;};g.Geodesic.prototype.Polygon=function(polyline){return new p.PolygonArea(this,polyline);};g.WGS84=new g.Geodesic(c.WGS84.a,c.WGS84.f);})(geodesic.Geodesic,geodesic.GeodesicLine,geodesic.PolygonArea,geodesic.Math,geodesic.Constants);(function(g,l,m){l.GeodesicLine=function(geod,lat1,lon1,azi1,caps,salp1,calp1){var t,cbet1,sbet1,eps,s,c;if(!caps)caps=g.STANDARD|g.DISTANCE_IN;this.a=geod.a;this.f=geod.f;this._b=geod._b;this._c2=geod._c2;this._f1=geod._f1;this.caps=caps|g.LATITUDE|g.AZIMUTH|g.LONG_UNROLL;this.lat1=m.LatFix(lat1);this.lon1=lon1;if(typeof salp1==='undefined'||typeof calp1==='undefined'){this.azi1=m.AngNormalize(azi1);t=m.sincosd(m.AngRound(this.azi1));this.salp1=t.s;this.calp1=t.c;}else {this.azi1=azi1;this.salp1=salp1;this.calp1=calp1;}
  		t=m.sincosd(m.AngRound(this.lat1));sbet1=this._f1*t.s;cbet1=t.c;t=m.hypot(sbet1,cbet1);sbet1/=t;cbet1/=t;cbet1=Math.max(g.tiny_,cbet1);this._dn1=Math.sqrt(1+geod._ep2*m.sq(sbet1));this._salp0=this.salp1*cbet1;this._calp0=m.hypot(this.calp1,this.salp1*sbet1);this._ssig1=sbet1;this._somg1=this._salp0*sbet1;this._csig1=this._comg1=sbet1!==0||this.calp1!==0?cbet1*this.calp1:1;t=m.hypot(this._ssig1,this._csig1);this._ssig1/=t;this._csig1/=t;this._k2=m.sq(this._calp0)*geod._ep2;eps=this._k2/(2*(1+Math.sqrt(1+this._k2))+this._k2);if(this.caps&g.CAP_C1){this._A1m1=g.A1m1f(eps);this._C1a=new Array(g.nC1_+1);g.C1f(eps,this._C1a);this._B11=g.SinCosSeries(true,this._ssig1,this._csig1,this._C1a);s=Math.sin(this._B11);c=Math.cos(this._B11);this._stau1=this._ssig1*c+this._csig1*s;this._ctau1=this._csig1*c-this._ssig1*s;}
  		if(this.caps&g.CAP_C1p){this._C1pa=new Array(g.nC1p_+1);g.C1pf(eps,this._C1pa);}
  		if(this.caps&g.CAP_C2){this._A2m1=g.A2m1f(eps);this._C2a=new Array(g.nC2_+1);g.C2f(eps,this._C2a);this._B21=g.SinCosSeries(true,this._ssig1,this._csig1,this._C2a);}
  		if(this.caps&g.CAP_C3){this._C3a=new Array(g.nC3_);geod.C3f(eps,this._C3a);this._A3c=-this.f*this._salp0*geod.A3f(eps);this._B31=g.SinCosSeries(true,this._ssig1,this._csig1,this._C3a);}
  		if(this.caps&g.CAP_C4){this._C4a=new Array(g.nC4_);geod.C4f(eps,this._C4a);this._A4=m.sq(this.a)*this._calp0*this._salp0*geod._e2;this._B41=g.SinCosSeries(false,this._ssig1,this._csig1,this._C4a);}
  		this.a13=this.s13=NaN;};l.GeodesicLine.prototype.GenPosition=function(arcmode,s12_a12,outmask){var vals={},sig12,ssig12,csig12,B12,AB1,ssig2,csig2,tau12,s,c,serr,omg12,lam12,lon12,E,sbet2,cbet2,somg2,comg2,salp2,calp2,dn2,B22,AB2,J12,t,B42,salp12,calp12;if(!outmask)outmask=g.STANDARD;else if(outmask===g.LONG_UNROLL)outmask|=g.STANDARD;outmask&=this.caps&g.OUT_MASK;vals.lat1=this.lat1;vals.azi1=this.azi1;vals.lon1=outmask&g.LONG_UNROLL?this.lon1:m.AngNormalize(this.lon1);if(arcmode)
  		vals.a12=s12_a12;else
  		vals.s12=s12_a12;if(!(arcmode||(this.caps&g.DISTANCE_IN&g.OUT_MASK))){vals.a12=NaN;return vals;}
  		B12=0;AB1=0;if(arcmode){sig12=s12_a12*m.degree;t=m.sincosd(s12_a12);ssig12=t.s;csig12=t.c;}else {tau12=s12_a12/(this._b*(1+this._A1m1));s=Math.sin(tau12);c=Math.cos(tau12);B12=-g.SinCosSeries(true,this._stau1*c+this._ctau1*s,this._ctau1*c-this._stau1*s,this._C1pa);sig12=tau12-(B12-this._B11);ssig12=Math.sin(sig12);csig12=Math.cos(sig12);if(Math.abs(this.f)>0.01){ssig2=this._ssig1*csig12+this._csig1*ssig12;csig2=this._csig1*csig12-this._ssig1*ssig12;B12=g.SinCosSeries(true,ssig2,csig2,this._C1a);serr=(1+this._A1m1)*(sig12+(B12-this._B11))-
  		s12_a12/this._b;sig12=sig12-serr/Math.sqrt(1+this._k2*m.sq(ssig2));ssig12=Math.sin(sig12);csig12=Math.cos(sig12);}}
  		ssig2=this._ssig1*csig12+this._csig1*ssig12;csig2=this._csig1*csig12-this._ssig1*ssig12;dn2=Math.sqrt(1+this._k2*m.sq(ssig2));if(outmask&(g.DISTANCE|g.REDUCEDLENGTH|g.GEODESICSCALE)){if(arcmode||Math.abs(this.f)>0.01)
  		B12=g.SinCosSeries(true,ssig2,csig2,this._C1a);AB1=(1+this._A1m1)*(B12-this._B11);}
  		sbet2=this._calp0*ssig2;cbet2=m.hypot(this._salp0,this._calp0*csig2);if(cbet2===0)
  		cbet2=csig2=g.tiny_;salp2=this._salp0;calp2=this._calp0*csig2;if(arcmode&&(outmask&g.DISTANCE))
  		vals.s12=this._b*((1+this._A1m1)*sig12+AB1);if(outmask&g.LONGITUDE){somg2=this._salp0*ssig2;comg2=csig2;E=m.copysign(1,this._salp0);omg12=outmask&g.LONG_UNROLL?E*(sig12-
  		(Math.atan2(ssig2,csig2)-
  		Math.atan2(this._ssig1,this._csig1))+
  		(Math.atan2(E*somg2,comg2)-
  		Math.atan2(E*this._somg1,this._comg1))):Math.atan2(somg2*this._comg1-comg2*this._somg1,comg2*this._comg1+somg2*this._somg1);lam12=omg12+this._A3c*(sig12+(g.SinCosSeries(true,ssig2,csig2,this._C3a)-
  		this._B31));lon12=lam12/m.degree;vals.lon2=outmask&g.LONG_UNROLL?this.lon1+lon12:m.AngNormalize(m.AngNormalize(this.lon1)+m.AngNormalize(lon12));}
  		if(outmask&g.LATITUDE)
  		vals.lat2=m.atan2d(sbet2,this._f1*cbet2);if(outmask&g.AZIMUTH)
  		vals.azi2=m.atan2d(salp2,calp2);if(outmask&(g.REDUCEDLENGTH|g.GEODESICSCALE)){B22=g.SinCosSeries(true,ssig2,csig2,this._C2a);AB2=(1+this._A2m1)*(B22-this._B21);J12=(this._A1m1-this._A2m1)*sig12+(AB1-AB2);if(outmask&g.REDUCEDLENGTH)
  		vals.m12=this._b*((dn2*(this._csig1*ssig2)-
  		this._dn1*(this._ssig1*csig2))-
  		this._csig1*csig2*J12);if(outmask&g.GEODESICSCALE){t=this._k2*(ssig2-this._ssig1)*(ssig2+this._ssig1)/(this._dn1+dn2);vals.M12=csig12+
  		(t*ssig2-csig2*J12)*this._ssig1/this._dn1;vals.M21=csig12-
  		(t*this._ssig1-this._csig1*J12)*ssig2/dn2;}}
  		if(outmask&g.AREA){B42=g.SinCosSeries(false,ssig2,csig2,this._C4a);if(this._calp0===0||this._salp0===0){salp12=salp2*this.calp1-calp2*this.salp1;calp12=calp2*this.calp1+salp2*this.salp1;}else {salp12=this._calp0*this._salp0*(csig12<=0?this._csig1*(1-csig12)+ssig12*this._ssig1:ssig12*(this._csig1*ssig12/(1+csig12)+this._ssig1));calp12=m.sq(this._salp0)+m.sq(this._calp0)*this._csig1*csig2;}
  		vals.S12=this._c2*Math.atan2(salp12,calp12)+
  		this._A4*(B42-this._B41);}
  		if(!arcmode)
  		vals.a12=sig12/m.degree;return vals;};l.GeodesicLine.prototype.Position=function(s12,outmask){return this.GenPosition(false,s12,outmask);};l.GeodesicLine.prototype.ArcPosition=function(a12,outmask){return this.GenPosition(true,a12,outmask);};l.GeodesicLine.prototype.GenSetDistance=function(arcmode,s13_a13){if(arcmode)
  		this.SetArc(s13_a13);else
  		this.SetDistance(s13_a13);};l.GeodesicLine.prototype.SetDistance=function(s13){var r;this.s13=s13;r=this.GenPosition(false,this.s13,g.ARC);this.a13=0+r.a12;};l.GeodesicLine.prototype.SetArc=function(a13){var r;this.a13=a13;r=this.GenPosition(true,this.a13,g.DISTANCE);this.s13=0+r.s12;};})(geodesic.Geodesic,geodesic.GeodesicLine,geodesic.Math);(function(p,g,m,a){var transit,transitdirect,AreaReduceA,AreaReduceB;transit=function(lon1,lon2){var lon12=m.AngDiff(lon1,lon2).d;lon1=m.AngNormalize(lon1);lon2=m.AngNormalize(lon2);return lon12>0&&((lon1<0&&lon2>=0)||(lon1>0&&lon2===0))?1:(lon12<0&&lon1>=0&&lon2<0?-1:0);};transitdirect=function(lon1,lon2){lon1=lon1%720;lon2=lon2%720;return ((0<=lon2&&lon2<360)||lon2<-360?0:1)-
  		((0<=lon1&&lon1<360)||lon1<-360?0:1);};AreaReduceA=function(area,area0,crossings,reverse,sign){area.Remainder(area0);if(crossings&1)
  		area.Add((area.Sum()<0?1:-1)*area0/2);if(!reverse)
  		area.Negate();if(sign){if(area.Sum()>area0/2)
  		area.Add(-area0);else if(area.Sum()<=-area0/2)
  		area.Add(+area0);}else {if(area.Sum()>=area0)
  		area.Add(-area0);else if(area.Sum()<0)
  		area.Add(+area0);}
  		return 0+area.Sum();};AreaReduceB=function(area,area0,crossings,reverse,sign){area=m.remainder(area,area0);if(crossings&1)
  		area+=(area<0?1:-1)*area0/2;if(!reverse)
  		area*=-1;if(sign){if(area>area0/2)
  		area-=area0;else if(area<=-area0/2)
  		area+=area0;}else {if(area>=area0)
  		area-=area0;else if(area<0)
  		area+=area0;}
  		return 0+area;};p.PolygonArea=function(geod,polyline){this._geod=geod;this.a=this._geod.a;this.f=this._geod.f;this._area0=4*Math.PI*geod._c2;this.polyline=!polyline?false:polyline;this._mask=g.LATITUDE|g.LONGITUDE|g.DISTANCE|(this.polyline?g.NONE:g.AREA|g.LONG_UNROLL);if(!this.polyline)
  		this._areasum=new a.Accumulator(0);this._perimetersum=new a.Accumulator(0);this.Clear();};p.PolygonArea.prototype.Clear=function(){this.num=0;this._crossings=0;if(!this.polyline)
  		this._areasum.Set(0);this._perimetersum.Set(0);this._lat0=this._lon0=this.lat=this.lon=NaN;};p.PolygonArea.prototype.AddPoint=function(lat,lon){var t;if(this.num===0){this._lat0=this.lat=lat;this._lon0=this.lon=lon;}else {t=this._geod.Inverse(this.lat,this.lon,lat,lon,this._mask);this._perimetersum.Add(t.s12);if(!this.polyline){this._areasum.Add(t.S12);this._crossings+=transit(this.lon,lon);}
  		this.lat=lat;this.lon=lon;}
  		++this.num;};p.PolygonArea.prototype.AddEdge=function(azi,s){var t;if(this.num){t=this._geod.Direct(this.lat,this.lon,azi,s,this._mask);this._perimetersum.Add(s);if(!this.polyline){this._areasum.Add(t.S12);this._crossings+=transitdirect(this.lon,t.lon2);}
  		this.lat=t.lat2;this.lon=t.lon2;}
  		++this.num;};p.PolygonArea.prototype.Compute=function(reverse,sign){var vals={number:this.num},t,tempsum;if(this.num<2){vals.perimeter=0;if(!this.polyline)
  		vals.area=0;return vals;}
  		if(this.polyline){vals.perimeter=this._perimetersum.Sum();return vals;}
  		t=this._geod.Inverse(this.lat,this.lon,this._lat0,this._lon0,this._mask);vals.perimeter=this._perimetersum.Sum(t.s12);tempsum=new a.Accumulator(this._areasum);tempsum.Add(t.S12);vals.area=AreaReduceA(tempsum,this._area0,this._crossings+transit(this.lon,this._lon0),reverse,sign);return vals;};p.PolygonArea.prototype.TestPoint=function(lat,lon,reverse,sign){var vals={number:this.num+1},t,tempsum,crossings,i;if(this.num===0){vals.perimeter=0;if(!this.polyline)
  		vals.area=0;return vals;}
  		vals.perimeter=this._perimetersum.Sum();tempsum=this.polyline?0:this._areasum.Sum();crossings=this._crossings;for(i=0;i<(this.polyline?1:2);++i){t=this._geod.Inverse(i===0?this.lat:lat,i===0?this.lon:lon,i!==0?this._lat0:lat,i!==0?this._lon0:lon,this._mask);vals.perimeter+=t.s12;if(!this.polyline){tempsum+=t.S12;crossings+=transit(i===0?this.lon:lon,i!==0?this._lon0:lon);}}
  		if(this.polyline)
  		return vals;vals.area=AreaReduceB(tempsum,this._area0,crossings,reverse,sign);return vals;};p.PolygonArea.prototype.TestEdge=function(azi,s,reverse,sign){var vals={number:this.num?this.num+1:0},t,tempsum,crossings;if(this.num===0)
  		return vals;vals.perimeter=this._perimetersum.Sum()+s;if(this.polyline)
  		return vals;tempsum=this._areasum.Sum();crossings=this._crossings;t=this._geod.Direct(this.lat,this.lon,azi,s,this._mask);tempsum+=t.S12;crossings+=transitdirect(this.lon,t.lon2);crossings+=transit(t.lon2,this._lon0);t=this._geod.Inverse(t.lat2,t.lon2,this._lat0,this._lon0,this._mask);vals.perimeter+=t.s12;tempsum+=t.S12;vals.area=AreaReduceB(tempsum,this._area0,crossings,reverse,sign);return vals;};})(geodesic.PolygonArea,geodesic.Geodesic,geodesic.Math,geodesic.Accumulator);cb(geodesic);})(function(geo){if(module.exports){module.exports=geo;}else {window.geodesic=geo;}}); 
  	} (geographiclibGeodesic_min));
  	return geographiclibGeodesic_min.exports;
  }

  var geographiclibGeodesic_minExports = requireGeographiclibGeodesic_min();

  function init$8() {
    this.sin_p12 = Math.sin(this.lat0);
    this.cos_p12 = Math.cos(this.lat0);
    this.g = new geographiclibGeodesic_minExports.Geodesic.Geodesic(this.a, this.es / (1 + Math.sqrt(1 - this.es)));
  }

  function forward$7(p) {
    var lon = p.x;
    var lat = p.y;
    var sinphi = Math.sin(p.y);
    var cosphi = Math.cos(p.y);
    var dlon = adjust_lon(lon - this.long0);
    var e0, e1, e2, e3, Mlp, Ml, c, kp, cos_c, lat1, lon1, lat2, lon2, vars, azi1;
    if (this.sphere) {
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        // North Pole case
        p.x = this.x0 + this.a * (HALF_PI - lat) * Math.sin(dlon);
        p.y = this.y0 - this.a * (HALF_PI - lat) * Math.cos(dlon);
        return p;
      } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        // South Pole case
        p.x = this.x0 + this.a * (HALF_PI + lat) * Math.sin(dlon);
        p.y = this.y0 + this.a * (HALF_PI + lat) * Math.cos(dlon);
        return p;
      } else {
        // default case
        cos_c = this.sin_p12 * sinphi + this.cos_p12 * cosphi * Math.cos(dlon);
        c = Math.acos(cos_c);
        kp = c ? c / Math.sin(c) : 1;
        p.x = this.x0 + this.a * kp * cosphi * Math.sin(dlon);
        p.y = this.y0 + this.a * kp * (this.cos_p12 * sinphi - this.sin_p12 * cosphi * Math.cos(dlon));
        return p;
      }
    } else {
      e0 = e0fn(this.es);
      e1 = e1fn(this.es);
      e2 = e2fn(this.es);
      e3 = e3fn(this.es);
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        // North Pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        Ml = this.a * mlfn(e0, e1, e2, e3, lat);
        p.x = this.x0 + (Mlp - Ml) * Math.sin(dlon);
        p.y = this.y0 - (Mlp - Ml) * Math.cos(dlon);
        return p;
      } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        // South Pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        Ml = this.a * mlfn(e0, e1, e2, e3, lat);
        p.x = this.x0 + (Mlp + Ml) * Math.sin(dlon);
        p.y = this.y0 + (Mlp + Ml) * Math.cos(dlon);
        return p;
      } else {
        // Default case
        if (Math.abs(lon) < EPSLN && Math.abs(lat - this.lat0) < EPSLN) {
          p.x = p.y = 0;
          return p;
        }
        lat1 = this.lat0 / D2R$1;
        lon1 = this.long0 / D2R$1;
        lat2 = lat / D2R$1;
        lon2 = lon / D2R$1;

        vars = this.g.Inverse(lat1, lon1, lat2, lon2, this.g.AZIMUTH);
        azi1 = vars.azi1 * D2R$1;

        p.x = vars.s12 * Math.sin(azi1);
        p.y = vars.s12 * Math.cos(azi1);
        return p;
      }
    }
  }

  function inverse$7(p) {
    p.x -= this.x0;
    p.y -= this.y0;
    var rh, z, sinz, cosz, lon, lat, con, e0, e1, e2, e3, Mlp, M, lat1, lon1, azi1, s12, vars;
    if (this.sphere) {
      rh = Math.sqrt(p.x * p.x + p.y * p.y);
      if (rh > (2 * HALF_PI * this.a)) {
        return;
      }
      z = rh / this.a;

      sinz = Math.sin(z);
      cosz = Math.cos(z);

      lon = this.long0;
      if (Math.abs(rh) <= EPSLN) {
        lat = this.lat0;
      } else {
        lat = asinz(cosz * this.sin_p12 + (p.y * sinz * this.cos_p12) / rh);
        con = Math.abs(this.lat0) - HALF_PI;
        if (Math.abs(con) <= EPSLN) {
          if (this.lat0 >= 0) {
            lon = adjust_lon(this.long0 + Math.atan2(p.x, -p.y));
          } else {
            lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
          }
        } else {
          /* con = cosz - this.sin_p12 * Math.sin(lat);
          if ((Math.abs(con) < EPSLN) && (Math.abs(p.x) < EPSLN)) {
            //no-op, just keep the lon value as is
          } else {
            var temp = Math.atan2((p.x * sinz * this.cos_p12), (con * rh));
            lon = adjust_lon(this.long0 + Math.atan2((p.x * sinz * this.cos_p12), (con * rh)));
          } */
          lon = adjust_lon(this.long0 + Math.atan2(p.x * sinz, rh * this.cos_p12 * cosz - p.y * this.sin_p12 * sinz));
        }
      }

      p.x = lon;
      p.y = lat;
      return p;
    } else {
      e0 = e0fn(this.es);
      e1 = e1fn(this.es);
      e2 = e2fn(this.es);
      e3 = e3fn(this.es);
      if (Math.abs(this.sin_p12 - 1) <= EPSLN) {
        // North pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        rh = Math.sqrt(p.x * p.x + p.y * p.y);
        M = Mlp - rh;
        lat = imlfn(M / this.a, e0, e1, e2, e3);
        lon = adjust_lon(this.long0 + Math.atan2(p.x, -1 * p.y));
        p.x = lon;
        p.y = lat;
        return p;
      } else if (Math.abs(this.sin_p12 + 1) <= EPSLN) {
        // South pole case
        Mlp = this.a * mlfn(e0, e1, e2, e3, HALF_PI);
        rh = Math.sqrt(p.x * p.x + p.y * p.y);
        M = rh - Mlp;

        lat = imlfn(M / this.a, e0, e1, e2, e3);
        lon = adjust_lon(this.long0 + Math.atan2(p.x, p.y));
        p.x = lon;
        p.y = lat;
        return p;
      } else {
        // default case
        lat1 = this.lat0 / D2R$1;
        lon1 = this.long0 / D2R$1;
        azi1 = Math.atan2(p.x, p.y) / D2R$1;
        s12 = Math.sqrt(p.x * p.x + p.y * p.y);
        vars = this.g.Direct(lat1, lon1, azi1, s12, this.g.STANDARD);

        p.x = vars.lon2 * D2R$1;
        p.y = vars.lat2 * D2R$1;
        return p;
      }
    }
  }

  var names$8 = ['Azimuthal_Equidistant', 'aeqd'];
  var aeqd = {
    init: init$8,
    forward: forward$7,
    inverse: inverse$7,
    names: names$8
  };

  function init$7() {
    // double temp;      /* temporary variable    */

    /* Place parameters in static storage for common use
        ------------------------------------------------- */
    this.sin_p14 = Math.sin(this.lat0);
    this.cos_p14 = Math.cos(this.lat0);
  }

  /* Orthographic forward equations--mapping lat,long to x,y
      --------------------------------------------------- */
  function forward$6(p) {
    var sinphi, cosphi; /* sin and cos value        */
    var dlon; /* delta longitude value      */
    var coslon; /* cos of longitude        */
    var ksp; /* scale factor          */
    var g, x, y;
    var lon = p.x;
    var lat = p.y;
    /* Forward equations
        ----------------- */
    dlon = adjust_lon(lon - this.long0);

    sinphi = Math.sin(lat);
    cosphi = Math.cos(lat);

    coslon = Math.cos(dlon);
    g = this.sin_p14 * sinphi + this.cos_p14 * cosphi * coslon;
    ksp = 1;
    if ((g > 0) || (Math.abs(g) <= EPSLN)) {
      x = this.a * ksp * cosphi * Math.sin(dlon);
      y = this.y0 + this.a * ksp * (this.cos_p14 * sinphi - this.sin_p14 * cosphi * coslon);
    }
    p.x = x;
    p.y = y;
    return p;
  }

  function inverse$6(p) {
    var rh; /* height above ellipsoid      */
    var z; /* angle          */
    var sinz, cosz; /* sin of z and cos of z      */
    var con;
    var lon, lat;
    /* Inverse equations
        ----------------- */
    p.x -= this.x0;
    p.y -= this.y0;
    rh = Math.sqrt(p.x * p.x + p.y * p.y);
    z = asinz(rh / this.a);

    sinz = Math.sin(z);
    cosz = Math.cos(z);

    lon = this.long0;
    if (Math.abs(rh) <= EPSLN) {
      lat = this.lat0;
      p.x = lon;
      p.y = lat;
      return p;
    }
    lat = asinz(cosz * this.sin_p14 + (p.y * sinz * this.cos_p14) / rh);
    con = Math.abs(this.lat0) - HALF_PI;
    if (Math.abs(con) <= EPSLN) {
      if (this.lat0 >= 0) {
        lon = adjust_lon(this.long0 + Math.atan2(p.x, -p.y));
      } else {
        lon = adjust_lon(this.long0 - Math.atan2(-p.x, p.y));
      }
      p.x = lon;
      p.y = lat;
      return p;
    }
    lon = adjust_lon(this.long0 + Math.atan2((p.x * sinz), rh * this.cos_p14 * cosz - p.y * this.sin_p14 * sinz));
    p.x = lon;
    p.y = lat;
    return p;
  }

  var names$7 = ['ortho'];
  var ortho = {
    init: init$7,
    forward: forward$6,
    inverse: inverse$6,
    names: names$7
  };

  // QSC projection rewritten from the original PROJ4
  // https://github.com/OSGeo/proj.4/blob/master/src/PJ_qsc.c


  /* constants */
  var FACE_ENUM = {
    FRONT: 1,
    RIGHT: 2,
    BACK: 3,
    LEFT: 4,
    TOP: 5,
    BOTTOM: 6
  };

  var AREA_ENUM = {
    AREA_0: 1,
    AREA_1: 2,
    AREA_2: 3,
    AREA_3: 4
  };

  function init$6() {
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.lat0 = this.lat0 || 0;
    this.long0 = this.long0 || 0;
    this.lat_ts = this.lat_ts || 0;
    this.title = this.title || 'Quadrilateralized Spherical Cube';

    /* Determine the cube face from the center of projection. */
    if (this.lat0 >= HALF_PI - FORTPI / 2.0) {
      this.face = FACE_ENUM.TOP;
    } else if (this.lat0 <= -(HALF_PI - FORTPI / 2.0)) {
      this.face = FACE_ENUM.BOTTOM;
    } else if (Math.abs(this.long0) <= FORTPI) {
      this.face = FACE_ENUM.FRONT;
    } else if (Math.abs(this.long0) <= HALF_PI + FORTPI) {
      this.face = this.long0 > 0.0 ? FACE_ENUM.RIGHT : FACE_ENUM.LEFT;
    } else {
      this.face = FACE_ENUM.BACK;
    }

    /* Fill in useful values for the ellipsoid <-> sphere shift
     * described in [LK12]. */
    if (this.es !== 0) {
      this.one_minus_f = 1 - (this.a - this.b) / this.a;
      this.one_minus_f_squared = this.one_minus_f * this.one_minus_f;
    }
  }

  // QSC forward equations--mapping lat,long to x,y
  // -----------------------------------------------------------------
  function forward$5(p) {
    var xy = { x: 0, y: 0 };
    var lat, lon;
    var theta, phi;
    var t, mu;
    /* nu; */
    var area = { value: 0 };

    // move lon according to projection's lon
    p.x -= this.long0;

    /* Convert the geodetic latitude to a geocentric latitude.
     * This corresponds to the shift from the ellipsoid to the sphere
     * described in [LK12]. */
    if (this.es !== 0) { // if (P->es != 0) {
      lat = Math.atan(this.one_minus_f_squared * Math.tan(p.y));
    } else {
      lat = p.y;
    }

    /* Convert the input lat, lon into theta, phi as used by QSC.
     * This depends on the cube face and the area on it.
     * For the top and bottom face, we can compute theta and phi
     * directly from phi, lam. For the other faces, we must use
     * unit sphere cartesian coordinates as an intermediate step. */
    lon = p.x; // lon = lp.lam;
    if (this.face === FACE_ENUM.TOP) {
      phi = HALF_PI - lat;
      if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_0;
        theta = lon - HALF_PI;
      } else if (lon > HALF_PI + FORTPI || lon <= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_1;
        theta = (lon > 0.0 ? lon - SPI : lon + SPI);
      } else if (lon > -(HALF_PI + FORTPI) && lon <= -FORTPI) {
        area.value = AREA_ENUM.AREA_2;
        theta = lon + HALF_PI;
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta = lon;
      }
    } else if (this.face === FACE_ENUM.BOTTOM) {
      phi = HALF_PI + lat;
      if (lon >= FORTPI && lon <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_0;
        theta = -lon + HALF_PI;
      } else if (lon < FORTPI && lon >= -FORTPI) {
        area.value = AREA_ENUM.AREA_1;
        theta = -lon;
      } else if (lon < -FORTPI && lon >= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_2;
        theta = -lon - HALF_PI;
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta = (lon > 0.0 ? -lon + SPI : -lon - SPI);
      }
    } else {
      var q, r, s;
      var sinlat, coslat;
      var sinlon, coslon;

      if (this.face === FACE_ENUM.RIGHT) {
        lon = qsc_shift_lon_origin(lon, +HALF_PI);
      } else if (this.face === FACE_ENUM.BACK) {
        lon = qsc_shift_lon_origin(lon, 3.14159265359);
      } else if (this.face === FACE_ENUM.LEFT) {
        lon = qsc_shift_lon_origin(lon, -HALF_PI);
      }
      sinlat = Math.sin(lat);
      coslat = Math.cos(lat);
      sinlon = Math.sin(lon);
      coslon = Math.cos(lon);
      q = coslat * coslon;
      r = coslat * sinlon;
      s = sinlat;

      if (this.face === FACE_ENUM.FRONT) {
        phi = Math.acos(q);
        theta = qsc_fwd_equat_face_theta(phi, s, r, area);
      } else if (this.face === FACE_ENUM.RIGHT) {
        phi = Math.acos(r);
        theta = qsc_fwd_equat_face_theta(phi, s, -q, area);
      } else if (this.face === FACE_ENUM.BACK) {
        phi = Math.acos(-q);
        theta = qsc_fwd_equat_face_theta(phi, s, -r, area);
      } else if (this.face === FACE_ENUM.LEFT) {
        phi = Math.acos(-r);
        theta = qsc_fwd_equat_face_theta(phi, s, q, area);
      } else {
        /* Impossible */
        phi = theta = 0;
        area.value = AREA_ENUM.AREA_0;
      }
    }

    /* Compute mu and nu for the area of definition.
     * For mu, see Eq. (3-21) in [OL76], but note the typos:
     * compare with Eq. (3-14). For nu, see Eq. (3-38). */
    mu = Math.atan((12 / SPI) * (theta + Math.acos(Math.sin(theta) * Math.cos(FORTPI)) - HALF_PI));
    t = Math.sqrt((1 - Math.cos(phi)) / (Math.cos(mu) * Math.cos(mu)) / (1 - Math.cos(Math.atan(1 / Math.cos(theta)))));

    /* Apply the result to the real area. */
    if (area.value === AREA_ENUM.AREA_1) {
      mu += HALF_PI;
    } else if (area.value === AREA_ENUM.AREA_2) {
      mu += SPI;
    } else if (area.value === AREA_ENUM.AREA_3) {
      mu += 1.5 * SPI;
    }

    /* Now compute x, y from mu and nu */
    xy.x = t * Math.cos(mu);
    xy.y = t * Math.sin(mu);
    xy.x = xy.x * this.a + this.x0;
    xy.y = xy.y * this.a + this.y0;

    p.x = xy.x;
    p.y = xy.y;
    return p;
  }

  // QSC inverse equations--mapping x,y to lat/long
  // -----------------------------------------------------------------
  function inverse$5(p) {
    var lp = { lam: 0, phi: 0 };
    var mu, nu, cosmu, tannu;
    var tantheta, theta, cosphi, phi;
    var t;
    var area = { value: 0 };

    /* de-offset */
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    /* Convert the input x, y to the mu and nu angles as used by QSC.
     * This depends on the area of the cube face. */
    nu = Math.atan(Math.sqrt(p.x * p.x + p.y * p.y));
    mu = Math.atan2(p.y, p.x);
    if (p.x >= 0.0 && p.x >= Math.abs(p.y)) {
      area.value = AREA_ENUM.AREA_0;
    } else if (p.y >= 0.0 && p.y >= Math.abs(p.x)) {
      area.value = AREA_ENUM.AREA_1;
      mu -= HALF_PI;
    } else if (p.x < 0.0 && -p.x >= Math.abs(p.y)) {
      area.value = AREA_ENUM.AREA_2;
      mu = (mu < 0.0 ? mu + SPI : mu - SPI);
    } else {
      area.value = AREA_ENUM.AREA_3;
      mu += HALF_PI;
    }

    /* Compute phi and theta for the area of definition.
     * The inverse projection is not described in the original paper, but some
     * good hints can be found here (as of 2011-12-14):
     * http://fits.gsfc.nasa.gov/fitsbits/saf.93/saf.9302
     * (search for "Message-Id: <9302181759.AA25477 at fits.cv.nrao.edu>") */
    t = (SPI / 12) * Math.tan(mu);
    tantheta = Math.sin(t) / (Math.cos(t) - (1 / Math.sqrt(2)));
    theta = Math.atan(tantheta);
    cosmu = Math.cos(mu);
    tannu = Math.tan(nu);
    cosphi = 1 - cosmu * cosmu * tannu * tannu * (1 - Math.cos(Math.atan(1 / Math.cos(theta))));
    if (cosphi < -1) {
      cosphi = -1;
    } else if (cosphi > 1) {
      cosphi = 1;
    }

    /* Apply the result to the real area on the cube face.
     * For the top and bottom face, we can compute phi and lam directly.
     * For the other faces, we must use unit sphere cartesian coordinates
     * as an intermediate step. */
    if (this.face === FACE_ENUM.TOP) {
      phi = Math.acos(cosphi);
      lp.phi = HALF_PI - phi;
      if (area.value === AREA_ENUM.AREA_0) {
        lp.lam = theta + HALF_PI;
      } else if (area.value === AREA_ENUM.AREA_1) {
        lp.lam = (theta < 0.0 ? theta + SPI : theta - SPI);
      } else if (area.value === AREA_ENUM.AREA_2) {
        lp.lam = theta - HALF_PI;
      } else /* area.value == AREA_ENUM.AREA_3 */ {
        lp.lam = theta;
      }
    } else if (this.face === FACE_ENUM.BOTTOM) {
      phi = Math.acos(cosphi);
      lp.phi = phi - HALF_PI;
      if (area.value === AREA_ENUM.AREA_0) {
        lp.lam = -theta + HALF_PI;
      } else if (area.value === AREA_ENUM.AREA_1) {
        lp.lam = -theta;
      } else if (area.value === AREA_ENUM.AREA_2) {
        lp.lam = -theta - HALF_PI;
      } else /* area.value == AREA_ENUM.AREA_3 */ {
        lp.lam = (theta < 0.0 ? -theta - SPI : -theta + SPI);
      }
    } else {
      /* Compute phi and lam via cartesian unit sphere coordinates. */
      var q, r, s;
      q = cosphi;
      t = q * q;
      if (t >= 1) {
        s = 0;
      } else {
        s = Math.sqrt(1 - t) * Math.sin(theta);
      }
      t += s * s;
      if (t >= 1) {
        r = 0;
      } else {
        r = Math.sqrt(1 - t);
      }
      /* Rotate q,r,s into the correct area. */
      if (area.value === AREA_ENUM.AREA_1) {
        t = r;
        r = -s;
        s = t;
      } else if (area.value === AREA_ENUM.AREA_2) {
        r = -r;
        s = -s;
      } else if (area.value === AREA_ENUM.AREA_3) {
        t = r;
        r = s;
        s = -t;
      }
      /* Rotate q,r,s into the correct cube face. */
      if (this.face === FACE_ENUM.RIGHT) {
        t = q;
        q = -r;
        r = t;
      } else if (this.face === FACE_ENUM.BACK) {
        q = -q;
        r = -r;
      } else if (this.face === FACE_ENUM.LEFT) {
        t = q;
        q = r;
        r = -t;
      }
      /* Now compute phi and lam from the unit sphere coordinates. */
      lp.phi = Math.acos(-s) - HALF_PI;
      lp.lam = Math.atan2(r, q);
      if (this.face === FACE_ENUM.RIGHT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -HALF_PI);
      } else if (this.face === FACE_ENUM.BACK) {
        lp.lam = qsc_shift_lon_origin(lp.lam, -3.14159265359);
      } else if (this.face === FACE_ENUM.LEFT) {
        lp.lam = qsc_shift_lon_origin(lp.lam, +HALF_PI);
      }
    }

    /* Apply the shift from the sphere to the ellipsoid as described
     * in [LK12]. */
    if (this.es !== 0) {
      var invert_sign;
      var tanphi, xa;
      invert_sign = (lp.phi < 0 ? 1 : 0);
      tanphi = Math.tan(lp.phi);
      xa = this.b / Math.sqrt(tanphi * tanphi + this.one_minus_f_squared);
      lp.phi = Math.atan(Math.sqrt(this.a * this.a - xa * xa) / (this.one_minus_f * xa));
      if (invert_sign) {
        lp.phi = -lp.phi;
      }
    }

    lp.lam += this.long0;
    p.x = lp.lam;
    p.y = lp.phi;
    return p;
  }

  /* Helper function for forward projection: compute the theta angle
   * and determine the area number. */
  function qsc_fwd_equat_face_theta(phi, y, x, area) {
    var theta;
    if (phi < EPSLN) {
      area.value = AREA_ENUM.AREA_0;
      theta = 0.0;
    } else {
      theta = Math.atan2(y, x);
      if (Math.abs(theta) <= FORTPI) {
        area.value = AREA_ENUM.AREA_0;
      } else if (theta > FORTPI && theta <= HALF_PI + FORTPI) {
        area.value = AREA_ENUM.AREA_1;
        theta -= HALF_PI;
      } else if (theta > HALF_PI + FORTPI || theta <= -(HALF_PI + FORTPI)) {
        area.value = AREA_ENUM.AREA_2;
        theta = (theta >= 0.0 ? theta - SPI : theta + SPI);
      } else {
        area.value = AREA_ENUM.AREA_3;
        theta += HALF_PI;
      }
    }
    return theta;
  }

  /* Helper function: shift the longitude. */
  function qsc_shift_lon_origin(lon, offset) {
    var slon = lon + offset;
    if (slon < -3.14159265359) {
      slon += TWO_PI;
    } else if (slon > 3.14159265359) {
      slon -= TWO_PI;
    }
    return slon;
  }

  var names$6 = ['Quadrilateralized Spherical Cube', 'Quadrilateralized_Spherical_Cube', 'qsc'];
  var qsc = {
    init: init$6,
    forward: forward$5,
    inverse: inverse$5,
    names: names$6
  };

  // Robinson projection
  // Based on https://github.com/OSGeo/proj.4/blob/master/src/PJ_robin.c
  // Polynomial coeficients from http://article.gmane.org/gmane.comp.gis.proj-4.devel/6039


  var COEFS_X = [
    [1.0000, 2.2199e-17, -715515e-10, 3.1103e-06],
    [0.9986, -482243e-9, -24897e-9, -13309e-10],
    [0.9954, -83103e-8, -448605e-10, -9.86701e-7],
    [0.9900, -135364e-8, -59661e-9, 3.6777e-06],
    [0.9822, -167442e-8, -449547e-11, -572411e-11],
    [0.9730, -214868e-8, -903571e-10, 1.8736e-08],
    [0.9600, -305085e-8, -900761e-10, 1.64917e-06],
    [0.9427, -382792e-8, -653386e-10, -26154e-10],
    [0.9216, -467746e-8, -10457e-8, 4.81243e-06],
    [0.8962, -536223e-8, -323831e-10, -543432e-11],
    [0.8679, -609363e-8, -113898e-9, 3.32484e-06],
    [0.8350, -698325e-8, -640253e-10, 9.34959e-07],
    [0.7986, -755338e-8, -500009e-10, 9.35324e-07],
    [0.7597, -798324e-8, -35971e-9, -227626e-11],
    [0.7186, -851367e-8, -701149e-10, -86303e-10],
    [0.6732, -986209e-8, -199569e-9, 1.91974e-05],
    [0.6213, -0.010418, 8.83923e-05, 6.24051e-06],
    [0.5722, -906601e-8, 0.000182, 6.24051e-06],
    [0.5322, -677797e-8, 0.000275608, 6.24051e-06]
  ];

  var COEFS_Y = [
    [-520417e-23, 0.0124, 1.21431e-18, -845284e-16],
    [0.0620, 0.0124, -1.26793e-9, 4.22642e-10],
    [0.1240, 0.0124, 5.07171e-09, -1.60604e-9],
    [0.1860, 0.0123999, -1.90189e-8, 6.00152e-09],
    [0.2480, 0.0124002, 7.10039e-08, -2.24e-8],
    [0.3100, 0.0123992, -2.64997e-7, 8.35986e-08],
    [0.3720, 0.0124029, 9.88983e-07, -3.11994e-7],
    [0.4340, 0.0123893, -369093e-11, -4.35621e-7],
    [0.4958, 0.0123198, -102252e-10, -3.45523e-7],
    [0.5571, 0.0121916, -154081e-10, -5.82288e-7],
    [0.6176, 0.0119938, -241424e-10, -5.25327e-7],
    [0.6769, 0.011713, -320223e-10, -5.16405e-7],
    [0.7346, 0.0113541, -397684e-10, -6.09052e-7],
    [0.7903, 0.0109107, -489042e-10, -104739e-11],
    [0.8435, 0.0103431, -64615e-9, -1.40374e-9],
    [0.8936, 0.00969686, -64636e-9, -8547e-9],
    [0.9394, 0.00840947, -192841e-9, -42106e-10],
    [0.9761, 0.00616527, -256e-6, -42106e-10],
    [1.0000, 0.00328947, -319159e-9, -42106e-10]
  ];

  var FXC = 0.8487;
  var FYC = 1.3523;
  var C1 = R2D / 5; // rad to 5-degree interval
  var RC1 = 1 / C1;
  var NODES = 18;

  var poly3_val = function (coefs, x) {
    return coefs[0] + x * (coefs[1] + x * (coefs[2] + x * coefs[3]));
  };

  var poly3_der = function (coefs, x) {
    return coefs[1] + x * (2 * coefs[2] + x * 3 * coefs[3]);
  };

  function newton_rapshon(f_df, start, max_err, iters) {
    var x = start;
    for (; iters; --iters) {
      var upd = f_df(x);
      x -= upd;
      if (Math.abs(upd) < max_err) {
        break;
      }
    }
    return x;
  }

  function init$5() {
    this.x0 = this.x0 || 0;
    this.y0 = this.y0 || 0;
    this.long0 = this.long0 || 0;
    this.es = 0;
    this.title = this.title || 'Robinson';
  }

  function forward$4(ll) {
    var lon = adjust_lon(ll.x - this.long0);

    var dphi = Math.abs(ll.y);
    var i = Math.floor(dphi * C1);
    if (i < 0) {
      i = 0;
    } else if (i >= NODES) {
      i = NODES - 1;
    }
    dphi = R2D * (dphi - RC1 * i);
    var xy = {
      x: poly3_val(COEFS_X[i], dphi) * lon,
      y: poly3_val(COEFS_Y[i], dphi)
    };
    if (ll.y < 0) {
      xy.y = -xy.y;
    }

    xy.x = xy.x * this.a * FXC + this.x0;
    xy.y = xy.y * this.a * FYC + this.y0;
    return xy;
  }

  function inverse$4(xy) {
    var ll = {
      x: (xy.x - this.x0) / (this.a * FXC),
      y: Math.abs(xy.y - this.y0) / (this.a * FYC)
    };

    if (ll.y >= 1) { // pathologic case
      ll.x /= COEFS_X[NODES][0];
      ll.y = xy.y < 0 ? -HALF_PI : HALF_PI;
    } else {
      // find table interval
      var i = Math.floor(ll.y * NODES);
      if (i < 0) {
        i = 0;
      } else if (i >= NODES) {
        i = NODES - 1;
      }
      for (;;) {
        if (COEFS_Y[i][0] > ll.y) {
          --i;
        } else if (COEFS_Y[i + 1][0] <= ll.y) {
          ++i;
        } else {
          break;
        }
      }
      // linear interpolation in 5 degree interval
      var coefs = COEFS_Y[i];
      var t = 5 * (ll.y - coefs[0]) / (COEFS_Y[i + 1][0] - coefs[0]);
      // find t so that poly3_val(coefs, t) = ll.y
      t = newton_rapshon(function (x) {
        return (poly3_val(coefs, x) - ll.y) / poly3_der(coefs, x);
      }, t, EPSLN, 100);

      ll.x /= poly3_val(COEFS_X[i], t);
      ll.y = (5 * i + t) * D2R$1;
      if (xy.y < 0) {
        ll.y = -ll.y;
      }
    }

    ll.x = adjust_lon(ll.x + this.long0);
    return ll;
  }

  var names$5 = ['Robinson', 'robin'];
  var robin = {
    init: init$5,
    forward: forward$4,
    inverse: inverse$4,
    names: names$5
  };

  function init$4() {
    this.name = 'geocent';
  }

  function forward$3(p) {
    var point = geodeticToGeocentric(p, this.es, this.a);
    return point;
  }

  function inverse$3(p) {
    var point = geocentricToGeodetic(p, this.es, this.a, this.b);
    return point;
  }

  var names$4 = ['Geocentric', 'geocentric', 'geocent', 'Geocent'];
  var geocent = {
    init: init$4,
    forward: forward$3,
    inverse: inverse$3,
    names: names$4
  };

  var mode = {
    N_POLE: 0,
    S_POLE: 1,
    EQUIT: 2,
    OBLIQ: 3
  };

  var params = {
    h: { def: 100000, num: true }, // default is Karman line, no default in PROJ.7
    azi: { def: 0, num: true, degrees: true }, // default is North
    tilt: { def: 0, num: true, degrees: true }, // default is Nadir
    long0: { def: 0, num: true }, // default is Greenwich, conversion to rad is automatic
    lat0: { def: 0, num: true } // default is Equator, conversion to rad is automatic
  };

  function init$3() {
    Object.keys(params).forEach(function (p) {
      if (typeof this[p] === 'undefined') {
        this[p] = params[p].def;
      } else if (params[p].num && isNaN(this[p])) {
        throw new Error('Invalid parameter value, must be numeric ' + p + ' = ' + this[p]);
      } else if (params[p].num) {
        this[p] = parseFloat(this[p]);
      }
      if (params[p].degrees) {
        this[p] = this[p] * D2R$1;
      }
    }.bind(this));

    if (Math.abs((Math.abs(this.lat0) - HALF_PI)) < EPSLN) {
      this.mode = this.lat0 < 0 ? mode.S_POLE : mode.N_POLE;
    } else if (Math.abs(this.lat0) < EPSLN) {
      this.mode = mode.EQUIT;
    } else {
      this.mode = mode.OBLIQ;
      this.sinph0 = Math.sin(this.lat0);
      this.cosph0 = Math.cos(this.lat0);
    }

    this.pn1 = this.h / this.a; // Normalize relative to the Earth's radius

    if (this.pn1 <= 0 || this.pn1 > 1e10) {
      throw new Error('Invalid height');
    }

    this.p = 1 + this.pn1;
    this.rp = 1 / this.p;
    this.h1 = 1 / this.pn1;
    this.pfact = (this.p + 1) * this.h1;
    this.es = 0;

    var omega = this.tilt;
    var gamma = this.azi;
    this.cg = Math.cos(gamma);
    this.sg = Math.sin(gamma);
    this.cw = Math.cos(omega);
    this.sw = Math.sin(omega);
  }

  function forward$2(p) {
    p.x -= this.long0;
    var sinphi = Math.sin(p.y);
    var cosphi = Math.cos(p.y);
    var coslam = Math.cos(p.x);
    var x, y;
    switch (this.mode) {
      case mode.OBLIQ:
        y = this.sinph0 * sinphi + this.cosph0 * cosphi * coslam;
        break;
      case mode.EQUIT:
        y = cosphi * coslam;
        break;
      case mode.S_POLE:
        y = -sinphi;
        break;
      case mode.N_POLE:
        y = sinphi;
        break;
    }
    y = this.pn1 / (this.p - y);
    x = y * cosphi * Math.sin(p.x);

    switch (this.mode) {
      case mode.OBLIQ:
        y *= this.cosph0 * sinphi - this.sinph0 * cosphi * coslam;
        break;
      case mode.EQUIT:
        y *= sinphi;
        break;
      case mode.N_POLE:
        y *= -(cosphi * coslam);
        break;
      case mode.S_POLE:
        y *= cosphi * coslam;
        break;
    }

    // Tilt
    var yt, ba;
    yt = y * this.cg + x * this.sg;
    ba = 1 / (yt * this.sw * this.h1 + this.cw);
    x = (x * this.cg - y * this.sg) * this.cw * ba;
    y = yt * ba;

    p.x = x * this.a;
    p.y = y * this.a;
    return p;
  }

  function inverse$2(p) {
    p.x /= this.a;
    p.y /= this.a;
    var r = { x: p.x, y: p.y };

    // Un-Tilt
    var bm, bq, yt;
    yt = 1 / (this.pn1 - p.y * this.sw);
    bm = this.pn1 * p.x * yt;
    bq = this.pn1 * p.y * this.cw * yt;
    p.x = bm * this.cg + bq * this.sg;
    p.y = bq * this.cg - bm * this.sg;

    var rh = hypot(p.x, p.y);
    if (Math.abs(rh) < EPSLN) {
      r.x = 0;
      r.y = p.y;
    } else {
      var cosz, sinz;
      sinz = 1 - rh * rh * this.pfact;
      sinz = (this.p - Math.sqrt(sinz)) / (this.pn1 / rh + rh / this.pn1);
      cosz = Math.sqrt(1 - sinz * sinz);
      switch (this.mode) {
        case mode.OBLIQ:
          r.y = Math.asin(cosz * this.sinph0 + p.y * sinz * this.cosph0 / rh);
          p.y = (cosz - this.sinph0 * Math.sin(r.y)) * rh;
          p.x *= sinz * this.cosph0;
          break;
        case mode.EQUIT:
          r.y = Math.asin(p.y * sinz / rh);
          p.y = cosz * rh;
          p.x *= sinz;
          break;
        case mode.N_POLE:
          r.y = Math.asin(cosz);
          p.y = -p.y;
          break;
        case mode.S_POLE:
          r.y = -Math.asin(cosz);
          break;
      }
      r.x = Math.atan2(p.x, p.y);
    }

    p.x = r.x + this.long0;
    p.y = r.y;
    return p;
  }

  var names$3 = ['Tilted_Perspective', 'tpers'];
  var tpers = {
    init: init$3,
    forward: forward$2,
    inverse: inverse$2,
    names: names$3
  };

  function init$2() {
    this.flip_axis = (this.sweep === 'x' ? 1 : 0);
    this.h = Number(this.h);
    this.radius_g_1 = this.h / this.a;

    if (this.radius_g_1 <= 0 || this.radius_g_1 > 1e10) {
      throw new Error();
    }

    this.radius_g = 1.0 + this.radius_g_1;
    this.C = this.radius_g * this.radius_g - 1.0;

    if (this.es !== 0.0) {
      var one_es = 1.0 - this.es;
      var rone_es = 1 / one_es;

      this.radius_p = Math.sqrt(one_es);
      this.radius_p2 = one_es;
      this.radius_p_inv2 = rone_es;

      this.shape = 'ellipse'; // Use as a condition in the forward and inverse functions.
    } else {
      this.radius_p = 1.0;
      this.radius_p2 = 1.0;
      this.radius_p_inv2 = 1.0;

      this.shape = 'sphere'; // Use as a condition in the forward and inverse functions.
    }

    if (!this.title) {
      this.title = 'Geostationary Satellite View';
    }
  }

  function forward$1(p) {
    var lon = p.x;
    var lat = p.y;
    var tmp, v_x, v_y, v_z;
    lon = lon - this.long0;

    if (this.shape === 'ellipse') {
      lat = Math.atan(this.radius_p2 * Math.tan(lat));
      var r = this.radius_p / hypot(this.radius_p * Math.cos(lat), Math.sin(lat));

      v_x = r * Math.cos(lon) * Math.cos(lat);
      v_y = r * Math.sin(lon) * Math.cos(lat);
      v_z = r * Math.sin(lat);

      if (((this.radius_g - v_x) * v_x - v_y * v_y - v_z * v_z * this.radius_p_inv2) < 0.0) {
        p.x = Number.NaN;
        p.y = Number.NaN;
        return p;
      }

      tmp = this.radius_g - v_x;
      if (this.flip_axis) {
        p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
        p.y = this.radius_g_1 * Math.atan(v_z / tmp);
      } else {
        p.x = this.radius_g_1 * Math.atan(v_y / tmp);
        p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
      }
    } else if (this.shape === 'sphere') {
      tmp = Math.cos(lat);
      v_x = Math.cos(lon) * tmp;
      v_y = Math.sin(lon) * tmp;
      v_z = Math.sin(lat);
      tmp = this.radius_g - v_x;

      if (this.flip_axis) {
        p.x = this.radius_g_1 * Math.atan(v_y / hypot(v_z, tmp));
        p.y = this.radius_g_1 * Math.atan(v_z / tmp);
      } else {
        p.x = this.radius_g_1 * Math.atan(v_y / tmp);
        p.y = this.radius_g_1 * Math.atan(v_z / hypot(v_y, tmp));
      }
    }
    p.x = p.x * this.a;
    p.y = p.y * this.a;
    return p;
  }

  function inverse$1(p) {
    var v_x = -1;
    var v_y = 0.0;
    var v_z = 0.0;
    var a, b, det, k;

    p.x = p.x / this.a;
    p.y = p.y / this.a;

    if (this.shape === 'ellipse') {
      if (this.flip_axis) {
        v_z = Math.tan(p.y / this.radius_g_1);
        v_y = Math.tan(p.x / this.radius_g_1) * hypot(1.0, v_z);
      } else {
        v_y = Math.tan(p.x / this.radius_g_1);
        v_z = Math.tan(p.y / this.radius_g_1) * hypot(1.0, v_y);
      }

      var v_zp = v_z / this.radius_p;
      a = v_y * v_y + v_zp * v_zp + v_x * v_x;
      b = 2 * this.radius_g * v_x;
      det = (b * b) - 4 * a * this.C;

      if (det < 0.0) {
        p.x = Number.NaN;
        p.y = Number.NaN;
        return p;
      }

      k = (-b - Math.sqrt(det)) / (2.0 * a);
      v_x = this.radius_g + k * v_x;
      v_y *= k;
      v_z *= k;

      p.x = Math.atan2(v_y, v_x);
      p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
      p.y = Math.atan(this.radius_p_inv2 * Math.tan(p.y));
    } else if (this.shape === 'sphere') {
      if (this.flip_axis) {
        v_z = Math.tan(p.y / this.radius_g_1);
        v_y = Math.tan(p.x / this.radius_g_1) * Math.sqrt(1.0 + v_z * v_z);
      } else {
        v_y = Math.tan(p.x / this.radius_g_1);
        v_z = Math.tan(p.y / this.radius_g_1) * Math.sqrt(1.0 + v_y * v_y);
      }

      a = v_y * v_y + v_z * v_z + v_x * v_x;
      b = 2 * this.radius_g * v_x;
      det = (b * b) - 4 * a * this.C;
      if (det < 0.0) {
        p.x = Number.NaN;
        p.y = Number.NaN;
        return p;
      }

      k = (-b - Math.sqrt(det)) / (2.0 * a);
      v_x = this.radius_g + k * v_x;
      v_y *= k;
      v_z *= k;

      p.x = Math.atan2(v_y, v_x);
      p.y = Math.atan(v_z * Math.cos(p.x) / v_x);
    }
    p.x = p.x + this.long0;
    return p;
  }

  var names$2 = ['Geostationary Satellite View', 'Geostationary_Satellite', 'geos'];
  var geos = {
    init: init$2,
    forward: forward$1,
    inverse: inverse$1,
    names: names$2
  };

  /**
   * Copyright 2018 Bernie Jenny, Monash University, Melbourne, Australia.
   *
   * Licensed under the Apache License, Version 2.0 (the "License");
   * you may not use this file except in compliance with the License.
   * You may obtain a copy of the License at
   *
   * http://www.apache.org/licenses/LICENSE-2.0
   *
   * Unless required by applicable law or agreed to in writing, software
   * distributed under the License is distributed on an "AS IS" BASIS,
   * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   * See the License for the specific language governing permissions and
   * limitations under the License.
   *
   * Equal Earth is a projection inspired by the Robinson projection, but unlike
   * the Robinson projection retains the relative size of areas. The projection
   * was designed in 2018 by Bojan Savric, Tom Patterson and Bernhard Jenny.
   *
   * Publication:
   * Bojan Savric, Tom Patterson & Bernhard Jenny (2018). The Equal Earth map
   * projection, International Journal of Geographical Information Science,
   * DOI: 10.1080/13658816.2018.1504949
   *
   * Code released August 2018
   * Ported to JavaScript and adapted for mapshaper-proj by Matthew Bloch August 2018
   * Modified for proj4js by Andreas Hocevar by Andreas Hocevar March 2024
   */


  var A1 = 1.340264,
    A2 = -0.081106,
    A3 = 0.000893,
    A4 = 0.003796,
    M = Math.sqrt(3) / 2.0;

  function init$1() {
    this.es = 0;
    this.long0 = this.long0 !== undefined ? this.long0 : 0;
  }

  function forward(p) {
    var lam = adjust_lon(p.x - this.long0);
    var phi = p.y;
    var paramLat = Math.asin(M * Math.sin(phi)),
      paramLatSq = paramLat * paramLat,
      paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
    p.x = lam * Math.cos(paramLat)
      / (M * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq)));
    p.y = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq));

    p.x = this.a * p.x + this.x0;
    p.y = this.a * p.y + this.y0;
    return p;
  }

  function inverse(p) {
    p.x = (p.x - this.x0) / this.a;
    p.y = (p.y - this.y0) / this.a;

    var EPS = 1e-9,
      NITER = 12,
      paramLat = p.y,
      paramLatSq, paramLatPow6, fy, fpy, dlat, i;

    for (i = 0; i < NITER; ++i) {
      paramLatSq = paramLat * paramLat;
      paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
      fy = paramLat * (A1 + A2 * paramLatSq + paramLatPow6 * (A3 + A4 * paramLatSq)) - p.y;
      fpy = A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq);
      paramLat -= dlat = fy / fpy;
      if (Math.abs(dlat) < EPS) {
        break;
      }
    }
    paramLatSq = paramLat * paramLat;
    paramLatPow6 = paramLatSq * paramLatSq * paramLatSq;
    p.x = M * p.x * (A1 + 3 * A2 * paramLatSq + paramLatPow6 * (7 * A3 + 9 * A4 * paramLatSq))
      / Math.cos(paramLat);
    p.y = Math.asin(Math.sin(paramLat) / M);

    p.x = adjust_lon(p.x + this.long0);
    return p;
  }

  var names$1 = ['eqearth', 'Equal Earth', 'Equal_Earth'];
  var eqearth = {
    init: init$1,
    forward: forward,
    inverse: inverse,
    names: names$1
  };

  var EPS10 = 1e-10;

  function init() {
    var c;

    this.phi1 = this.lat1;
    if (Math.abs(this.phi1) < EPS10) {
      throw new Error();
    }
    if (this.es) {
      this.en = pj_enfn(this.es);
      this.m1 = pj_mlfn(this.phi1, this.am1 = Math.sin(this.phi1),
        c = Math.cos(this.phi1), this.en);
      this.am1 = c / (Math.sqrt(1 - this.es * this.am1 * this.am1) * this.am1);
      this.inverse = e_inv;
      this.forward = e_fwd;
    } else {
      if (Math.abs(this.phi1) + EPS10 >= HALF_PI) {
        this.cphi1 = 0;
      } else {
        this.cphi1 = 1 / Math.tan(this.phi1);
      }
      this.inverse = s_inv;
      this.forward = s_fwd;
    }
  }

  function e_fwd(p) {
    var lam = adjust_lon(p.x - (this.long0 || 0));
    var phi = p.y;
    var rh, E, c;
    rh = this.am1 + this.m1 - pj_mlfn(phi, E = Math.sin(phi), c = Math.cos(phi), this.en);
    E = c * lam / (rh * Math.sqrt(1 - this.es * E * E));
    p.x = rh * Math.sin(E);
    p.y = this.am1 - rh * Math.cos(E);

    p.x = this.a * p.x + (this.x0 || 0);
    p.y = this.a * p.y + (this.y0 || 0);
    return p;
  }

  function e_inv(p) {
    p.x = (p.x - (this.x0 || 0)) / this.a;
    p.y = (p.y - (this.y0 || 0)) / this.a;

    var s, rh, lam, phi;
    rh = hypot(p.x, p.y = this.am1 - p.y);
    phi = pj_inv_mlfn(this.am1 + this.m1 - rh, this.es, this.en);
    if ((s = Math.abs(phi)) < HALF_PI) {
      s = Math.sin(phi);
      lam = rh * Math.atan2(p.x, p.y) * Math.sqrt(1 - this.es * s * s) / Math.cos(phi);
    } else if (Math.abs(s - HALF_PI) <= EPS10) {
      lam = 0;
    } else {
      throw new Error();
    }
    p.x = adjust_lon(lam + (this.long0 || 0));
    p.y = adjust_lat(phi);
    return p;
  }

  function s_fwd(p) {
    var lam = adjust_lon(p.x - (this.long0 || 0));
    var phi = p.y;
    var E, rh;
    rh = this.cphi1 + this.phi1 - phi;
    if (Math.abs(rh) > EPS10) {
      p.x = rh * Math.sin(E = lam * Math.cos(phi) / rh);
      p.y = this.cphi1 - rh * Math.cos(E);
    } else {
      p.x = p.y = 0;
    }

    p.x = this.a * p.x + (this.x0 || 0);
    p.y = this.a * p.y + (this.y0 || 0);
    return p;
  }

  function s_inv(p) {
    p.x = (p.x - (this.x0 || 0)) / this.a;
    p.y = (p.y - (this.y0 || 0)) / this.a;

    var lam, phi;
    var rh = hypot(p.x, p.y = this.cphi1 - p.y);
    phi = this.cphi1 + this.phi1 - rh;
    if (Math.abs(phi) > HALF_PI) {
      throw new Error();
    }
    if (Math.abs(Math.abs(phi) - HALF_PI) <= EPS10) {
      lam = 0;
    } else {
      lam = rh * Math.atan2(p.x, p.y) / Math.cos(phi);
    }
    p.x = adjust_lon(lam + (this.long0 || 0));
    p.y = adjust_lat(phi);
    return p;
  }

  var names = ['bonne', 'Bonne (Werner lat_1=90)'];
  var bonne = {
    init: init,
    names: names
  };

  function includedProjections (proj4) {
    proj4.Proj.projections.add(tmerc);
    proj4.Proj.projections.add(etmerc);
    proj4.Proj.projections.add(utm);
    proj4.Proj.projections.add(sterea);
    proj4.Proj.projections.add(stere);
    proj4.Proj.projections.add(somerc);
    proj4.Proj.projections.add(omerc);
    proj4.Proj.projections.add(lcc);
    proj4.Proj.projections.add(krovak);
    proj4.Proj.projections.add(cass);
    proj4.Proj.projections.add(laea);
    proj4.Proj.projections.add(aea);
    proj4.Proj.projections.add(gnom);
    proj4.Proj.projections.add(cea);
    proj4.Proj.projections.add(eqc);
    proj4.Proj.projections.add(poly);
    proj4.Proj.projections.add(nzmg);
    proj4.Proj.projections.add(mill);
    proj4.Proj.projections.add(sinu);
    proj4.Proj.projections.add(moll);
    proj4.Proj.projections.add(eqdc);
    proj4.Proj.projections.add(vandg);
    proj4.Proj.projections.add(aeqd);
    proj4.Proj.projections.add(ortho);
    proj4.Proj.projections.add(qsc);
    proj4.Proj.projections.add(robin);
    proj4.Proj.projections.add(geocent);
    proj4.Proj.projections.add(tpers);
    proj4.Proj.projections.add(geos);
    proj4.Proj.projections.add(eqearth);
    proj4.Proj.projections.add(bonne);
  }

  proj4.defaultDatum = 'WGS84'; // default datum
  proj4.Proj = Projection;
  proj4.WGS84 = new proj4.Proj('WGS84');
  proj4.Point = Point;
  proj4.toPoint = common;
  proj4.defs = defs;
  proj4.nadgrid = nadgrid;
  proj4.transform = transform;
  proj4.mgrs = mgrs;
  proj4.version = '2.16.2';
  includedProjections(proj4);

  return proj4;

}));
