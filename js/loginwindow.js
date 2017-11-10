/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */
console.log("JS-load");

window.onload = function() {
  // Complete the login process by calling the main window.
  console.log("onload");
  if (window.opener) {
    console.log("opener");
    window.opener.finishLogin(getParameterByName("code"), getParameterByName("state"));
    console.log("finished");
    window.close();
  }
  else {
    console.log("no-opener");
    document.getElementById("logininfo").textContent = "You have called this document outside of the login flow, which is not supported.";
  }
}
