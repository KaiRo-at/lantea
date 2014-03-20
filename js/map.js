/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var gMapCanvas, gMapContext, gGLMapCanvas, gTrackCanvas, gTrackContext, gGeolocation;
var gDebug = false;

var gMinTrackAccuracy = 1000; // meters
var gTrackWidth = 2; // pixels
var gTrackColor = "#FF0000";
var gCurLocSize = 6; // pixels
var gCurLocColor = "#A00000";

var gMapStyles = {
  // OSM tile usage policy: http://wiki.openstreetmap.org/wiki/Tile_usage_policy
  // Find some more OSM ones at http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
  osm_mapnik:
    {name: "OpenStreetMap (Mapnik)",
     url: "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://www.openstreetmap.org/copyright">ODbL/CC-BY-SA</a>'},
  osm_cyclemap:
    {name: "Cycle Map (OSM)",
     url: "http://[a-c].tile.opencyclemap.org/cycle/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://www.openstreetmap.org/copyright">ODbL/CC-BY-SA</a>'},
  osm_transmap:
    {name: "Transport Map (OSM)",
     url: "http://[a-c].tile2.opencyclemap.org/transport/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://www.openstreetmap.org/copyright">ODbL/CC-BY-SA</a>'},
  mapquest_open:
    {name: "MapQuest OSM",
     url: "http://otile[1-4].mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png",
     copyright: 'Map data &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> and contributors (<a href="http://www.openstreetmap.org/copyright">ODbL/CC-BY-SA</a>), tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a>.'},
  mapquest_aerial:
    {name: "MapQuest Open Aerial",
     url: "http://otile[1-4].mqcdn.com/tiles/1.0.0/sat/{z}/{x}/{y}.jpg",
     copyright: 'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a>, portions Courtesy NASA/JPL-Caltech and U.S. Depart. of Agriculture, Farm Service Agency.'},
  opengeoserver_arial:
    {name: "OpenGeoServer Aerial",
     url: "http://services.opengeoserver.org/tiles/1.0.0/globe.aerial_EPSG3857/{z}/{x}/{y}.png?origin=nw",
     copyright: 'Tiles by <a href="http://www.opengeoserver.org/">OpenGeoServer.org</a>, <a href="https://creativecommons.org/licenses/by/3.0/at/">CC-BY 3.0 AT</a>.'},
  google_map:
    {name: "Google Maps",
     url: " http://mt1.google.com/vt/x={x}&y={y}&z={z}",
     copyright: 'Map data and imagery &copy; <a href="http://maps.google.com/">Google</a>'},
};

var gLastMouseX = 0;
var gLastMouseY = 0;

var gLoadingTile;

var gMapPrefsLoaded = false;

var gDragging = false;
var gDragTouchID, gPinchStartWidth;

var gGeoWatchID;
var gTrack = [];
var gLastTrackPoint, gLastDrawnPoint;
var gCenterPosition = true;

var gCurPosMapCache;

function initMap() {
  gGeolocation = navigator.geolocation;
  // Set up canvas contexts. TODO: Remove 2D map once GL support works.
  gMapCanvas = document.getElementById("map");
  gMapContext = gMapCanvas.getContext("2d");
  gGLMapCanvas = document.getElementById("glmap");
  try {
    // Try to grab the standard context. If it fails, fallback to experimental.
    // We also try to tell it we do not need a depth buffer.
    gMap.gl = gGLMapCanvas.getContext("webgl", {depth: false}) ||
              gGLMapCanvas.getContext("experimental-webgl", {depth: false});
  }
  catch(e) {}
  // If we don't have a GL context, give up now
  if (!gMap.gl) {
    showGLWarningDialog();
    gMap.gl = null;
  }
  gTrackCanvas = document.getElementById("track");
  gTrackContext = gTrackCanvas.getContext("2d");
  if (!gMap.activeMap)
    gMap.activeMap = "osm_mapnik";

  //gDebug = true;
  if (gDebug) {
    gGeolocation = geofake;
    var hiddenList = document.getElementsByClassName("debugHide");
    // last to first - list of elements with that class is changing!
    for (var i = hiddenList.length - 1; i >= 0; i--) {
      hiddenList[i].classList.remove("debugHide");
    }
  }

  gAction.addEventListener("prefload-done", gMap.initGL, false);

  console.log("map vars set, loading prefs...");
  loadPrefs();
}

function loadPrefs(aEvent) {
  if (aEvent && aEvent.type == "prefs-step") {
    console.log("wait: " + gWaitCounter);
    if (gWaitCounter == 0) {
      gAction.removeEventListener(aEvent.type, loadPrefs, false);
      gMapPrefsLoaded = true;
      console.log("prefs loaded.");

      gTrackCanvas.addEventListener("mouseup", mapEvHandler, false);
      gTrackCanvas.addEventListener("mousemove", mapEvHandler, false);
      gTrackCanvas.addEventListener("mousedown", mapEvHandler, false);
      gTrackCanvas.addEventListener("mouseout", mapEvHandler, false);

      gTrackCanvas.addEventListener("touchstart", mapEvHandler, false);
      gTrackCanvas.addEventListener("touchmove", mapEvHandler, false);
      gTrackCanvas.addEventListener("touchend", mapEvHandler, false);
      gTrackCanvas.addEventListener("touchcancel", mapEvHandler, false);
      gTrackCanvas.addEventListener("touchleave", mapEvHandler, false);

      gTrackCanvas.addEventListener("wheel", mapEvHandler, false);

      document.getElementById("body").addEventListener("keydown", mapEvHandler, false);

      document.getElementById("copyright").innerHTML =
          gMapStyles[gMap.activeMap].copyright;

      gLoadingTile = new Image();
      gLoadingTile.src = "style/loading.png";
      gLoadingTile.onload = function() {
        var throwEv = new CustomEvent("prefload-done");
        gAction.dispatchEvent(throwEv);
      };
    }
  }
  else {
    if (aEvent)
      gAction.removeEventListener(aEvent.type, loadPrefs, false);
    gAction.addEventListener("prefs-step", loadPrefs, false);
    gWaitCounter++;
    gPrefs.get("position", function(aValue) {
      if (aValue) {
        gMap.pos = aValue;
      }
      gWaitCounter--;
      var throwEv = new CustomEvent("prefs-step");
      gAction.dispatchEvent(throwEv);
    });
    gWaitCounter++;
    gPrefs.get("center_map", function(aValue) {
      if (aValue === undefined)
        document.getElementById("centerCheckbox").checked = true;
      else
        document.getElementById("centerCheckbox").checked = aValue;
      setCentering(document.getElementById("centerCheckbox"));
      gWaitCounter--;
      var throwEv = new CustomEvent("prefs-step");
      gAction.dispatchEvent(throwEv);
    });
    gWaitCounter++;
    gPrefs.get("tracking_enabled", function(aValue) {
      if (aValue === undefined)
        document.getElementById("trackCheckbox").checked = true;
      else
        document.getElementById("trackCheckbox").checked = aValue;
      gWaitCounter--;
      var throwEv = new CustomEvent("prefs-step");
      gAction.dispatchEvent(throwEv);
    });
    gWaitCounter++;
    var trackLoadStarted = false;
    var redrawBase = 100;
    gTrackStore.getListStepped(function(aTPoint) {
      if (aTPoint) {
        // Add in front and return new length.
        var tracklen = gTrack.unshift(aTPoint);
        // Redraw track periodically, larger distance the longer it gets.
        // Initial paint will do initial track drawing.
        if (tracklen % redrawBase == 0) {
          drawTrack();
          redrawBase = tracklen;
        }
      }
      else {
        // Last point received.
        drawTrack();
      }
      if (!trackLoadStarted) {
        // We have the most recent point, if present, rest will load async.
        trackLoadStarted = true;
        gWaitCounter--;
        var throwEv = new CustomEvent("prefs-step");
        gAction.dispatchEvent(throwEv);
      }
    });
  }
}

var gMap = {
  gl: null,
  glShaderProgram: null,
  glVertexPositionAttr: null,
  glTextureCoordAttr: null,
  glResolutionAttr: null,
  glMapTexture: null,
  glTextures: {},
  glTextureKeys: {},

  activeMap: "osm_mapnik",
  tileSize: 256,
  maxZoom: 18, // The minimum is 0.
  zoomFactor: null,
  pos: {
    x: 35630000.0, // Current position in the map in pixels at the maximum zoom level (18)
    y: 23670000.0, // The range is 0-67108864 (2^gMap.maxZoom * gMap.tileSize)
    z: 5           // This could be fractional if supported being between zoom levels.
  },

  getVertShaderSource: function() {
    return 'attribute vec2 aVertexPosition;\n' +
    'attribute vec2 aTextureCoord;\n\n' +
    'uniform vec2 uResolution;\n\n' +
    'varying highp vec2 vTextureCoord;\n\n' +
    'void main(void) {\n' +
    // convert the rectangle from pixels to -1.0 to +1.0 (clipspace) 0.0 to 1.0
    '  vec2 clipSpace = aVertexPosition * 2.0 / uResolution - 1.0;\n' +
    '  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);\n' +
    '  vTextureCoord = aTextureCoord;\n' +
    '}'; },
  getFragShaderSource:function() {
    return 'varying highp vec2 vTextureCoord;\n\n' +
    'uniform sampler2D uImage;\n\n' +
    'void main(void) {\n' +
    '  gl_FragColor = texture2D(uImage, vTextureCoord);\n' +
    '}'; },

  initGL: function() {
    // When called from the event listener, the "this" reference doesn't work, so use the object name.
    if (gMap.gl) {
      gMap.gl.viewport(0, 0, gMap.gl.drawingBufferWidth, gMap.gl.drawingBufferHeight);
      gMap.gl.clearColor(0.0, 0.0, 0.0, 0.5);                          // Set clear color to black, fully opaque.
      gMap.gl.clear(gMap.gl.COLOR_BUFFER_BIT|gMap.gl.DEPTH_BUFFER_BIT);  // Clear the color.

      // Create and initialize the shaders.
      var vertShader = gMap.gl.createShader(gMap.gl.VERTEX_SHADER);
      var fragShader = gMap.gl.createShader(gMap.gl.FRAGMENT_SHADER);
      gMap.gl.shaderSource(vertShader, gMap.getVertShaderSource());
      // Compile the shader program.
      gMap.gl.compileShader(vertShader);
      // See if it compiled successfully.
      if (!gMap.gl.getShaderParameter(vertShader, gMap.gl.COMPILE_STATUS)) {
        console.log("An error occurred compiling the vertex shader: " + gMap.gl.getShaderInfoLog(vertShader));
        return null;
      }
      gMap.gl.shaderSource(fragShader, gMap.getFragShaderSource());
      // Compile the shader program.
      gMap.gl.compileShader(fragShader);
      // See if it compiled successfully.
      if (!gMap.gl.getShaderParameter(fragShader, gMap.gl.COMPILE_STATUS)) {
        console.log("An error occurred compiling the fragment shader: " + gMap.gl.getShaderInfoLog(fragShader));
        return null;
      }

      gMap.glShaderProgram = gMap.gl.createProgram();
      gMap.gl.attachShader(gMap.glShaderProgram, vertShader);
      gMap.gl.attachShader(gMap.glShaderProgram, fragShader);
      gMap.gl.linkProgram(gMap.glShaderProgram);
      // If creating the shader program failed, alert
      if (!gMap.gl.getProgramParameter(gMap.glShaderProgram, gMap.gl.LINK_STATUS)) {
        alert("Unable to initialize the shader program.");
      }
      gMap.gl.useProgram(gMap.glShaderProgram);
      // Get locations of the attributes.
      gMap.glVertexPositionAttr = gMap.gl.getAttribLocation(gMap.glShaderProgram, "aVertexPosition");
      gMap.glTextureCoordAttr = gMap.gl.getAttribLocation(gMap.glShaderProgram, "aTextureCoord");
      gMap.glResolutionAttr = gMap.gl.getUniformLocation(gMap.glShaderProgram, "uResolution");

      var tileVerticesBuffer = gMap.gl.createBuffer();
      gMap.gl.bindBuffer(gMap.gl.ARRAY_BUFFER, tileVerticesBuffer);
      // The vertices are the coordinates of the corner points of the square.
      var vertices = [
        0.0,  0.0,
        1.0,  0.0,
        0.0,  1.0,
        0.0,  1.0,
        1.0,  0.0,
        1.0,  1.0,
      ];
      gMap.gl.bufferData(gMap.gl.ARRAY_BUFFER, new Float32Array(vertices), gMap.gl.STATIC_DRAW);
      gMap.gl.enableVertexAttribArray(gMap.glTextureCoordAttr);
      gMap.gl.vertexAttribPointer(gMap.glTextureCoordAttr, 2, gMap.gl.FLOAT, false, 0, 0);

      gMap.loadImageToTexture(gLoadingTile, 0, "loading::0,0,0");

      gMap.gl.uniform2f(gMap.glResolutionAttr, gGLMapCanvas.width, gGLMapCanvas.height);

      // Create a buffer for the position of the rectangle corners.
      var mapVerticesTextureCoordBuffer = gMap.gl.createBuffer();
      gMap.gl.bindBuffer(gMap.gl.ARRAY_BUFFER, mapVerticesTextureCoordBuffer);
      gMap.gl.enableVertexAttribArray(gMap.glVertexPositionAttr);
      gMap.gl.vertexAttribPointer(gMap.glVertexPositionAttr, 2, gMap.gl.FLOAT, false, 0, 0);
    }

    var throwEv = new CustomEvent("mapinit-done");
    gAction.dispatchEvent(throwEv);
  },

  drawGLTest: function() {
    if (!gMap.gl) { return; }

    this.drawTileGL(5, 10, 0);
    this.drawTileGL(300, 20, 0);
  },

  drawGL: function(aPixels, aOverdraw) {
    if (!gMap.gl) { return; }
    // aPixels is an object with left/right/top/bottom members telling how many
    //   pixels on the borders should actually be drawn.
    // aOverdraw is a bool that tells if we should draw placeholders or draw
    //   straight over the existing content.
    // XXX: Both those optimizations are OFF for GL right now!
    //if (!aPixels)
      aPixels = {left: gMap.gl.drawingBufferWidth, right: gMap.gl.drawingBufferWidth,
                 top: gMap.gl.drawingBufferHeight, bottom: gMap.gl.drawingBufferHeight};
    if (!aOverdraw)
      aOverdraw = false;

    document.getElementById("zoomLevel").textContent = gMap.pos.z;
    gMap.zoomFactor = Math.pow(2, gMap.maxZoom - gMap.pos.z);
    var wid = gMap.gl.drawingBufferWidth * gMap.zoomFactor; // Width in level 18 pixels.
    var ht = gMap.gl.drawingBufferHeight * gMap.zoomFactor; // Height in level 18 pixels.
    var size = gMap.tileSize * gMap.zoomFactor; // Tile size in level 18 pixels.

    var xMin = gMap.pos.x - wid / 2; // Corners of the window in level 18 pixels.
    var yMin = gMap.pos.y - ht / 2;
    var xMax = gMap.pos.x + wid / 2;
    var yMax = gMap.pos.y + ht / 2;

    if (gMapPrefsLoaded && mainDB)
      gPrefs.set("position", gMap.pos);

    var tiles = {left: Math.ceil((xMin + aPixels.left * gMap.zoomFactor) / size) -
                                 (aPixels.left ? 0 : 1),
                 right: Math.floor((xMax - aPixels.right * gMap.zoomFactor) / size) -
                                   (aPixels.right ? 1 : 0),
                 top: Math.ceil((yMin + aPixels.top * gMap.zoomFactor) / size) -
                                (aPixels.top ? 0 : 1),
                 bottom: Math.floor((yMax - aPixels.bottom * gMap.zoomFactor) / size) -
                                    (aPixels.bottom ? 1 : 0)};

    // Go through all the tiles in the map, find out if to draw them and do so.
    for (var x = Math.floor(xMin / size); x < Math.ceil(xMax / size); x++) {
      for (var y = Math.floor(yMin / size); y < Math.ceil(yMax / size); y++) { // slow script warnings on the tablet appear here!
        // Only go to the drawing step if we need to draw this tile.
        if (x < tiles.left || x > tiles.right ||
            y < tiles.top || y > tiles.bottom) {
          // Round here is **CRUCIAL** otherwise the images are filtered
          // and the performance sucks (more than expected).
          var xoff = Math.round((x * size - xMin) / gMap.zoomFactor);
          var yoff = Math.round((y * size - yMin) / gMap.zoomFactor);
          // Draw placeholder tile unless we overdraw.
          if (!aOverdraw &&
              (x < tiles.left -1  || x > tiles.right + 1 ||
              y < tiles.top -1 || y > tiles.bottom + 1)) {
            gMap.drawTileGL(xoff, yoff, 0);
          }
          // Initiate loading/drawing of the actual tile.
          gTileService.get(gMap.activeMap, {x: x, y: y, z: gMap.pos.z},
                          function(aImage, aStyle, aCoords, aTileKey) {
            // Only draw if this applies for the current view.
            if ((aStyle == gMap.activeMap) && (aCoords.z == gMap.pos.z)) {
              var ixMin = gMap.pos.x - wid / 2;
              var iyMin = gMap.pos.y - ht / 2;
              var ixoff = Math.round((aCoords.x * size - ixMin) / gMap.zoomFactor);
              var iyoff = Math.round((aCoords.y * size - iyMin) / gMap.zoomFactor);
              var URL = window.URL;
              var imgURL = URL.createObjectURL(aImage);
              var imgObj = new Image();
              imgObj.src = imgURL;
              imgObj.onload = function() {
                var txIndex = gMap.glTextureKeys[aTileKey];
                if (!txIndex) {
                  txIndex = Object.keys(gMap.glTextureKeys).length;
                  gMap.loadImageToTexture(imgObj, txIndex, aTileKey);
                }
                gMap.drawTileGL(ixoff, iyoff, txIndex);
                URL.revokeObjectURL(imgURL);
              }
            }
          });
        }
      }
    }
    //drawTrack();
  },

  resizeAndDrawGL: function() {
    if (!gMap.gl) { return; }

    gMap.gl.viewport(0, 0, gMap.gl.drawingBufferWidth, gMap.gl.drawingBufferHeight);
    gMap.gl.clear(gMap.gl.COLOR_BUFFER_BIT);  // Clear the color.
    gMap.gl.uniform2f(gMap.glResolutionAttr, gGLMapCanvas.width, gGLMapCanvas.height);
    //gMap.drawGLTest();
    gMap.drawGL();
  },

  drawTileGL: function(aLeft, aRight, aTextureIndex) {
    gMap.gl.activeTexture(gMap.gl.TEXTURE0 + aTextureIndex);
    gMap.gl.bindTexture(gMap.gl.TEXTURE_2D, gMap.glTextures[aTextureIndex]);
    var x_start = aLeft;
    var i_width = gMap.tileSize;
    var y_start = aRight;
    var i_height = gMap.tileSize;
    var textureCoordinates = [
      x_start, y_start,
      x_start + i_width, y_start,
      x_start, y_start + i_height,
      x_start, y_start + i_height,
      x_start + i_width, y_start,
      x_start + i_width, y_start + i_height,
    ];
    gMap.gl.bufferData(gMap.gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gMap.gl.STATIC_DRAW);

    // There are 6 indices in textureCoordinates.
    gMap.gl.drawArrays(gMap.gl.TRIANGLES, 0, 6);
  },

  loadImageToTexture: function(aImage, aTextureIndex, aTileKey) {
    gMap.glTextureKeys[aTileKey] = aTextureIndex;
    // Create and bind texture.
    gMap.glTextures[aTextureIndex] = gMap.gl.createTexture();
    gMap.gl.activeTexture(gMap.gl.TEXTURE0 + aTextureIndex);
    gMap.gl.bindTexture(gMap.gl.TEXTURE_2D, gMap.glTextures[aTextureIndex]);
    gMap.gl.uniform1i(gMap.gl.getUniformLocation(gMap.glShaderProgram, "uImage"), 0);
    // Set params for how the texture minifies and magnifies (wrap params are not needed as we're power-of-two).
    gMap.gl.texParameteri(gMap.gl.TEXTURE_2D, gMap.gl.TEXTURE_MIN_FILTER, gMap.gl.NEAREST);
    gMap.gl.texParameteri(gMap.gl.TEXTURE_2D, gMap.gl.TEXTURE_MAG_FILTER, gMap.gl.NEAREST);
    // Upload the image into the texture.
    gMap.gl.texImage2D(gMap.gl.TEXTURE_2D, 0, gMap.gl.RGBA, gMap.gl.RGBA, gMap.gl.UNSIGNED_BYTE, aImage);
  },
}

function resizeAndDraw() {
  var viewportWidth = Math.min(window.innerWidth, window.outerWidth);
  var viewportHeight = Math.min(window.innerHeight, window.outerHeight);
  if (gMapCanvas && gGLMapCanvas && gTrackCanvas) {
    gMapCanvas.width = viewportWidth;
    gMapCanvas.height = viewportHeight;
    gGLMapCanvas.width = viewportWidth;
    gGLMapCanvas.height = viewportHeight;
    gTrackCanvas.width = viewportWidth;
    gTrackCanvas.height = viewportHeight;
    drawMap();
    gMap.resizeAndDrawGL();
    showUI();
  }
}

// Using scale(x, y) together with drawing old data on scaled canvas would be an improvement for zooming.
// See https://developer.mozilla.org/en-US/docs/Canvas_tutorial/Transformations#Scaling

function zoomIn() {
  if (gMap.pos.z < gMap.maxZoom) {
    gMap.pos.z++;
    drawMap();
  }
}

function zoomOut() {
  if (gMap.pos.z > 0) {
    gMap.pos.z--;
    drawMap();
  }
}

function zoomTo(aTargetLevel) {
  aTargetLevel = parseInt(aTargetLevel);
  if (aTargetLevel >= 0 && aTargetLevel <= gMap.maxZoom) {
    gMap.pos.z = aTargetLevel;
    drawMap();
  }
}

function gps2xy(aLatitude, aLongitude) {
  var maxZoomFactor = Math.pow(2, gMap.maxZoom) * gMap.tileSize;
  var convLat = aLatitude * Math.PI / 180;
  var rawY = (1 - Math.log(Math.tan(convLat) +
                           1 / Math.cos(convLat)) / Math.PI) / 2 * maxZoomFactor;
  var rawX = (aLongitude + 180) / 360 * maxZoomFactor;
  return {x: Math.round(rawX),
          y: Math.round(rawY)};
}

function xy2gps(aX, aY) {
  var maxZoomFactor = Math.pow(2, gMap.maxZoom) * gMap.tileSize;
  var n = Math.PI - 2 * Math.PI * aY / maxZoomFactor;
  return {latitude: 180 / Math.PI *
                    Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
          longitude: aX / maxZoomFactor * 360 - 180};
}

function setMapStyle() {
  var mapSel = document.getElementById("mapSelector");
  if (mapSel.selectedIndex >= 0 && gMap.activeMap != mapSel.value) {
    gMap.activeMap = mapSel.value;
    document.getElementById("copyright").innerHTML =
        gMapStyles[gMap.activeMap].copyright;
    showUI();
    drawMap();
  }
}

// A sane mod function that works for negative numbers.
// Returns a % b.
function mod(a, b) {
  return ((a % b) + b) % b;
}

function normalizeCoords(aCoords) {
  var zoomFactor = Math.pow(2, aCoords.z);
  return {x: mod(aCoords.x, zoomFactor),
          y: mod(aCoords.y, zoomFactor),
          z: aCoords.z};
}

// Returns true if the tile is outside the current view.
function isOutsideWindow(t) {
  var pos = decodeIndex(t);

  var zoomFactor = Math.pow(2, gMap.maxZoom - pos.z);
  var wid = gMapCanvas.width * zoomFactor;
  var ht = gMapCanvas.height * zoomFactor;

  pos.x *= zoomFactor;
  pos.y *= zoomFactor;

  var sz = gMap.tileSize * zoomFactor;
  if (pos.x > gMap.pos.x + wid / 2 || pos.y > gMap.pos.y + ht / 2 ||
      pos.x + sz < gMap.pos.x - wid / 2 || pos.y - sz < gMap.pos.y - ht / 2)
    return true;
  return false;
}

function encodeIndex(x, y, z) {
  var norm = normalizeCoords({x: x, y: y, z: z});
  return norm.x + "," + norm.y + "," + norm.z;
}

function decodeIndex(encodedIdx) {
  var ind = encodedIdx.split(",", 3);
  return {x: ind[0], y: ind[1], z: ind[2]};
}

function drawMap(aPixels, aOverdraw) {
  gMap.drawGL(aPixels, aOverdraw);
  /*
  // aPixels is an object with left/right/top/bottom members telling how many
  //   pixels on the borders should actually be drawn.
  // aOverdraw is a bool that tells if we should draw placeholders or draw
  //   straight over the existing content.
  if (!aPixels)
    aPixels = {left: gMapCanvas.width, right: gMapCanvas.width,
               top: gMapCanvas.height, bottom: gMapCanvas.height};
  if (!aOverdraw)
    aOverdraw = false;

  document.getElementById("zoomLevel").textContent = gMap.pos.z;
  gMap.zoomFactor = Math.pow(2, gMap.maxZoom - gMap.pos.z);
  var wid = gMapCanvas.width * gMap.zoomFactor; // Width in level 18 pixels.
  var ht = gMapCanvas.height * gMap.zoomFactor; // Height in level 18 pixels.
  var size = gMap.tileSize * gMap.zoomFactor; // Tile size in level 18 pixels.

  var xMin = gMap.pos.x - wid / 2; // Corners of the window in level 18 pixels.
  var yMin = gMap.pos.y - ht / 2;
  var xMax = gMap.pos.x + wid / 2;
  var yMax = gMap.pos.y + ht / 2;

  if (gMapPrefsLoaded && mainDB)
    gPrefs.set("position", gMap.pos);

  var tiles = {left: Math.ceil((xMin + aPixels.left * gMap.zoomFactor) / size) -
                               (aPixels.left ? 0 : 1),
               right: Math.floor((xMax - aPixels.right * gMap.zoomFactor) / size) -
                                 (aPixels.right ? 1 : 0),
               top: Math.ceil((yMin + aPixels.top * gMap.zoomFactor) / size) -
                              (aPixels.top ? 0 : 1),
               bottom: Math.floor((yMax - aPixels.bottom * gMap.zoomFactor) / size) -
                                  (aPixels.bottom ? 1 : 0)};

  // Go through all the tiles in the map, find out if to draw them and do so.
  for (var x = Math.floor(xMin / size); x < Math.ceil(xMax / size); x++) {
    for (var y = Math.floor(yMin / size); y < Math.ceil(yMax / size); y++) { // slow script warnings on the tablet appear here!
      // Only go to the drawing step if we need to draw this tile.
      if (x < tiles.left || x > tiles.right ||
          y < tiles.top || y > tiles.bottom) {
        // Round here is **CRUCIAL** otherwise the images are filtered
        // and the performance sucks (more than expected).
        var xoff = Math.round((x * size - xMin) / gMap.zoomFactor);
        var yoff = Math.round((y * size - yMin) / gMap.zoomFactor);
        // Draw placeholder tile unless we overdraw.
        if (!aOverdraw &&
            (x < tiles.left -1  || x > tiles.right + 1 ||
             y < tiles.top -1 || y > tiles.bottom + 1))
          gMapContext.drawImage(gLoadingTile, xoff, yoff);

        // Initiate loading/drawing of the actual tile.
        gTileService.get(gMap.activeMap, {x: x, y: y, z: gMap.pos.z},
                         function(aImage, aStyle, aCoords, aTileKey) {
          // Only draw if this applies for the current view.
          if ((aStyle == gMap.activeMap) && (aCoords.z == gMap.pos.z)) {
            var ixMin = gMap.pos.x - wid / 2;
            var iyMin = gMap.pos.y - ht / 2;
            var ixoff = Math.round((aCoords.x * size - ixMin) / gMap.zoomFactor);
            var iyoff = Math.round((aCoords.y * size - iyMin) / gMap.zoomFactor);
            var URL = window.URL;
            var imgURL = URL.createObjectURL(aImage);
            var imgObj = new Image();
            imgObj.src = imgURL;
            imgObj.onload = function() {
              gMapContext.drawImage(imgObj, ixoff, iyoff);
              URL.revokeObjectURL(imgURL);
            }
          }
        });
      }
    }
  }
  */
  drawTrack();
}

function drawTrack() {
  gLastDrawnPoint = null;
  gCurPosMapCache = undefined;
  gTrackContext.clearRect(0, 0, gTrackCanvas.width, gTrackCanvas.height);
  if (gTrack.length) {
    for (var i = 0; i < gTrack.length; i++) {
      drawTrackPoint(gTrack[i].coords.latitude, gTrack[i].coords.longitude,
                     (i + 1 >= gTrack.length));
    }
  }
}

function drawTrackPoint(aLatitude, aLongitude, lastPoint) {
  var trackpoint = gps2xy(aLatitude, aLongitude);
  // lastPoint is for optimizing (not actually executing the draw until the last)
  trackpoint.optimized = (lastPoint === false);
  var mappos = {x: Math.round((trackpoint.x - gMap.pos.x) / gMap.zoomFactor + gMapCanvas.width / 2),
                y: Math.round((trackpoint.y - gMap.pos.y) / gMap.zoomFactor + gMapCanvas.height / 2)};

  if (!gLastDrawnPoint || !gLastDrawnPoint.optimized) {
    gTrackContext.strokeStyle = gTrackColor;
    gTrackContext.fillStyle = gTrackContext.strokeStyle;
    gTrackContext.lineWidth = gTrackWidth;
    gTrackContext.lineCap = "round";
    gTrackContext.lineJoin = "round";
  }
  if (!gLastDrawnPoint || gLastDrawnPoint == trackpoint) {
    // This breaks optimiziation, so make sure to close path and reset optimization.
    if (gLastDrawnPoint && gLastDrawnPoint.optimized)
      gTrackContext.stroke();
    gTrackContext.beginPath();
    trackpoint.optimized = false;
    gTrackContext.arc(mappos.x, mappos.y,
                      gTrackContext.lineWidth, 0, Math.PI * 2, false);
    gTrackContext.fill();
  }
  else {
    if (!gLastDrawnPoint || !gLastDrawnPoint.optimized) {
      gTrackContext.beginPath();
      gTrackContext.moveTo(Math.round((gLastDrawnPoint.x - gMap.pos.x) / gMap.zoomFactor + gMapCanvas.width / 2),
                           Math.round((gLastDrawnPoint.y - gMap.pos.y) / gMap.zoomFactor + gMapCanvas.height / 2));
    }
    gTrackContext.lineTo(mappos.x, mappos.y);
    if (!trackpoint.optimized)
      gTrackContext.stroke();
  }
  gLastDrawnPoint = trackpoint;
}

function drawCurrentLocation(trackPoint) {
  var locpoint = gps2xy(trackPoint.coords.latitude, trackPoint.coords.longitude);
  var circleRadius = Math.round(gCurLocSize / 2);
  var mappos = {x: Math.round((locpoint.x - gMap.pos.x) / gMap.zoomFactor + gMapCanvas.width / 2),
                y: Math.round((locpoint.y - gMap.pos.y) / gMap.zoomFactor + gMapCanvas.height / 2)};

  undrawCurrentLocation();

  // Cache overdrawn area.
  gCurPosMapCache =
      {point: locpoint,
       radius: circleRadius,
       data: gTrackContext.getImageData(mappos.x - circleRadius,
                                        mappos.y - circleRadius,
                                        circleRadius * 2, circleRadius * 2)};

  gTrackContext.strokeStyle = gCurLocColor;
  gTrackContext.fillStyle = gTrackContext.strokeStyle;
  gTrackContext.beginPath();
  gTrackContext.arc(mappos.x, mappos.y,
                    circleRadius, 0, Math.PI * 2, false);
  gTrackContext.fill();
}

function undrawCurrentLocation() {
  if (gCurPosMapCache) {
    var oldpoint = gCurPosMapCache.point;
    var oldmp = {x: Math.round((oldpoint.x - gMap.pos.x) / gMap.zoomFactor + gMapCanvas.width / 2),
                 y: Math.round((oldpoint.y - gMap.pos.y) / gMap.zoomFactor + gMapCanvas.height / 2)};
    gTrackContext.putImageData(gCurPosMapCache.data,
                               oldmp.x - gCurPosMapCache.radius,
                               oldmp.y - gCurPosMapCache.radius);
    gCurPosMapCache = undefined;
  }
}

var mapEvHandler = {
  handleEvent: function(aEvent) {
    var touchEvent = aEvent.type.indexOf('touch') != -1;

    if (touchEvent) {
      aEvent.stopPropagation();
    }

    // Bail out if the event is happening on an input.
    if (aEvent.target.tagName.toLowerCase() == "input")
      return;

    // Bail out on unwanted map moves, but not zoom or keyboard events.
    if (aEvent.type.indexOf("mouse") === 0 || aEvent.type.indexOf("touch") === 0) {
      // Bail out if this is neither a touch nor left-click.
      if (!touchEvent && aEvent.button != 0)
        return;

      // Bail out if the started touch can't be found.
      if (touchEvent && gDragging &&
          !aEvent.changedTouches.identifiedTouch(gDragTouchID))
        return;
    }

    var coordObj = touchEvent ?
                   aEvent.changedTouches.identifiedTouch(gDragTouchID) :
                   aEvent;

    switch (aEvent.type) {
      case "mousedown":
      case "touchstart":
        if (touchEvent) {
          if (aEvent.targetTouches.length == 2) {
            gPinchStartWidth = Math.sqrt(
                Math.pow(aEvent.targetTouches.item(1).clientX -
                         aEvent.targetTouches.item(0).clientX, 2) +
                Math.pow(aEvent.targetTouches.item(1).clientY -
                         aEvent.targetTouches.item(0).clientY, 2)
            );
          }
          gDragTouchID = aEvent.changedTouches.item(0).identifier;
          coordObj = aEvent.changedTouches.identifiedTouch(gDragTouchID);
        }
        var x = coordObj.clientX - gMapCanvas.offsetLeft;
        var y = coordObj.clientY - gMapCanvas.offsetTop;

        if (touchEvent || aEvent.button === 0) {
          gDragging = true;
        }
        gLastMouseX = x;
        gLastMouseY = y;
        showUI();
        break;
      case "mousemove":
      case "touchmove":
        if (touchEvent && aEvent.targetTouches.length == 2) {
          curPinchStartWidth = Math.sqrt(
              Math.pow(aEvent.targetTouches.item(1).clientX -
                       aEvent.targetTouches.item(0).clientX, 2) +
              Math.pow(aEvent.targetTouches.item(1).clientY -
                       aEvent.targetTouches.item(0).clientY, 2)
          );
          if (!gPinchStartWidth)
            gPinchStartWidth = curPinchStartWidth;

          if (gPinchStartWidth / curPinchStartWidth > 1.7 ||
              gPinchStartWidth / curPinchStartWidth < 0.6) {
            var newZoomLevel = gMap.pos.z + (gPinchStartWidth < curPinchStartWidth ? 1 : -1);
            if ((newZoomLevel >= 0) && (newZoomLevel <= gMap.maxZoom)) {
              // Calculate new center of the map - preserve middle of pinch.
              // This means that pixel distance between old center and middle
              // must equal pixel distance of new center and middle.
              var x = (aEvent.targetTouches.item(1).clientX +
                       aEvent.targetTouches.item(0).clientX) / 2 -
                      gMapCanvas.offsetLeft;
              var y = (aEvent.targetTouches.item(1).clientY +
                       aEvent.targetTouches.item(0).clientY) / 2 -
                      gMapCanvas.offsetTop;

              // Zoom factor after this action.
              var newZoomFactor = Math.pow(2, gMap.maxZoom - newZoomLevel);
              gMap.pos.x -= (x - gMapCanvas.width / 2) * (newZoomFactor - gMap.zoomFactor);
              gMap.pos.y -= (y - gMapCanvas.height / 2) * (newZoomFactor - gMap.zoomFactor);

              if (gPinchStartWidth < curPinchStartWidth)
                zoomIn();
              else
                zoomOut();

              // Reset pinch start width and start another pinch gesture.
              gPinchStartWidth = null;
            }
          }
          // If we are in a pinch, do not drag.
          break;
        }
        var x = coordObj.clientX - gMapCanvas.offsetLeft;
        var y = coordObj.clientY - gMapCanvas.offsetTop;
        if (gDragging === true) {
          var dX = x - gLastMouseX;
          var dY = y - gLastMouseY;
          gMap.pos.x -= dX * gMap.zoomFactor;
          gMap.pos.y -= dY * gMap.zoomFactor;
          if (true) { // use optimized path
            var mapData = gMapContext.getImageData(0, 0,
                                                   gMapCanvas.width,
                                                   gMapCanvas.height);
            gMapContext.clearRect(0, 0, gMapCanvas.width, gMapCanvas.height);
            gMapContext.putImageData(mapData, dX, dY);
            drawMap({left: (dX > 0) ? dX : 0,
                     right: (dX < 0) ? -dX : 0,
                     top: (dY > 0) ? dY : 0,
                     bottom: (dY < 0) ? -dY : 0});
          }
          else {
            drawMap(false, true);
          }
          showUI();
        }
        gLastMouseX = x;
        gLastMouseY = y;
        break;
      case "mouseup":
      case "touchend":
        gPinchStartWidth = null;
        gDragging = false;
        showUI();
        break;
      case "mouseout":
      case "touchcancel":
      case "touchleave":
        //gDragging = false;
        break;
      case "wheel":
        // If we'd want pixels, we'd need to calc up using aEvent.deltaMode.
        // See https://developer.mozilla.org/en-US/docs/Mozilla_event_reference/wheel

        // Only accept (non-null) deltaY values
        if (!aEvent.deltaY)
          break;

        // Debug output: "coordinates" of the point the mouse was over.
        /*
        var ptCoord = {x: gMap.pos.x + (x - gMapCanvas.width / 2) * gMap.zoomFactor,
                       y: gMap.pos.y + (x - gMapCanvas.height / 2) * gMap.zoomFactor};
        var gpsCoord = xy2gps(ptCoord.x, ptCoord.y);
        var pt2Coord = gps2xy(gpsCoord.latitude, gpsCoord.longitude);
        console.log(ptCoord.x + "/" + ptCoord.y + " - " +
                    gpsCoord.latitude + "/" + gpsCoord.longitude + " - " +
                    pt2Coord.x + "/" + pt2Coord.y);
        */

        var newZoomLevel = gMap.pos.z + (aEvent.deltaY < 0 ? 1 : -1);
        if ((newZoomLevel >= 0) && (newZoomLevel <= gMap.maxZoom)) {
          // Calculate new center of the map - same point stays under the mouse.
          // This means that the pixel distance between the old center and point
          // must equal the pixel distance of the new center and that point.
          var x = coordObj.clientX - gMapCanvas.offsetLeft;
          var y = coordObj.clientY - gMapCanvas.offsetTop;

          // Zoom factor after this action.
          var newZoomFactor = Math.pow(2, gMap.maxZoom - newZoomLevel);
          gMap.pos.x -= (x - gMapCanvas.width / 2) * (newZoomFactor - gMap.zoomFactor);
          gMap.pos.y -= (y - gMapCanvas.height / 2) * (newZoomFactor - gMap.zoomFactor);

          if (aEvent.deltaY < 0)
            zoomIn();
          else
            zoomOut();
        }
        break;
      case "keydown":
        // Allow keyboard control to move and zoom the map.
        // Should use aEvent.key instead of aEvent.which but needs bug 680830.
        // See https://developer.mozilla.org/en-US/docs/DOM/Mozilla_event_reference/keydown
        var dX = 0;
        var dY = 0;
        switch (aEvent.which) {
          case 39: // right
            dX = -gMap.tileSize / 2;
          break;
          case 37: // left
            dX = gMap.tileSize / 2;
          break;
          case 38: // up
            dY = gMap.tileSize / 2;
          break;
          case 40: // down
            dY = -gMap.tileSize / 2;
          break;
          case 87: // w
          case 107: // + (numpad)
          case 171: // + (normal key)
            zoomIn();
          break;
          case 83: // s
          case 109: // - (numpad)
          case 173: // - (normal key)
            zoomOut();
          break;
          case 48: // 0
          case 49: // 1
          case 50: // 2
          case 51: // 3
          case 52: // 4
          case 53: // 5
          case 54: // 6
          case 55: // 7
          case 56: // 8
            zoomTo(aEvent.which - 38);
          break;
          case 57: // 9
            zoomTo(9);
          break;
          case 96: // 0 (numpad)
          case 97: // 1 (numpad)
          case 98: // 2 (numpad)
          case 99: // 3 (numpad)
          case 100: // 4 (numpad)
          case 101: // 5 (numpad)
          case 102: // 6 (numpad)
          case 103: // 7 (numpad)
          case 104: // 8 (numpad)
            zoomTo(aEvent.which - 86);
          break;
          case 105: // 9 (numpad)
            zoomTo(9);
          break;
          default: // not supported
            console.log("key not supported: " + aEvent.which);
          break;
        }

        // Move if needed.
        if (dX || dY) {
          gMap.pos.x -= dX * gMap.zoomFactor;
          gMap.pos.y -= dY * gMap.zoomFactor;
          if (true) { // use optimized path
            var mapData = gMapContext.getImageData(0, 0,
                                                   gMapCanvas.width,
                                                   gMapCanvas.height);
            gMapContext.clearRect(0, 0, gMapCanvas.width, gMapCanvas.height);
            gMapContext.putImageData(mapData, dX, dY);
            drawMap({left: (dX > 0) ? dX : 0,
                     right: (dX < 0) ? -dX : 0,
                     top: (dY > 0) ? dY : 0,
                     bottom: (dY < 0) ? -dY : 0});
          }
          else {
            drawMap(false, true);
          }
        }
        break;
    }
  }
};

var geofake = {
  tracking: false,
  lastPos: {x: undefined, y: undefined},
  watchPosition: function(aSuccessCallback, aErrorCallback, aPrefObject) {
    this.tracking = true;
    var watchCall = function() {
      // calc new position in lat/lon degrees
      // 90° on Earth surface are ~10,000 km at the equator,
      // so try moving at most 10m at a time
      if (geofake.lastPos.x)
        geofake.lastPos.x += (Math.random() - .5) * 90 / 1000000
      else
        geofake.lastPos.x = 48.208174
      if (geofake.lastPos.y)
        geofake.lastPos.y += (Math.random() - .5) * 90 / 1000000
      else
        geofake.lastPos.y = 16.373819
      aSuccessCallback({timestamp: Date.now(),
                        coords: {latitude: geofake.lastPos.x,
                                 longitude: geofake.lastPos.y,
                                 accuracy: 20}});
      if (geofake.tracking)
        setTimeout(watchCall, 1000);
    };
    setTimeout(watchCall, 1000);
    return "foo";
  },
  clearWatch: function(aID) {
    this.tracking = false;
  }
}

function setCentering(aCheckbox) {
  if (gMapPrefsLoaded && mainDB)
    gPrefs.set("center_map", aCheckbox.checked);
  gCenterPosition = aCheckbox.checked;
}

function setTracking(aCheckbox) {
  if (gMapPrefsLoaded && mainDB)
    gPrefs.set("tracking_enabled", aCheckbox.checked);
  if (aCheckbox.checked)
    startTracking();
  else
    endTracking();
}

function startTracking() {
  if (gGeolocation) {
    gActionLabel.textContent = "Establishing Position";
    gAction.style.display = "block";
    gGeoWatchID = gGeolocation.watchPosition(
      function(position) {
        if (gActionLabel.textContent) {
          gActionLabel.textContent = "";
          gAction.style.display = "none";
        }
        // Coords spec: https://developer.mozilla.org/en/XPCOM_Interface_Reference/NsIDOMGeoPositionCoords
        var tPoint = {time: position.timestamp,
                      coords: {latitude: position.coords.latitude,
                               longitude: position.coords.longitude,
                               altitude: position.coords.altitude,
                               accuracy: position.coords.accuracy,
                               altitudeAccuracy: position.coords.altitudeAccuracy,
                               heading: position.coords.heading,
                               speed: position.coords.speed},
                      beginSegment: !gLastTrackPoint};
        // Only add point to track is accuracy is good enough.
        if (tPoint.coords.accuracy < gMinTrackAccuracy) {
          gLastTrackPoint = tPoint;
          gTrack.push(tPoint);
          try { gTrackStore.push(tPoint); } catch(e) {}
          var redrawn = false;
          if (gCenterPosition) {
            var posCoord = gps2xy(position.coords.latitude,
                                  position.coords.longitude);
            if (Math.abs(gMap.pos.x - posCoord.x) > gMapCanvas.width * gMap.zoomFactor / 4 ||
                Math.abs(gMap.pos.y - posCoord.y) > gMapCanvas.height * gMap.zoomFactor / 4) {
              gMap.pos.x = posCoord.x;
              gMap.pos.y = posCoord.y;
              drawMap(); // This draws the current point as well.
              redrawn = true;
            }
          }
          if (!redrawn)
            undrawCurrentLocation();
            drawTrackPoint(position.coords.latitude, position.coords.longitude, true);
        }
        drawCurrentLocation(tPoint);
      },
      function(error) {
        // Ignore erros for the moment, but this is good for debugging.
        // See https://developer.mozilla.org/en/Using_geolocation#Handling_errors
        if (gDebug)
          console.log(error.message);
      },
      {enableHighAccuracy: true}
    );
  }
}

function endTracking() {
  if (gActionLabel.textContent) {
    gActionLabel.textContent = "";
    gAction.style.display = "none";
  }
  if (gGeoWatchID) {
    gGeolocation.clearWatch(gGeoWatchID);
  }
}

function clearTrack() {
  gTrack = [];
  gTrackStore.clear();
  drawTrack();
}

var gTileService = {
  objStore: "tilecache",

  ageLimit: 14 * 86400 * 1000, // 2 weeks (in ms)

  get: function(aStyle, aCoords, aCallback) {
    var norm = normalizeCoords(aCoords);
    var dbkey = aStyle + "::" + norm.x + "," + norm.y + "," + norm.z;
    this.getDBCache(dbkey, function(aResult, aEvent) {
      if (aResult) {
        // We did get a cached object.
        aCallback(aResult.image, aStyle, aCoords, dbkey);
        // Look at the timestamp and return if it's not too old.
        if (aResult.timestamp + gTileService.ageLimit > Date.now())
          return;
        // Reload cached tile otherwise.
        var oldDate = new Date(aResult.timestamp);
        console.log("reload cached tile: " + dbkey + " - " + oldDate.toUTCString());
      }
      // Retrieve image from the web and store it in the cache.
      var XHR = new XMLHttpRequest();
      XHR.open("GET",
                gMapStyles[aStyle].url
                  .replace("{x}", norm.x)
                  .replace("{y}", norm.y)
                  .replace("{z}", norm.z)
                  .replace("[a-c]", String.fromCharCode(97 + Math.floor(Math.random() * 2)))
                  .replace("[1-4]", 1 + Math.floor(Math.random() * 3)),
                true);
      XHR.responseType = "blob";
      XHR.addEventListener("load", function () {
        if (XHR.status === 200) {
          var blob = XHR.response;
          aCallback(blob, aStyle, aCoords, dbkey);
          gTileService.setDBCache(dbkey, {image: blob, timestamp: Date.now()});
        }
      }, false);
      XHR.send();
    });
  },

  getDBCache: function(aKey, aCallback) {
    if (!mainDB)
      return;
    var transaction = mainDB.transaction([this.objStore]);
    var request = transaction.objectStore(this.objStore).get(aKey);
    request.onsuccess = function(event) {
      aCallback(request.result, event);
    };
    request.onerror = function(event) {
      // Errors can be handled here.
      aCallback(undefined, event);
    };
  },

  setDBCache: function(aKey, aValue, aCallback) {
    if (!mainDB)
      return;
    var success = false;
    var transaction = mainDB.transaction([this.objStore], "readwrite");
    var objStore = transaction.objectStore(this.objStore);
    var request = objStore.put(aValue, aKey);
    request.onsuccess = function(event) {
      success = true;
      if (aCallback)
        aCallback(success, event);
    };
    request.onerror = function(event) {
      // Errors can be handled here.
      if (aCallback)
        aCallback(success, event);
    };
  },

  unsetDBCache: function(aKey, aCallback) {
    if (!mainDB)
      return;
    var success = false;
    var transaction = mainDB.transaction([this.objStore], "readwrite");
    var request = transaction.objectStore(this.objStore).delete(aKey);
    request.onsuccess = function(event) {
      success = true;
      if (aCallback)
        aCallback(success, event);
    };
    request.onerror = function(event) {
      // Errors can be handled here.
      if (aCallback)
        aCallback(success, event);
    }
  },

  clearDB: function(aCallback) {
    if (!mainDB)
      return;
    var success = false;
    var transaction = mainDB.transaction([this.objStore], "readwrite");
    var request = transaction.objectStore(this.objStore).clear();
    request.onsuccess = function(event) {
      success = true;
      if (aCallback)
        aCallback(success, event);
    };
    request.onerror = function(event) {
      // Errors can be handled here.
      if (aCallback)
        aCallback(success, event);
    }
  }
};
