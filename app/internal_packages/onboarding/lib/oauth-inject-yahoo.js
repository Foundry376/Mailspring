window.onload = function () {
    setTimeout(injectedAction, 2000);
}

function injectedAction() {
    const disagree = document.querySelector('#oauth2-disagree');
    disagree.onclick = function () {
        // tell parent to move page
        console.log('move-to-account-choose');
    }
}