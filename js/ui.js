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
  startTracking();
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
    var outDataURI = "data:application/octet-stream," + encodeURIComponent(out);
    window.open(outDataURI, 'GPX Track');
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
    var transaction = mainDB.transaction([this.objStore],
                                         IDBTransaction.READ_WRITE);
    var objStore = transaction.objectStore(this.objStore);
    var request = objStore.add(aValue, aKey);
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
    var transaction = mainDB.transaction([this.objStore],
                                         IDBTransaction.READ_WRITE);
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
    var transaction = mainDB.transaction([this.objStore],
                                         IDBTransaction.READ_WRITE);
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
    var transaction = mainDB.transaction([this.objStore],
                                         IDBTransaction.READ_WRITE);
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
