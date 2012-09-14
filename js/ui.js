/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Get the best-available indexedDB object.
var iDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
var mainDB;

window.onload = function() {
  var mSel = document.getElementById("mapSelector");
  for (var mapStyle in gMapStyles) {
    var opt = document.createElement("option");
    opt.value = mapStyle;
    opt.text = gMapStyles[mapStyle].name;
    mSel.add(opt, null);
  }

  initDB();
  initMap();
  resizeAndDraw();
}

window.onresize = function() {
  resizeAndDraw();
}

function initDB() {
  // Open DB.
  var request = iDB.open("MainDB", 1);
  request.onerror = function(event) {
    // Errors can be handled here. Error codes explain in:
    // https://developer.mozilla.org/en/IndexedDB/IDBDatabaseException#Constants
    //document.getElementById("debug").textContent =
    //  "error opening mainDB: " + event.target.errorCode;
  };
  request.onsuccess = function(event) {
    //document.getElementById("debug").textContent = "mainDB opened.";
    mainDB = request.result;
  };
  request.onupgradeneeded = function(event) {
    mainDB = request.result;
    //document.getElementById("debug").textContent = "mainDB upgraded.";
    // Create a "prefs" objectStore.
    var prefsStore = mainDB.createObjectStore("prefs");
    // Create a "track" objectStore.
    var trackStore = mainDB.createObjectStore("track", {autoIncrement: true});
    mainDB.onversionchange = function(event) {
      mainDB.close();
      mainDB = undefined;
      initDB();
    };
  };
}

function toggleTrackArea() {
  var fs = document.getElementById("trackArea");
  if (fs.style.display != "block") {
    fs.style.display = "block";
  }
  else {
    fs.style.display = "none";
  }
}

function toggleSettings() {
  var fs = document.getElementById("settingsArea");
  if (fs.style.display != "block") {
    fs.style.display = "block";
  }
  else {
    fs.style.display = "none";
  }
}

function makeISOString(aTimestamp) {
  // ISO time format is YYYY-MM-DDTHH:mm:ssZ
  var tsDate = new Date(aTimestamp);
  return tsDate.getUTCFullYear() + "-" +
         (tsDate.getUTCMonth() < 10 ? "0" : "") + tsDate.getUTCMonth() + "-" +
         (tsDate.getUTCDate() < 10 ? "0" : "") + tsDate.getUTCDate() + "T" +
         (tsDate.getUTCHours() < 10 ? "0" : "") + tsDate.getUTCHours() + ":" +
         (tsDate.getUTCMinutes() < 10 ? "0" : "") + tsDate.getUTCMinutes() + ":" +
         (tsDate.getUTCSeconds() < 10 ? "0" : "") + tsDate.getUTCSeconds() + "Z";
}

function saveTrack() {
  if (gTrack.length) {
    var out = '<?xml version="1.0" encoding="UTF-8" ?>' + "\n\n";
    out += '<gpx version="1.0" creator="Lantea" xmlns="http://www.topografix.com/GPX/1/0">' + "\n";
    out += '  <trk>' + "\n";
    out += '    <trkseg>' + "\n";
    for (var i = 0; i < gTrack.length; i++) {
      if (gTrack[i].beginSegment && i > 0) {
        out += '    </trkseg>' + "\n";
        out += '    <trkseg>' + "\n";
      }
      out += '      <trkpt lat="' + gTrack[i].coords.latitude + '" lon="' +
                                    gTrack[i].coords.longitude + '">' + "\n";
      if (gTrack[i].coords.altitude) {
        out += '        <ele>' + gTrack[i].coords.altitude + '</ele>' + "\n";
      }
      out += '        <time>' + makeISOString(gTrack[i].time) + '</time>' + "\n";
      out += '      </trkpt>' + "\n";
    }
    out += '    </trkseg>' + "\n";
    out += '  </trk>' + "\n";
    out += '</gpx>' + "\n";
    var outDataURI = "data:application/gpx+xml," + encodeURIComponent(out);
    window.open(outDataURI, 'GPX Track');
  }
}

function saveTrackDump() {
  if (gTrack.length) {
    var out = JSON.stringify(gTrack);
    var outDataURI = "data:application/json," + encodeURIComponent(out);
    window.open(outDataURI, 'JSON dump');
  }
}

var gPrefs = {
  objStore: "prefs",

  get: function(aKey, aCallback) {
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

  set: function(aKey, aValue, aCallback) {
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

  unset: function(aKey, aCallback) {
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

var gTrackStore = {
  objStore: "track",

  getList: function(aCallback) {
    if (!mainDB)
      return;
    var transaction = mainDB.transaction([this.objStore]);
    var objStore = transaction.objectStore(this.objStore);
    if (objStore.getAll) { // currently Mozilla-specific
      objStore.getAll().onsuccess = function(event) {
        aCallback(event.target.result);
      };
    }
    else { // Use cursor (standard method).
      var tPoints = [];
      objStore.openCursor().onsuccess = function(event) {
        var cursor = event.target.result;
        if (cursor) {
          tPoints.push(cursor.value);
          cursor.continue();
        }
        else {
          aCallback(tPoints);
        }
      };
    }
  },

  push: function(aValue, aCallback) {
    if (!mainDB)
      return;
    var transaction = mainDB.transaction([this.objStore], "readwrite");
    var objStore = transaction.objectStore(this.objStore);
    var request = objStore.add(aValue);
    request.onsuccess = function(event) {
      if (aCallback)
        aCallback(request.result, event);
    };
    request.onerror = function(event) {
      // Errors can be handled here.
      if (aCallback)
        aCallback(false, event);
    };
  },

  clear: function(aCallback) {
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
