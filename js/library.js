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
      else {
        for (var i = 0; i < aResult.length; i++) {
          var litem = document.createElement("li");
          litem.textContent = aResult[i]["time_created"] + " - ";
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

