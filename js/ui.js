/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Get the best-available objects for indexedDB and requestAnimationFrame.
window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

var mainDB;
var gAppInitDone = false;
var firstRun = false;
var gUIHideCountdown = 0;
var gWaitCounter = 0;
var gTrackUpdateInterval;
var gAction, gActionLabel;
var authData = null, userData = null;
var gBackendURL = "https://backend.lantea.kairo.at/";
var gAuthClientID = "lantea";

window.onload = function() {
  // Assign click functions to buttons.
  document.getElementById("zoomInButton").onclick = gMap.zoomIn;
  document.getElementById("zoomOutButton").onclick = gMap.zoomOut;

  gAction = document.getElementById("action");
  gActionLabel = document.getElementById("actionlabel");

  var mSel = document.getElementById("mapSelector");
  for (var mapStyle in gMapStyles) {
    var opt = document.createElement("option");
    opt.value = mapStyle;
    opt.text = gMapStyles[mapStyle].name;
    mSel.add(opt, null);
  }

  var areas = document.getElementsByClassName("autoFade");
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

  // Set backend URL in a way that it works for testing on localhost as well as
  // both the lantea.kairo.at and lantea-dev.kairo.at deployments.
  if (window.location.host == "localhost") {
    gBackendURL = window.location.protocol + '//' + window.location.host + "/lantea-backend/";
  }
  else {
    gBackendURL = window.location.protocol + '//' + "backend." + window.location.host + "/";
  }
  // Make sure to use a different login client ID for the -dev setup.
  if (/\-dev\./.test(window.location.host)) {
    gAuthClientID += "-dev";
  }

  document.getElementById("libCloseButton").onclick = hideLibrary;

  // Set up the login area.
  document.getElementById("loginbtn").onclick = startLogin;
  document.getElementById("logoutbtn").onclick = doLogout;
  // Put in a logged-out state by default.
  // Opening the track drawer will update this correctly.
  displayLogout();

  gAction.addEventListener("dbinit-done", initMap, false);
  gAction.addEventListener("mapinit-done", postInit, false);
  console.log("starting DB init...");
  initDB();
}

function postInit(aEvent) {
  gAction.removeEventListener(aEvent.type, postInit, false);
  console.log("init done, draw map.");
  gMapPrefsLoaded = true;
  gAppInitDone = true;
  //gMap.resizeAndDraw();  <-- HACK: This triggers bug 1001853, work around with a delay.
  window.setTimeout(gMap.resizeAndDraw, 100);
  gActionLabel.textContent = "";
  gAction.style.display = "none";
  setTracking(document.getElementById("trackCheckbox"));
  gPrefs.get("devicename", function(aValue) {
    if (aValue) {
      document.getElementById("uploadDevName").value = aValue;
    }
  });
  if (firstRun) {
    showFirstRunDialog();
  }
  else {
    gPrefs.get("lastInfoShown", function(aValue) {
      if (!aValue || !parseInt(aValue) || parseInt(aValue) < 1) {
        showInfoDialog();
      }
    });
  }
  gPrefs.set("lastInfoShown", 1);
}

window.onresize = function() {
  gMap.resizeAndDraw();
}

function startLogin() {
  var logerr = document.getElementById("loginerror");
  logerr.classList.add("hidden");
  logerr.title = "";
  if (!authData || !authData["state"]) {
    // We have no oAuth state, try to fetch it and call ourselves again if it worked.
    prepareLoginButton(function() {
      if (authData && authData["state"]) {
        startLogin();
      }
      else if (!userData) {
        // Only warn if we didn't actually end up being logged in.
        console.log("No OAuth state and fetching fails, client or server may be offline.");
        logerr.classList.remove("hidden");
        logerr.title = "Client or server may be offline.";
      }
    });
    return;
  }
  var authURL = authData["url"] + "authorize?response_type=code&client_id=" + gAuthClientID + "&scope=email" +
                "&state=" + authData["state"] + "&redirect_uri=" + encodeURIComponent(getRedirectURI());
  if (window.open(authURL, "KaiRoAuth", 'height=450,width=600')) {
    console.log("Sign In window open.");
  }
  else {
    console.log("Opening Sign In window failed.");
    logerr.classList.remove("hidden");
    logerr.title = "Opening Sign-In window failed.";
  }
}

function getRedirectURI() {
  return window.location.protocol + '//' + window.location.host + window.location.pathname.replace("index.html", "") + "login.html";
}

function doLogout() {
  fetchBackend("logout", "GET", null,
     function(aResult, aStatus) {
        if (aStatus < 400) {
          prepareLoginButton();
        }
        else {
          console.log("Backend issue trying to log out.");
        }
      },
      {}
  );
}

function prepareLoginButton(aCallback) {
  fetchBackend("oauth_state", "GET", null,
      function(aResult, aStatus) {
        if (aStatus == 200) {
          if (aResult["logged_in"]) {
            userData = {
              "email": aResult["email"],
              "permissions": aResult["permissions"],
            };
            authData = null;
            displayLogin();
          }
          else {
            authData = {"state": aResult["state"], "url": aResult["url"]};
            userData = null;
            displayLogout();
          }
        }
        else {
          console.log("Backend error " + aStatus + " fetching OAuth state: " + aResult["message"]);
        }
        if (aCallback) { aCallback(); }
      },
      {}
  );
}

function finishLogin(aCode, aState) {
  if (aState == authData["state"]) {
    fetchBackend("login?code=" + aCode + "&state=" + aState + "&redirect_uri=" + encodeURIComponent(getRedirectURI()), "GET", null,
        function(aResult, aStatus) {
          if (aStatus == 200) {
            userData = {
              "email": aResult["email"],
              "permissions": aResult["permissions"],
            };
            displayLogin();
          }
          else {
            console.log("Login error " + aStatus + ": " + aResult["message"]);
            prepareLoginButton();
          }
        },
        {}
    );
  }
  else {
    console.log("Login state did not match, not continuing with login.");
  }
}

function displayLogin() {
  document.getElementById("loginbtn").classList.add("hidden");
  document.getElementById("logindesc").classList.add("hidden");
  document.getElementById("username").classList.remove("hidden");
  document.getElementById("username").textContent = userData.email;
  document.getElementById("uploadTrackButton").disabled = false;
  document.getElementById("libraryShowLine").classList.remove("hidden");
  document.getElementById("logoutbtn").classList.remove("hidden");
}

function displayLogout() {
  document.getElementById("logoutbtn").classList.add("hidden");
  document.getElementById("username").classList.add("hidden");
  document.getElementById("username").textContent = "";
  document.getElementById("uploadTrackButton").disabled = true;
  document.getElementById("libraryShowLine").classList.add("hidden");
  document.getElementById("loginbtn").classList.remove("hidden");
  document.getElementById("logindesc").classList.remove("hidden");
}

function initDB(aEvent) {
  // Open DB.
  if (aEvent)
    gAction.removeEventListener(aEvent.type, initDB, false);
  var request = window.indexedDB.open("MainDB-lantea", 2);
  request.onerror = function(event) {
    // Errors can be handled here. Error codes explain in:
    // https://developer.mozilla.org/en/IndexedDB/IDBDatabaseException#Constants
    console.log("error opening mainDB: " + event.target.error);
    showDBErrorDialog();
    if (gDebug) {
      console.log("error code: " + event.target.error.code +
                  " - name: " + event.target.error.name);
    }
  };
  request.onsuccess = function(event) {
    mainDB = event.target.result;
    var throwEv = new CustomEvent("dbinit-done");
    gAction.dispatchEvent(throwEv);
  };
  request.onupgradeneeded = function(event) {
    mainDB = request.result;
    var ver = mainDB.version || 0; // version is empty string for a new DB
    if (gDebug)
      console.log("mainDB has version " + ver + ", upgrade needed.");
    if (!mainDB.objectStoreNames.contains("prefs")) {
      // Create a "prefs" objectStore.
      var prefsStore = mainDB.createObjectStore("prefs");
      firstRun = true;
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
    var areas = document.getElementsByClassName('autoFade');
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
    var areas = document.getElementsByClassName('autoFade');
    for (var i = 0; i <= areas.length - 1; i++) {
      areas[i].classList.add("hidden");
    }
  }
  else {
    setTimeout(maybeHideUI, 1000);
  }
}

function updateTrackInfo() {
  document.getElementById("trackLengthNum").textContent = calcTrackLength().toFixed(1);
  var duration = calcTrackDuration();
  var durationM = Math.round(duration/60);
  var durationH = Math.floor(durationM/60); durationM = durationM - durationH * 60;
  document.getElementById("trackDurationH").style.display = durationH ? "inline" : "none";
  document.getElementById("trackDurationHNum").textContent = durationH;
  document.getElementById("trackDurationMNum").textContent = durationM;
}

function toggleTrackArea() {
  var fs = document.getElementById("trackArea");
  if (fs.classList.contains("hidden")) {
    prepareLoginButton();
    fs.classList.remove("hidden");
    showUI();
    gTrackUpdateInterval = setInterval(updateTrackInfo, 1000);
  }
  else {
    clearInterval(gTrackUpdateInterval);
    fs.classList.add("hidden");
  }
}

function toggleSettings() {
  var fs = document.getElementById("settingsArea");
  if (fs.classList.contains("hidden")) {
    fs.classList.remove("hidden");
    showUI();
  }
  else {
    fs.classList.add("hidden");
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

function showUploadDialog() {
  var dia = document.getElementById("trackDialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("uploadDialog").style.display = "block";
  document.getElementById("uploadTrackButton").disabled = true;
  dia.classList.remove("hidden");
}

function cancelTrackDialog() {
  document.getElementById("trackDialogArea").classList.add("hidden");
  document.getElementById("uploadTrackButton").disabled = false;
}

function showGLWarningDialog() {
  var dia = document.getElementById("dialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("noGLwarning").style.display = "block";
  dia.classList.remove("hidden");
}

function showDBErrorDialog() {
  var dia = document.getElementById("dialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("DBError").style.display = "block";
  dia.classList.remove("hidden");
}

function showFirstRunDialog() {
  var dia = document.getElementById("dialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("firstRunIntro").style.display = "block";
  dia.classList.remove("hidden");
}

function closeDialog() {
  document.getElementById("dialogArea").classList.add("hidden");
}

function showInfoDialog() {
  var dia = document.getElementById("dialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("infoDialog").style.display = "block";
  dia.classList.remove("hidden");
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

function setUploadField(aField) {
  switch (aField.id) {
    case "uploadDevName":
      gPrefs.set("devicename", aField.value);
      break;
  }
}

function makeISOString(aTimestamp) {
  // ISO time format is YYYY-MM-DDTHH:mm:ssZ
  var tsDate = new Date(aTimestamp);
  // Note that .getUTCMonth() returns a number between 0 and 11 (0 for January)!
  return tsDate.getUTCFullYear() + "-" +
         (tsDate.getUTCMonth() < 9 ? "0" : "") + (tsDate.getUTCMonth() + 1 ) + "-" +
         (tsDate.getUTCDate() < 10 ? "0" : "") + tsDate.getUTCDate() + "T" +
         (tsDate.getUTCHours() < 10 ? "0" : "") + tsDate.getUTCHours() + ":" +
         (tsDate.getUTCMinutes() < 10 ? "0" : "") + tsDate.getUTCMinutes() + ":" +
         (tsDate.getUTCSeconds() < 10 ? "0" : "") + tsDate.getUTCSeconds() + "Z";
}

function convertTrack(aTargetFormat) {
  var out = "";
  switch (aTargetFormat) {
    case "gpx":
      out += '<?xml version="1.0" encoding="UTF-8" ?>' + "\n\n";
      out += '<gpx version="1.0" creator="Lantea" xmlns="http://www.topografix.com/GPX/1/0">' + "\n";
      if (gTrack.length) {
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
      }
      out += '</gpx>' + "\n";
      break;
    case "json":
      out = JSON.stringify(gTrack);
      break;
    default:
      break;
  }
  return out;
}

function saveTrack() {
  if (gTrack.length) {
    var outDataURI = "data:application/gpx+xml," +
                     encodeURIComponent(convertTrack("gpx"));
    window.open(outDataURI, 'GPX Track');
  }
}

function saveTrackDump() {
  if (gTrack.length) {
    var outDataURI = "data:application/json," +
                     encodeURIComponent(convertTrack("json"));
    window.open(outDataURI, 'JSON dump');
  }
}

function uploadTrack() {
  // Hide all areas in the dialog.
  var dia = document.getElementById("trackDialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  // Reset all the fields in the status area.
  document.getElementById("uploadStatusCloseButton").disabled = true;
  document.getElementById("uploadInProgress").style.display = "block";
  document.getElementById("uploadSuccess").style.display = "none";
  document.getElementById("uploadFailed").style.display = "none";
  document.getElementById("uploadError").style.display = "none";
  document.getElementById("uploadErrorMsg").textContent = "";
  // Now show the status area.
  document.getElementById("uploadStatus").style.display = "block";

  // Assemble field to post to the backend.
  var formData = new FormData();
  formData.append("jsondata", convertTrack("json"));
  var desc = document.getElementById("uploadDesc").value;
  formData.append("comment",
                  desc.length ? desc : "Track recorded via Lantea Maps");
  formData.append("devicename",
                  document.getElementById("uploadDevName").value);
  formData.append("public",
                  document.getElementById("uploadPublic").value);

  fetchBackend("save_track", "POST", formData,
    function(aResult, aStatusCode) {
      if (aStatusCode >= 400) {
        reportUploadStatus(false, aResult);
      }
      else if (aResult["id"]) {
        reportUploadStatus(true);
      }
      else { // If no ID is returned, we assume a general error.
        reportUploadStatus(false);
      }
    }
  );
}

function reportUploadStatus(aSuccess, aResponse) {
  document.getElementById("uploadStatusCloseButton").disabled = false;
  document.getElementById("uploadInProgress").style.display = "none";
  if (aSuccess) {
    document.getElementById("uploadSuccess").style.display = "block";
  }
  else if (aResponse && aResponse["message"]) {
    document.getElementById("uploadErrorMsg").textContent = aResponse["message"];
    if (aResponse["errortype"]) {
      document.getElementById("uploadErrorMsg").textContent += " (" + aResponse["errortype"] + ")";
    }
    document.getElementById("uploadError").style.display = "block";
  }
  else if (aResponse) {
    document.getElementById("uploadErrorMsg").textContent = aResponse;
    document.getElementById("uploadError").style.display = "block";
  }
  else {
    document.getElementById("uploadFailed").style.display = "block";
  }
}

function setMapStyle() {
  var mapSel = document.getElementById("mapSelector");
  if (mapSel.selectedIndex >= 0 && gMap.activeMap != mapSel.value) {
    gMap.setActiveMap(mapSel.value);
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

  getListStepped: function(aCallback) {
    if (!mainDB)
      return;
    var transaction = mainDB.transaction([this.objStore]);
    var objStore = transaction.objectStore(this.objStore);
    // Use cursor in reverse direction (so we get the most recent position first)
    objStore.openCursor(null, "prev").onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        aCallback(cursor.value);
        cursor.continue();
      }
      else {
        aCallback(null);
      }
    };
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

function fetchBackend(aEndpoint, aMethod, aSendData, aCallback, aCallbackForwards) {
  var XHR = new XMLHttpRequest();
  XHR.onreadystatechange = function() {
    if (XHR.readyState == 4) {
      // State says we are fully loaded.
      var result = {};
      if (XHR.getResponseHeader("Content-Type") == "application/json") {
        // Got a JSON object, see if we have success.
        try {
          result = JSON.parse(XHR.responseText);
        }
        catch (e) {
          console.log(e);
          result = {"error": e,
                    "message": XHR.responseText};
        }
      }
      else {
        result = XHR.responseText;
      }
      aCallback(result, XHR.status, aCallbackForwards);
    }
  };
  XHR.open(aMethod, gBackendURL + aEndpoint, true);
  XHR.withCredentials = "true";
  //XHR.setRequestHeader("Accept", "application/json");
  try {
    XHR.send(aSendData); // Send actual form data.
  }
  catch (e) {
    aCallback(e, 500, aCallbackForwards);
  }
}
