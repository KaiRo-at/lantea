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

window.onload = function() {
  var mSel = document.getElementById("mapSelector");
  for (var mapStyle in gMapStyles) {
    var opt = document.createElement("option");
    opt.value = mapStyle;
    opt.text = gMapStyles[mapStyle].name;
    mSel.add(opt, null);
  }

  initMap();
  resizeAndDraw();
  startTracking();
}

window.onresize = function() {
  resizeAndDraw();
}

function toggleSettings() {
  var fs = document.getElementById("settings");
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
      out += '      <trkpt lat="' + gTrack[i].coords.latitude + '" lon="' +
                                    gTrack[i].coords.longitude + '">' + "\n";
      if (gTrack[i].coords.altitude) {
        out += '        <ele>' + gTrack[i].coords.altitude + '</ele>' + "\n";
      }
      out += '        <time>' + makeISOString(gTrack[i].time) + '</time>' + "\n";
      out += '      </trkpt>' + "\n";
      gTrack[i].coords.latitude, gTrack[i].coords.longitude;
    }
    out += '    </trkseg>' + "\n";
    out += '  </trk>' + "\n";
    out += '</gpx>' + "\n";
    var outDataURI = "data:application/octet-stream," + encodeURIComponent(out);
    window.open(outDataURI, 'GPX Track');
  }
}
