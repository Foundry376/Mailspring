window.onload = function () {
    setTimeout(injectedAction, 2000);
}

function injectedAction() {
    const disagree = document.querySelector('#oauth2-disagree');
    if (!disagree) {
        return;
    }
    disagree.onclick = function () {
        // tell parent to move page
        console.log('move-to-account-choose');
    }
}

function deleteAllCookies() {
    var cookies = document.cookie.split(";");
    if (cookies.length > 0) {
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i];
            var eqPos = cookie.indexOf("=");
            var name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
            name = name.trim();
            var domain = location.host;
            // console.log('**domain:' + domain + ' name:' + name);
            document.cookie = name + "=;expires=" + new Date(0).toUTCString() + "; path=/; domain=.yahoo.com";
        }
    }
}