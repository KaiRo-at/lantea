/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

function showLibrary() {
  document.getElementById("libraryArea").classList.remove("hidden");
  var tlist = document.getElementById("libTrackList");
  while (tlist.firstChild) { tlist.removeChild(tlist.firstChild); }
  var litem = document.createElement("li");
  var load_img = document.createElement("img");
  load_img.setAttribute("src", "style/loading_action.png");
  litem.appendChild(load_img);
  litem.textContent = "Loading list...";
  litem.id = "libLoadingItem";
  tlist.appendChild(litem);
  fetchBackend("tracks", "GET", null,
    function(aResult, aStatusCode) {
      document.getElementById("libLoadingItem").classList.add("hidden");
      if (aStatusCode >= 400) {
        var litem = document.createElement("li");
        litem.textContent = "Error: " + aResult;
        tlist.appendChild(litem);
      }
      else if (!aResult.length) {
        var litem = document.createElement("li");
        litem.textContent = "No tracks uploaded yet.";
        tlist.appendChild(litem);
      }
      else {
        for (var i = 0; i < aResult.length; i++) {
          var litem = document.createElement("li");
          litem.textContent = dtformat(aResult[i]["time_created"]) + " - ";
          var llink = document.createElement("a");
          llink.setAttribute("href", gBackendURL + "/track_gpx?id=" + aResult[i]["id"]);
          llink.textContent = aResult[i]["comment"];
          litem.appendChild(llink);
          if (aResult[i]["devicename"]) {
            litem.appendChild(document.createTextNode(" (" + aResult[i]["devicename"] +  ")"));
          }
          tlist.appendChild(litem);
        }
      }
    }
  );
}

function hideLibrary() {
  document.getElementById("libraryArea").classList.add("hidden");
}

function dtformat(aUnixTimestamp) {
  // Library display time format: YYYY-MM-DD HH:mm
  // Note that JS has millisecond timestamps while standard/unix has seconds.
  var tsDate = new Date(aUnixTimestamp * 1000);
  // Note that .getUTCMonth() returns a number between 0 and 11 (0 for January)!
  return tsDate.getUTCFullYear() + "-" +
         (tsDate.getUTCMonth() < 9 ? "0" : "") + (tsDate.getUTCMonth() + 1 ) + "-" +
         (tsDate.getUTCDate() < 10 ? "0" : "") + tsDate.getUTCDate() + " " +
         (tsDate.getUTCHours() < 10 ? "0" : "") + tsDate.getUTCHours() + ":" +
         (tsDate.getUTCMinutes() < 10 ? "0" : "") + tsDate.getUTCMinutes();
}

