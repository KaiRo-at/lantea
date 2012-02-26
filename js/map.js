/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var gCanvas, gContext, gGeolocation;
var gDebug = false;

var gTileSize = 256;
var gMaxZoom = 18; // The minimum is 0.

var gMapStyles = {
  // OSM tile usage policy: http://wiki.openstreetmap.org/wiki/Tile_usage_policy
  // Find some more OSM ones at http://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
  osm_mapnik:
    {name: "OpenStreetMap (Mapnik)",
     url: "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'},
  osm_tilesathome:
    {name: "OpenStreetMap (OSMarender)",
     url: "http://tah.openstreetmap.org/Tiles/tile/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'},
  mapquest_open:
    {name: "MapQuest OSM",
     url: "http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png",
     copyright: 'Data, imagery and map information provided by MapQuest, <a href="http://www.openstreetmap.org/">OpenStreetMap</a> and contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>.'},
  mapquest_aerial:
    {name: "MapQuest Open Aerial",
     url: "http://oatile1.mqcdn.com/naip/{z}/{x}/{y}.png",
     copyright: 'Data, imagery and map information provided by MapQuest, <a href="http://www.openstreetmap.org/">OpenStreetMap</a> and contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>.'},
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
var gLastTrackPoint;
var gCenterPosition = true;

function initMap() {
  gGeolocation = navigator.geolocation;
  gCanvas = document.getElementById("map");
  gContext = gCanvas.getContext("2d");
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
      gPrefs.get("position", function(aValue) {
        if (aValue) {
          gPos = aValue;
          drawMap();
        }
      });
      gPrefs.get("center_map", function(aValue) {
        if (aValue === undefined)
          document.getElementById("centerCheckbox").checked = true;
        else
          document.getElementById("centerCheckbox").checked = aValue;
        setCentering(document.getElementById("centerCheckbox"));
      });
      gPrefs.get("tracking_enabled", function(aValue) {
        if (aValue === undefined)
          document.getElementById("trackCheckbox").checked = true;
        else
          document.getElementById("trackCheckbox").checked = aValue;
        setTracking(document.getElementById("trackCheckbox"));
      });
      gMapPrefsLoaded = true;
    }
    else
      setTimeout(getPersistentPrefs, 100);
    loopCnt++;
    if (loopCnt > 20) {
      gMapPrefsLoaded = true;
      return;
    }
  };
  getPersistentPrefs();

  gCanvas.addEventListener("mouseup", mapEvHandler, false);
  gCanvas.addEventListener("mousemove", mapEvHandler, false);
  gCanvas.addEventListener("mousedown", mapEvHandler, false);
  gCanvas.addEventListener("mouseout", mapEvHandler, false);

  gCanvas.addEventListener("touchstart", mapEvHandler, false);
  gCanvas.addEventListener("touchmove", mapEvHandler, false);
  gCanvas.addEventListener("touchend", mapEvHandler, false);
  gCanvas.addEventListener("touchcancel", mapEvHandler, false);
  gCanvas.addEventListener("touchleave", mapEvHandler, false);

  gCanvas.addEventListener("DOMMouseScroll", mapEvHandler, false);
  gCanvas.addEventListener("mousewheel", mapEvHandler, false);

  document.getElementById("copyright").innerHTML =
      gMapStyles[gActiveMap].copyright;

  gLoadingTile = new Image();
  gLoadingTile.src = "style/loading.png";
}

function resizeAndDraw() {
  var viewportWidth = Math.min(window.innerWidth, window.outerWidth);
  var viewportHeight = Math.min(window.innerHeight, window.outerHeight);

  var canvasWidth = viewportWidth * 0.98;
  var canvasHeight = (viewportHeight - 100) * 0.98;
  gCanvas.style.position = "fixed";
  gCanvas.width = canvasWidth;
  gCanvas.height = canvasHeight;
  drawMap();
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
    drawMap();
  }
}

// A sane mod function that works for negative numbers.
// Returns a % b.
function mod(a, b) {
  return ((a % b) + b) % b;
}

function normaliseIndices(x, y, z) {
  var zoomFactor = Math.pow(2, z);
  return {x: mod(x, zoomFactor),
          y: mod(y, zoomFactor),
          z: z};
}

function tileURL(x, y, z) {
  var norm = normaliseIndices(x, y, z);
  return gMapStyles[gActiveMap].url.replace("{x}", norm.x)
                                   .replace("{y}", norm.y)
                                   .replace("{z}", norm.z);
}

// Returns true if the tile is outside the current view.
function isOutsideWindow(t) {
  var pos = decodeIndex(t);
  var x = pos[0];
  var y = pos[1];
  var z = pos[2];

  var zoomFactor = Math.pow(2, gMaxZoom - z);
  var wid = gCanvas.width * zoomFactor;
  var ht = gCanvas.height * zoomFactor;

  x *= zoomFactor;
  y *= zoomFactor;

  var sz = gTileSize * zoomFactor;
  if (x > gPos.x + wid / 2 || y > gPos.y + ht / 2 ||
      x + sz < gPos.x - wid / 2 || y - sz < gPos.y - ht / 2)
    return true;
  return false;
}

function encodeIndex(x, y, z) {
  var norm = normaliseIndices(x, y, z);
  return norm.x + "," + norm.y + "," + norm.z;
}

function decodeIndex(encodedIdx) {
  return encodedIdx.split(",", 3);
}

function drawMap() {
  // Go through all the currently loaded tiles. If we don't want any of them remove them.
  // for (t in gTiles) {
  //   if (isOutsideWindow(t))
  //     delete gTiles[t];
  // }
  document.getElementById("zoomLevel").textContent = gPos.z;
  gZoomFactor = Math.pow(2, gMaxZoom - gPos.z);
  var wid = gCanvas.width * gZoomFactor; // Width in level 18 pixels.
  var ht = gCanvas.height * gZoomFactor; // Height in level 18 pixels.
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
    for (var y = Math.floor(yMin / size); y < Math.ceil(yMax / size); y++) {
      var xoff = (x * size - xMin) / gZoomFactor;
      var yoff = (y * size - yMin) / gZoomFactor;
      var tileKey = encodeIndex(x, y, gPos.z);
      if (gTiles[tileKey] && gTiles[tileKey].complete) {
        // Round here is **CRUCIAL** otherwise the images are filtered
        // and the performance sucks (more than expected).
        gContext.drawImage(gTiles[tileKey], Math.round(xoff), Math.round(yoff));
      }
      else {
        if (!gTiles[tileKey]) {
          gTiles[tileKey] = new Image();
          gTiles[tileKey].src = tileURL(x, y, gPos.z);
          gTiles[tileKey].onload = function() {
            // TODO: Just render this tile where it should be.
            // context.drawImage(gTiles[tileKey], Math.round(xoff), Math.round(yoff)); // Doesn't work for some reason.
            drawMap();
          }
        }
        gContext.drawImage(gLoadingTile, Math.round(xoff), Math.round(yoff));
      }
    }
  }
  if (gTrack.length)
    for (var i = 0; i < gTrack.length; i++) {
      drawTrackPoint(gTrack[i].coords.latitude, gTrack[i].coords.longitude);
    }
}

function drawTrackPoint(aLatitude, aLongitude) {
  var trackpoint = gps2xy(aLatitude, aLongitude);
  gContext.strokeStyle = "#FF0000";
  gContext.fillStyle = gContext.strokeStyle;
  gContext.lineWidth = 2;
  gContext.lineCap = "round";
  gContext.lineJoin = "round";
  gContext.beginPath();
  if (!gLastTrackPoint || gLastTrackPoint == trackpoint) {
    gContext.arc((trackpoint.x - gPos.x) / gZoomFactor + gCanvas.width / 2,
                 (trackpoint.y - gPos.y) / gZoomFactor + gCanvas.height / 2,
                 gContext.lineWidth, 0, Math.PI * 2, false);
    gContext.fill();
  }
  else {
    gContext.moveTo((gLastTrackPoint.x - gPos.x) / gZoomFactor + gCanvas.width / 2,
                    (gLastTrackPoint.y - gPos.y) / gZoomFactor + gCanvas.height / 2);
    gContext.lineTo((trackpoint.x - gPos.x) / gZoomFactor + gCanvas.width / 2,
                    (trackpoint.y - gPos.y) / gZoomFactor + gCanvas.height / 2);
    gContext.stroke();
  }
  gLastTrackPoint = trackpoint;
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
        var x = coordObj.clientX - gCanvas.offsetLeft;
        var y = coordObj.clientY - gCanvas.offsetTop;

        if (touchEvent || aEvent.button === 0) {
          gDragging = true;
        }
        gLastMouseX = x;
        gLastMouseY = y;
        break;
      case "mousemove":
      case "touchmove":
        var x = coordObj.clientX - gCanvas.offsetLeft;
        var y = coordObj.clientY - gCanvas.offsetTop;
        if (gDragging === true) {
          var dX = x - gLastMouseX;
          var dY = y - gLastMouseY;
          gPos.x -= dX * gZoomFactor;
          gPos.y -= dY * gZoomFactor;
          drawMap();
        }
        gLastMouseX = x;
        gLastMouseY = y;
        break;
      case "mouseup":
      case "touchend":
        gDragging = false;
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

        // Calculate new center of the map - same point stays under the mouse.
        // This means that the pixel distance between the old center and point
        // must equal the pixel distance of the new center and that point.
        var x = coordObj.clientX - gCanvas.offsetLeft;
        var y = coordObj.clientY - gCanvas.offsetTop;
        // Debug output: "coordinates" of the point the mouse was over.
        /*
        var ptCoord = {x: gPos.x + (x - gCanvas.width / 2) * gZoomFactor,
                       y: gPos.y + (x - gCanvas.height / 2) * gZoomFactor};
        var gpsCoord = xy2gps(ptCoord.x, ptCoord.y);
        var pt2Coord = gps2xy(gpsCoord.latitude, gpsCoord.longitude);
        document.getElementById("debug").textContent =
            ptCoord.x + "/" + ptCoord.y + " - " +
            gpsCoord.latitude + "/" + gpsCoord.longitude + " - " +
            pt2Coord.x + "/" + pt2Coord.y;
        */
        // Zoom factor after this action.
        var newZoomFactor = Math.pow(2, gMaxZoom - gPos.z + (delta > 0 ? -1 : 1));
        gPos.x -= (x - gCanvas.width / 2) * (newZoomFactor - gZoomFactor);
        gPos.y -= (y - gCanvas.height / 2) * (newZoomFactor - gZoomFactor);

        if (delta > 0)
          zoomIn();
        else if (delta < 0)
          zoomOut();
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
  var loopCnt = 0;
  var getStoredTrack = function() {
    if (mainDB)
      gTrackStore.getList(function(aTPoints) {
        if (gDebug)
          document.getElementById("debug").textContent = aTPoints.length + " points loaded.";
        if (aTPoints.length) {
          gTrack = aTPoints;
        }
      });
    else
      setTimeout(getStoredTrack, 100);
    loopCnt++;
    if (loopCnt > 20)
      return;
  };
  getStoredTrack();
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
        gTrack.push(tPoint);
        try { gTrackStore.push(tPoint); } catch(e) {}
        drawTrackPoint(position.coords.latitude, position.coords.longitude);
        if (gCenterPosition) {
          var posCoord = gps2xy(position.coords.latitude,
                                position.coords.longitude);
          if (Math.abs(gPos.x - posCoord.x) > gCanvas.width * gZoomFactor / 4 ||
              Math.abs(gPos.y - posCoord.y) > gCanvas.height * gZoomFactor / 4) {
            gPos.x = posCoord.x;
            gPos.y = posCoord.y;
            drawMap();
          }
        }
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
