/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var gMapCanvas, gMapContext, gTrackCanvas, gTrackContext, gGeolocation;
var gDebug = true;

var gTileSize = 256;
var gMaxZoom = 18; // The minimum is 0.

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
     url: "http://oatile[1-4].mqcdn.com/tiles/1.0.0/sat/{z}/{x}/{y}.jpg",
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
var gActiveMap = "osm_mapnik";

var gPos = {x: 35630000.0, // Current position in the map in pixels at the maximum zoom level (18)
            y: 23670000.0, // The range is 0-67108864 (2^gMaxZoom * gTileSize)
            z: 5}; // This could be fractional if supported being between zoom levels.

var gLastMouseX = 0;
var gLastMouseY = 0;
var gZoomFactor;

// Used as an associative array.
// The keys have to be strings, ours will be "xindex,yindex,zindex" e.g. "13,245,12".
var gTiles = {};
var gLoadingTile;

var gMapPrefsLoaded = false;

var gDragging = false;
var gDragTouchID;

var gGeoWatchID;
var gTrack = [];
var gLastTrackPoint, gLastDrawnPoint;
var gCenterPosition = true;

var gCurPosMapCache;

function initMap() {
  gGeolocation = navigator.geolocation;
  gMapCanvas = document.getElementById("map");
  gMapContext = gMapCanvas.getContext("2d");
  gTrackCanvas = document.getElementById("track");
  gTrackContext = gTrackCanvas.getContext("2d");
  if (!gActiveMap)
    gActiveMap = "osm_mapnik";

  //gDebug = true;
  if (gDebug) {
    gGeolocation = geofake;
    var hiddenList = document.getElementsByClassName("debugHide");
    // last to first - list of elements with that class is changing!
    for (var i = hiddenList.length - 1; i >= 0; i--) {
      hiddenList[i].classList.remove("debugHide");
    }
  }

  var loopCnt = 0;
  var getPersistentPrefs = function() {
    if (mainDB) {
      gWaitCounter++;
      gPrefs.get("position", function(aValue) {
        if (aValue) {
          gPos = aValue;
          gWaitCounter--;
        }
      });
      gWaitCounter++;
      gPrefs.get("center_map", function(aValue) {
        if (aValue === undefined)
          document.getElementById("centerCheckbox").checked = true;
        else
          document.getElementById("centerCheckbox").checked = aValue;
        setCentering(document.getElementById("centerCheckbox"));
        gWaitCounter--;
      });
      gWaitCounter++;
      gPrefs.get("tracking_enabled", function(aValue) {
        if (aValue === undefined)
          document.getElementById("trackCheckbox").checked = true;
        else
          document.getElementById("trackCheckbox").checked = aValue;
        gWaitCounter--;
      });
      gWaitCounter++;
      gTrackStore.getList(function(aTPoints) {
        if (gDebug)
          document.getElementById("debug").textContent = aTPoints.length + " points loaded.";
        if (aTPoints.length) {
          gTrack = aTPoints;
        }
        gWaitCounter--;
      });
    }
    else
      setTimeout(getPersistentPrefs, 100);
    loopCnt++;
    if (loopCnt > 50) {
      document.getElementById("debug").textContent = "Loading prefs failed.";
    }
  };
  getPersistentPrefs();

  gTrackCanvas.addEventListener("mouseup", mapEvHandler, false);
  gTrackCanvas.addEventListener("mousemove", mapEvHandler, false);
  gTrackCanvas.addEventListener("mousedown", mapEvHandler, false);
  gTrackCanvas.addEventListener("mouseout", mapEvHandler, false);

  gTrackCanvas.addEventListener("touchstart", mapEvHandler, false);
  gTrackCanvas.addEventListener("touchmove", mapEvHandler, false);
  gTrackCanvas.addEventListener("touchend", mapEvHandler, false);
  gTrackCanvas.addEventListener("touchcancel", mapEvHandler, false);
  gTrackCanvas.addEventListener("touchleave", mapEvHandler, false);

  // XXX deprecated? see https://groups.google.com/forum/?fromgroups#!topic/mozilla.dev.planning/kuhrORubaRY[1-25]
  gTrackCanvas.addEventListener("DOMMouseScroll", mapEvHandler, false);
  gTrackCanvas.addEventListener("mousewheel", mapEvHandler, false);

  document.getElementById("copyright").innerHTML =
      gMapStyles[gActiveMap].copyright;

  gLoadingTile = new Image();
  gLoadingTile.src = "style/loading.png";
  gWaitCounter++;
  gLoadingTile.onload = function() { gWaitCounter--; };
}

function resizeAndDraw() {
  var viewportWidth = Math.min(window.innerWidth, window.outerWidth);
  var viewportHeight = Math.min(window.innerHeight, window.outerHeight);

  gMapCanvas.width = viewportWidth;
  gMapCanvas.height = viewportHeight;
  gTrackCanvas.width = viewportWidth;
  gTrackCanvas.height = viewportHeight;
  drawMap();
  showUI();
}

function zoomIn() {
  if (gPos.z < gMaxZoom) {
    gPos.z++;
    drawMap();
  }
}

function zoomOut() {
  if (gPos.z > 0) {
    gPos.z--;
    drawMap();
  }
}

function gps2xy(aLatitude, aLongitude) {
  var maxZoomFactor = Math.pow(2, gMaxZoom) * gTileSize;
  var convLat = aLatitude * Math.PI / 180;
  var rawY = (1 - Math.log(Math.tan(convLat) +
                           1 / Math.cos(convLat)) / Math.PI) / 2 * maxZoomFactor;
  var rawX = (aLongitude + 180) / 360 * maxZoomFactor;
  return {x: Math.round(rawX),
          y: Math.round(rawY)};
}

function xy2gps(aX, aY) {
  var maxZoomFactor = Math.pow(2, gMaxZoom) * gTileSize;
  var n = Math.PI - 2 * Math.PI * aY / maxZoomFactor;
  return {latitude: 180 / Math.PI *
                    Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
          longitude: aX / maxZoomFactor * 360 - 180};
}

function setMapStyle() {
  var mapSel = document.getElementById("mapSelector");
  if (mapSel.selectedIndex >= 0 && gActiveMap != mapSel.value) {
    gActiveMap = mapSel.value;
    gTiles = {};
    document.getElementById("copyright").innerHTML =
        gMapStyles[gActiveMap].copyright;
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

  var zoomFactor = Math.pow(2, gMaxZoom - pos.z);
  var wid = gMapCanvas.width * zoomFactor;
  var ht = gMapCanvas.height * zoomFactor;

  pos.x *= zoomFactor;
  pos.y *= zoomFactor;

  var sz = gTileSize * zoomFactor;
  if (pos.x > gPos.x + wid / 2 || pos.y > gPos.y + ht / 2 ||
      pos.x + sz < gPos.x - wid / 2 || pos.y - sz < gPos.y - ht / 2)
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

function drawMap() {
  // Go through all the currently loaded tiles. If we don't want any of them remove them.
  // for (t in gTiles) {
  //   if (isOutsideWindow(t))
  //     delete gTiles[t];
  // }
  document.getElementById("zoomLevel").textContent = gPos.z;
  gZoomFactor = Math.pow(2, gMaxZoom - gPos.z);
  var wid = gMapCanvas.width * gZoomFactor; // Width in level 18 pixels.
  var ht = gMapCanvas.height * gZoomFactor; // Height in level 18 pixels.
  var size = gTileSize * gZoomFactor; // Tile size in level 18 pixels.

  var xMin = gPos.x - wid / 2; // Corners of the window in level 18 pixels.
  var yMin = gPos.y - ht / 2;
  var xMax = gPos.x + wid / 2;
  var yMax = gPos.y + ht / 2;

  if (gMapPrefsLoaded && mainDB)
    gPrefs.set("position", gPos);

  // Go through all the tiles we want.
  // If any of them aren't loaded or being loaded, do so.
  for (var x = Math.floor(xMin / size); x < Math.ceil(xMax / size); x++) {
    for (var y = Math.floor(yMin / size); y < Math.ceil(yMax / size); y++) { // slow script warnings on the tablet appear here!
      // Round here is **CRUCIAL** otherwise the images are filtered
      // and the performance sucks (more than expected).
      var xoff = Math.round((x * size - xMin) / gZoomFactor);
      var yoff = Math.round((y * size - yMin) / gZoomFactor);
      // Draw placeholder, and then initiate loading/drawing of real one.
      gMapContext.drawImage(gLoadingTile, xoff, yoff);

      gTileService.get(gActiveMap, {x: x, y: y, z: gPos.z}, function(aImage, aStyle, aCoords) {
        // Only draw if this applies for the current view.
        if ((aStyle == gActiveMap) && (aCoords.z == gPos.z)) {
          var ixMin = gPos.x - wid / 2;
          var iyMin = gPos.y - ht / 2;
          var ixoff = Math.round((aCoords.x * size - ixMin) / gZoomFactor);
          var iyoff = Math.round((aCoords.y * size - iyMin) / gZoomFactor);
          var URL = window.URL;
          var imgURL = URL.createObjectURL(aImage);
          var imgObj = new Image();
          imgObj.src = imgURL;
          gMapContext.drawImage(imgObj, ixoff, iyoff);
          URL.revokeObjectURL(imgURL);
        }
      });
    }
  }
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
  var mappos = {x: Math.round((trackpoint.x - gPos.x) / gZoomFactor + gMapCanvas.width / 2),
                y: Math.round((trackpoint.y - gPos.y) / gZoomFactor + gMapCanvas.height / 2)};

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
      gTrackContext.moveTo(Math.round((gLastDrawnPoint.x - gPos.x) / gZoomFactor + gMapCanvas.width / 2),
                           Math.round((gLastDrawnPoint.y - gPos.y) / gZoomFactor + gMapCanvas.height / 2));
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
  var mappos = {x: Math.round((locpoint.x - gPos.x) / gZoomFactor + gMapCanvas.width / 2),
                y: Math.round((locpoint.y - gPos.y) / gZoomFactor + gMapCanvas.height / 2)};

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
    var oldmp = {x: Math.round((oldpoint.x - gPos.x) / gZoomFactor + gMapCanvas.width / 2),
                 y: Math.round((oldpoint.y - gPos.y) / gZoomFactor + gMapCanvas.height / 2)};
    gTrackContext.putImageData(gCurPosMapCache.data,
                               oldmp.x - gCurPosMapCache.radius,
                               oldmp.y - gCurPosMapCache.radius);
    gCurPosMapCache = undefined;
  }
}

var mapEvHandler = {
  handleEvent: function(aEvent) {
    var touchEvent = aEvent.type.indexOf('touch') != -1;

    // Bail out on unwanted map moves, but not zoom-changing events.
    if (aEvent.type != "DOMMouseScroll" && aEvent.type != "mousewheel") {
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
        var x = coordObj.clientX - gMapCanvas.offsetLeft;
        var y = coordObj.clientY - gMapCanvas.offsetTop;
        if (gDragging === true) {
          var dX = x - gLastMouseX;
          var dY = y - gLastMouseY;
          gPos.x -= dX * gZoomFactor;
          gPos.y -= dY * gZoomFactor;
          drawMap();
          showUI();
        }
        gLastMouseX = x;
        gLastMouseY = y;
        break;
      case "mouseup":
      case "touchend":
        gDragging = false;
        showUI();
        break;
      case "mouseout":
      case "touchcancel":
      case "touchleave":
        //gDragging = false;
        break;
      case "DOMMouseScroll":
      case "mousewheel":
        var delta = 0;
        if (aEvent.wheelDelta) {
          delta = aEvent.wheelDelta / 120;
          if (window.opera)
            delta = -delta;
        }
        else if (aEvent.detail) {
          delta = -aEvent.detail / 3;
        }

        // Debug output: "coordinates" of the point the mouse was over.
        /*
        var ptCoord = {x: gPos.x + (x - gMapCanvas.width / 2) * gZoomFactor,
                       y: gPos.y + (x - gMapCanvas.height / 2) * gZoomFactor};
        var gpsCoord = xy2gps(ptCoord.x, ptCoord.y);
        var pt2Coord = gps2xy(gpsCoord.latitude, gpsCoord.longitude);
        document.getElementById("debug").textContent =
            ptCoord.x + "/" + ptCoord.y + " - " +
            gpsCoord.latitude + "/" + gpsCoord.longitude + " - " +
            pt2Coord.x + "/" + pt2Coord.y;
        */

        var newZoomLevel = gPos.z + (delta > 0 ? 1 : -1);
        if ((newZoomLevel >= 0) && (newZoomLevel <= gMaxZoom)) {
          // Calculate new center of the map - same point stays under the mouse.
          // This means that the pixel distance between the old center and point
          // must equal the pixel distance of the new center and that point.
          var x = coordObj.clientX - gMapCanvas.offsetLeft;
          var y = coordObj.clientY - gMapCanvas.offsetTop;

          // Zoom factor after this action.
          var newZoomFactor = Math.pow(2, gMaxZoom - newZoomLevel);
          gPos.x -= (x - gMapCanvas.width / 2) * (newZoomFactor - gZoomFactor);
          gPos.y -= (y - gMapCanvas.height / 2) * (newZoomFactor - gZoomFactor);

          if (delta > 0)
            zoomIn();
          else if (delta < 0)
            zoomOut();
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
    gGeoWatchID = gGeolocation.watchPosition(
      function(position) {
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
            if (Math.abs(gPos.x - posCoord.x) > gMapCanvas.width * gZoomFactor / 4 ||
                Math.abs(gPos.y - posCoord.y) > gMapCanvas.height * gZoomFactor / 4) {
              gPos.x = posCoord.x;
              gPos.y = posCoord.y;
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
        document.getElementById("debug").textContent = error.message;
      },
      {enableHighAccuracy: true}
    );
  }
}

function endTracking() {
  if (gGeoWatchID) {
    gGeolocation.clearWatch(gGeoWatchID);
  }
}

function clearTrack() {
  gTrack = [];
  gTrackStore.clear();
  drawMap();
}

var gTileService = {
  objStore: "tilecache",

  get: function(aStyle, aCoords, aCallback) {
    var norm = normalizeCoords(aCoords);
    var dbkey = aStyle + "::" + norm.x + "," + norm.y + "," + norm.z;
    this.getDBCache(dbkey, function(aResult, aEvent) {
      if (aResult) {
        // We did get a cached object.
        // TODO: Look at the timestamp and trigger a reload when it's too old.
        aCallback(aResult.image, aStyle, aCoords);
      }
      else {
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
            gTileService.setDBCache(dbkey, {image: blob, timestamp: Date.now()});
            aCallback(blob, aStyle, aCoords);
          }
        }, false);
        XHR.send();
      }
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
  }
};
