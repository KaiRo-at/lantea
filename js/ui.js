/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// Get the best-available objects for indexedDB and requestAnimationFrame.
window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;

var mainDB;
var gAppInitDone = false;
var gUIHideCountdown = 0;
var gWaitCounter = 0;
var gTrackUpdateInterval;
var gAction, gActionLabel;
var gBackendURL = "https://backend.lantea.kairo.at";
var gAuthClientID = "lantea";
var gOSMAPIURL = "https://api.openstreetmap.org/";
var gOSMOAuthData = {
    oauth_consumer_key: "6jjWwlbhGqyYeCdlFE1lTGG6IRGOv1yKpFxkcq2z",
    oauth_secret: "A21gUeDM6mdoQgbA9uF7zJ13sbUQrNG7QQ4oSrKA",
    url: "https://www.openstreetmap.org",
    landing: "auth-done.html",
}

window.onload = function() {
  if (/\/login\.html/.test(window.location)) {
    // If we are in the login window, call a function to complete the process and don't do anything else here.
    completeLoginWindow();
    return;
  }
  gAction = document.getElementById("action");
  gActionLabel = document.getElementById("actionlabel");

  var mSel = document.getElementById("mapSelector");
  for (var mapStyle in gMapStyles) {
    var opt = document.createElement("option");
    opt.value = mapStyle;
    opt.text = gMapStyles[mapStyle].name;
    mSel.add(opt, null);
  }

  var areas = document.getElementsByClassName("overlayArea");
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

  // Set up the login area.
  document.getElementById("loginbtn").onclick = startLogin;
  document.getElementById("logoutbtn").onclick = doLogout;
  prepareLoginButton(function() {
    // Anything that needs the backend should only be triggered from in here.
    // That makes sure that the first call the the backend is oauth_state and no other is running in parallel.
    // If we call multiple backend methods at once and no session is open, we create multiple sessions, which calls for confusion later on.

    // Call any UI preparation that needs the backend.
  });

  if (gDebug) {
    // Note that GPX upload returns an error 500 on the dev API right now.
    gOSMAPIURL = "http://api06.dev.openstreetmap.org/";
  }

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
  gPrefs.get(gDebug ? "osm_dev_user" : "osm_user", function(aValue) {
    if (aValue) {
      document.getElementById("uploadUser").value = aValue;
      document.getElementById("uploadTrackButton").disabled = false;
    }
  });
  gPrefs.get(gDebug ? "osm_dev_pwd" : "osm_pwd", function(aValue) {
    var upwd = document.getElementById("uploadPwd");
    if (aValue)
      document.getElementById("uploadPwd").value = aValue;
  });
}

window.onresize = function() {
  gMap.resizeAndDraw();
}

function startLogin() {
  var authURL = authData["url"] + "authorize?response_type=code&client_id=" + gAuthClientID + "&scope=email" +
                "&state=" + authData["state"] + "&redirect_uri=" + encodeURIComponent(getRedirectURI());
  if (window.open(authURL, "KaiRoAuth", 'height=450,width=600')) {
    console.log("Sign In window open.");
  }
  else {
    console.log("Opening Sign In window failed.");
  }
}

function getRedirectURI() {
  return window.location.protocol + '//' + window.location.host + window.location.pathname + "login.html";
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

function completeLoginWindow() {
  if (window.opener) {
    window.opener.finishLogin(getParameterByName("code"), getParameterByName("state"));
    window.close();
  }
  else {
    document.getElementById("logininfo").textContent = "You have called this document outside of the login flow, which is not supported.";
  }
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
  document.getElementById("logoutbtn").classList.remove("hidden");
}

function displayLogout() {
  document.getElementById("logoutbtn").classList.add("hidden");
  document.getElementById("username").classList.add("hidden");
  document.getElementById("username").textContent = "";
  document.getElementById("uploadTrackButton").disabled = true;
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
    if (gDebug)
      console.log("error opening mainDB: " + event.target.errorCode);
  };
  request.onsuccess = function(event) {
    mainDB = request.result;
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
  var dia = document.getElementById("dialogArea");
  var areas = dia.children;
  for (var i = 0; i <= areas.length - 1; i++) {
    areas[i].style.display = "none";
  }
  document.getElementById("uploadDialog").style.display = "block";
  document.getElementById("uploadTrackButton").disabled = true;
  dia.classList.remove("hidden");
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

function cancelDialog() {
  document.getElementById("dialogArea").classList.add("hidden");
  document.getElementById("uploadTrackButton").disabled = false;
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
    case "uploadUser":
      gPrefs.set(gDebug ? "osm_dev_user" : "osm_user", aField.value);
      document.getElementById("uploadTrackButton").disabled = !aField.value.length;
      break;
    case "uploadPwd":
      gPrefs.set(gDebug ? "osm_dev_pwd" : "osm_pwd", aField.value);
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
  var dia = document.getElementById("dialogArea");
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

  // See http://wiki.openstreetmap.org/wiki/Api06#Uploading_traces
  var trackBlob = new Blob([convertTrack("gpx")],
                           { "type" : "application/gpx+xml" });
  var formData = new FormData();
  formData.append("file", trackBlob);
  var desc = document.getElementById("uploadDesc").value;
  formData.append("description",
                  desc.length ? desc : "Track recorded via Lantea Maps");
  //formData.append("tags", "");
  formData.append("visibility",
                  document.getElementById("uploadVisibility").value);

/* GPS trace upload API still only supports HTTP Basic Auth. This below would be OAuth code to try.
  // Init OSM Auth, see https://github.com/osmlab/osm-auth
  var auth = osmAuth({
    oauth_consumer_key: gOSMOAuthData.oauth_consumer_key,
    oauth_secret: gOSMOAuthData.oauth_secret,
    url: gOSMOAuthData.url,
    landing: gOSMOAuthData.landing,
    auto: true // show a login form if the user is not authenticated and
               // you try to do a call
  });

  // Do an authenticate request first, so that we actuall do the login.
  if (!auth.authenticated) {
    auth.authenticate(function(err, xhrresponse) {
      if (err) {
        reportUploadStatus(false);
      }
      else {
        reportUploadStatus(true);
      }
    });
  }
  if (!auth.authenticated) {
    reportUploadStatus(false);
    return;
  }
  // Only now do the actual upload.
  auth.xhr({
      method: "POST",
      path: "/api/0.6/gpx/create",
      content: formData,
      options: {"header": {"Content-Type": "multipart/form-data"}},
    },
    function(err, xhrresponse) {
      if (err) {
        reportUploadStatus(false);
      }
      else {
        reportUploadStatus(true);
      }
    }
  );
*/

  // Do an empty POST request first, so that we don't send everything,
  // then ask for credentials, and then send again.
  var hXHR = new XMLHttpRequest();
  hXHR.onreadystatechange = function() {
    if (hXHR.readyState == 4 && (hXHR.status == 200 || hXHR.status == 400)) {
      // 400 is Bad Request, but that's expected as this was empty.
      // So far so good, init actual upload.
      var XHR = new XMLHttpRequest();
      XHR.onreadystatechange = function() {
        if (XHR.readyState == 4 && XHR.status == 200) {
          // Everthing looks fine.
          reportUploadStatus(true);
        } else if (XHR.readyState == 4 && XHR.status != 200) {
          // Fetched the wrong page or network error...
          reportUploadStatus(false);
        }
      };
      XHR.open("POST", gOSMAPIURL + "api/0.6/gpx/create", true);
      // Cross-Origin XHR doesn't allow username/password (HTTP Auth).
      // So, we'll ask the user for entering credentials with rather ugly UI.
      XHR.withCredentials = true;
      try {
        XHR.send(formData); // Send actual form data.
      }
      catch (e) {
        reportUploadStatus(false, e);
      }
    } else if (hXHR.readyState == 4 && hXHR.status != 200) {
      // Fetched the wrong page or network error...
      reportUploadStatus(false);
    }
  };
  hXHR.open("POST", gOSMAPIURL + "api/0.6/gpx/create", true);
  // Cross-Origin XHR doesn't allow username/password (HTTP Auth).
  // So, we'll ask the user for entering credentials with rather ugly UI.
  hXHR.withCredentials = true;
  try {
    hXHR.send(); // Empty request, see above.
  }
  catch (e) {
    reportUploadStatus(false, e);
  }
}

function reportUploadStatus(aSuccess, aMessage) {
  document.getElementById("uploadStatusCloseButton").disabled = false;
  document.getElementById("uploadInProgress").style.display = "none";
  if (aSuccess) {
    document.getElementById("uploadSuccess").style.display = "block";
  }
  else if (aMessage) {
    document.getElementById("uploadErrorMsg").textContent = aMessage;
    document.getElementById("uploadError").style.display = "block";
  }
  else {
    document.getElementById("uploadFailed").style.display = "block";
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
        result = JSON.parse(XHR.responseText);
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

function getParameterByName(aName) {
  // from http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
  name = aName.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
      results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}
