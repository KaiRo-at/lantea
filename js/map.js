/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Lantea mapping/tracking web app.
 *
 * The Initial Developer of the Original Code is
 * Robert Kaiser <kairo@kairo.at>.
 * Portions created by the Initial Developer are Copyright (C) 2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Robert Kaiser <kairo@kairo.at>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var gCanvas, gContext;

var gTileSize = 256;
var gMaxZoom = 18; // The minimum is 0.

var gMapStyles = {
  // OSM tile usage policy: http://wiki.openstreetmap.org/wiki/Tile_usage_policy
  osm_mapnik:
    {name: "OpenStreetMap (Mapnik)",
     url: "http://tile.openstreetmap.org/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'},
  osm_tilesathome:
    {name: "OpenStreetMap (OSMarender)",
     url: "http://tah.openstreetmap.org/Tiles/tile/{z}/{x}/{y}.png",
     copyright: 'Map data and imagery &copy; <a href="http://www.openstreetmap.org/">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>'},
  mapquest_open:
    {name: "MapQuest Open",
     url: "http://otile1.mqcdn.com/tiles/1.0.0/osm/{z}/{x}/{y}.png",
     copyright: 'Data, imagery and map information provided by MapQuest, <a href="http://www.openstreetmap.org/">OpenStreetMap</a> and contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>.'}
};
var gActiveMap = "osm_mapnik";

var gPos = {x: 35630000.0, // Current position in the map in pixels at the maximum zoom level (18)
            y: 23670000.0, // The range is 0-67108864 (2^gMaxZoom * gTileSize)
            z: 5}; // This could be fractional if supported being between zoom levels.

var gLastMouseX = 0;
var gLastMouseY = 0;
var gZoomFactor;

// Used as an associative array. They keys have to be strings, ours will be "xindex,yindex,zindex" e.g. "13,245,12".
var gTiles = {};
var gLoadingTile;

var gDragging = false;
var gZoomTouchID;

function initMap() {
  gCanvas = document.getElementById("map");
  gContext = gCanvas.getContext("2d");
  if (!gActiveMap)
    gActiveMap = "osm_mapnik";

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
  var viewportWidth = window.innerWidth;
  var viewportHeight = window.innerHeight;

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

  // Go through all the tiles we want. If any of them aren't loaded or being loaded, do so.
  for (var x = Math.floor(xMin / size); x < Math.ceil(xMax / size); x++) {
    for (var y = Math.floor(yMin / size); y < Math.ceil(yMax / size); y++) {
      var xoff = (x * size - xMin) / gZoomFactor;
      var yoff = (y * size - yMin) / gZoomFactor;
      var tileKey = encodeIndex(x, y, gPos.z);
      if (gTiles[tileKey] && gTiles[tileKey].complete) {
        // Round here is **CRUICIAL** otherwise the images are filtered and the performance sucks (more than expected).
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
      if (touchEvent && zoomstart &&
          !aEvent.changedTouches.identifiedTouch(gZoomTouchID))
        return;
    }

    var coordObj = touchEvent ?
                   aEvent.changedTouches.identifiedTouch(gZoomTouchID) :
                   aEvent;

    switch (aEvent.type) {
      case "mousedown":
      case "touchstart":
        if (touchEvent) {
          zoomTouchID = aEvent.changedTouches.item(0).identifier;
          coordObj = aEvent.changedTouches.identifiedTouch(gZoomTouchID);
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
        // Zoom factor after this action.
        var newZoomFactor = Math.pow(2, gMaxZoom - gPos.z + (delta > 0 ? -1 : 1));
        gPos.x -= (x - gCanvas.width / 2) * (newZoomFactor - gZoomFactor);
        gPos.y -= (y - gCanvas.height / 2) * (newZoomFactor - gZoomFactor);
        document.getElementById("debug").textContent = newZoomFactor + " - " + gZoomFactor;

        if (delta > 0)
          zoomIn();
        else if (delta < 0)
          zoomOut();
        break;
    }
  }
};