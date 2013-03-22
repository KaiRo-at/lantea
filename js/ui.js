/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Get the best-available indexedDB object.
window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
var mainDB;

var gUIHideCountdown = 0;
var gWaitCounter = 0;
var gAction, gActionLabel;

window.onload = function() {
  gAction = document.getElementById("action");
  gActionLabel = document.getElementById("actionlabel");

  var mSel = document.getElementById("mapSelector");
  for (var mapStyle in gMapStyles) {
    var opt = document.createElement("option");
    opt.value = mapStyle;
    opt.text = gMapStyles[mapStyle].name;
    mSel.add(opt, null);
  }

  var areas = document.getElementsByClassName('overlayArea');
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].addEventListener("mouseup", uiEvHandler, false);
    areas[i].addEventListener("mousemove", uiEvHandler, false);
    areas[i].addEventListener("mousedown", uiEvHandler, false);
    areas[i].addEventListener("mouseout", uiEvHandler, false);

    areas[i].addEventListener("touchstart", uiEvHandler, false);
    areas[i].addEventListener("touchmove", uiEvHandler, false);
    areas[i].addEventListener("touchend", uiEvHandler, false);
    areas[i].addEventListener("touchcancel", uiEvHandler, false);
    areas[i].addEventListener("touchleave", uiEvHandler, false);
  }

  document.getElementById("body").addEventListener("keydown", uiEvHandler, false);

  if (navigator.platform.length == "") {
    // For Firefox OS, don't display the "save" button.
    // Do this by setting the debugHide class for testing in debug mode.
    document.getElementById("saveTrackButton").classList.add("debugHide");
  }

  initDB();
  initMap();

  var loopCnt = 0;
  var waitForInitAndDraw = function() {
    if ((gWaitCounter <= 0) || (loopCnt > 100)) {
      if (gWaitCounter <= 0)
        gWaitCounter = 0;
      else
        console.log("Loading failed (waiting for init).");

      gMapPrefsLoaded = true;
      resizeAndDraw();
      gActionLabel.textContent = "";
      gAction.style.display = "none";
      setTracking(document.getElementById("trackCheckbox"));
    }
    else
      setTimeout(waitForInitAndDraw, 100);
    loopCnt++;
  };
  waitForInitAndDraw();
}

window.onresize = function() {
  resizeAndDraw();
}

function initDB() {
  // Open DB.
  var request = window.indexedDB.open("MainDB-lantea", 2);
  request.onerror = function(event) {
    // Errors can be handled here. Error codes explain in:
    // https://developer.mozilla.org/en/IndexedDB/IDBDatabaseException#Constants
    if (gDebug)
      console.log("error opening mainDB: " + event.target.errorCode);
  };
  request.onsuccess = function(event) {
    mainDB = request.result;
  };
  request.onupgradeneeded = function(event) {
    mainDB = request.result;
    var ver = mainDB.version || 0; // version is empty string for a new DB
    if (gDebug)
      console.log("mainDB has version " + ver + ", upgrade needed.");
    if (!mainDB.objectStoreNames.contains("prefs")) {
      // Create a "prefs" objectStore.
      var prefsStore = mainDB.createObjectStore("prefs");
    }
    if (!mainDB.objectStoreNames.contains("track")) {
      // Create a "track" objectStore.
      var trackStore = mainDB.createObjectStore("track", {autoIncrement: true});
    }
    if (!mainDB.objectStoreNames.contains("tilecache")) {
      // Create a "tilecache" objectStore.
      var tilecacheStore = mainDB.createObjectStore("tilecache");
    }
    mainDB.onversionchange = function(event) {
      mainDB.close();
      mainDB = undefined;
      initDB();
    };
  };
}

function showUI() {
  if (gUIHideCountdown <= 0) {
    var areas = document.getElementsByClassName('overlayArea');
    for (var i = 0; i <= areas.length - 1; i++) {
      areas[i].classList.remove("hidden");
    }
    setTimeout(maybeHideUI, 1000);
  }
  gUIHideCountdown = 5;
}

function maybeHideUI() {
  gUIHideCountdown--;
  if (gUIHideCountdown <= 0) {
    var areas = document.getElementsByClassName('overlayArea');
    for (var i = 0; i <= areas.length - 1; i++) {
      areas[i].classList.add("hidden");
    }
  }
  else {
    setTimeout(maybeHideUI, 1000);
  }
}

function toggleTrackArea() {
  var fs = document.getElementById("trackArea");
  if (fs.style.display != "block") {
    fs.style.display = "block";
    showUI();
  }
  else {
    fs.style.display = "none";
  }
}

function toggleSettings() {
  var fs = document.getElementById("settingsArea");
  if (fs.style.display != "block") {
    fs.style.display = "block";
    showUI();
  }
  else {
    fs.style.display = "none";
  }
}

function toggleFullscreen() {
  if ((document.fullScreenElement && document.fullScreenElement !== null) ||
      (document.mozFullScreenElement && document.mozFullScreenElement !== null) ||
      (document.webkitFullScreenElement && document.webkitFullScreenElement !== null)) {
    if (document.cancelFullScreen) {
      document.cancelFullScreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitCancelFullScreen) {
      document.webkitCancelFullScreen();
    }
  }
  else {
    var elem = document.getElementById("body");
    if (elem.requestFullScreen) {
      elem.requestFullScreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullScreen) {
      elem.webkitRequestFullScreen();
    }
  }
}

var uiEvHandler = {
  handleEvent: function(aEvent) {
    var touchEvent = aEvent.type.indexOf('touch') != -1;

    switch (aEvent.type) {
      case "mousedown":
      case "touchstart":
      case "mousemove":
      case "touchmove":
      case "mouseup":
      case "touchend":
      case "keydown":
        showUI();
        break;
    }
  }
};

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
