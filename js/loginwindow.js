/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

window.onload = function() {
  // Complete the login process by calling the main window.
  if (window.opener) {
    window.opener.finishLogin(getParameterByName("code"), getParameterByName("state"));
    window.close();
  }
  else {
    document.getElementById("logininfo").textContent = "You have called this document outside of the login flow, which is not supported.";
  }
}

function getParameterByName(aName) {
  // from http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
  name = aName.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
      results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}
