var child_process = require('child_process');

// [from_path, to_path]
const file_mappings = [
    // svg icon
    ['veyron-design/icons/desktop/*.svg', './app/static/icons/'],
    ['veyron-design/icons/desktop/collpase.svg', './app/static/icons/collapse.svg'], // todo delete
    // system tray icon
    ['veyron-design/icons/desktop/MenuItem-*.png', './app/internal_packages/system-tray/assets/darwin/'],
    // lottie
    ['veyron-design/lottie/mac-onboarding.json', './app/static/lottie/mac-onboarding.json'],
    // onboarding images
    ['veyron-design/images/desktop/addAnotherAccount.png', './app/internal_packages/onboarding/assets/'],
    ['veyron-design/images/desktop/login-error.png', './app/internal_packages/onboarding/assets/'],
    ['veyron-design/images/desktop/manage-privacy.png', './app/internal_packages/onboarding/assets/'],
    ['veyron-design/images/desktop/all-set.png', './app/internal_packages/onboarding/assets/onboarding-done@2x.png'],
    // preferences
    ['veyron-design/images/desktop/prefs-appearance*.png', './app/static/images/preferences/appearance/'],
    ['veyron-design/images/desktop/prefs-quick-actions.png', './app/static/images/preferences/appearance/'],
    ['veyron-design/images/desktop/prefs-swipe-colors.png', './app/static/images/preferences/appearance/'],
    ['veyron-design/images/desktop/onecolumn-blue.png', './app/static/images/preferences/appearance/appearance-mode-list-active.png'],
    ['veyron-design/images/desktop/onecolumn-grey.png', './app/static/images/preferences/appearance/appearance-mode-list.png'],
    ['veyron-design/images/desktop/twocolumn-blue.png', './app/static/images/preferences/appearance/appearance-mode-split-active.png'],
    ['veyron-design/images/desktop/twocolumn-grey.png', './app/static/images/preferences/appearance/appearance-mode-split.png'],
    ['veyron-design/images/desktop/profile-hide-blue.png', './app/static/images/preferences/appearance/profile-hide-active.png'],
    ['veyron-design/images/desktop/profile-hide-grey.png', './app/static/images/preferences/appearance/profile-hide.png'],
    ['veyron-design/images/desktop/profile-show-blue.png', './app/static/images/preferences/appearance/profile-show-active.png'],
    ['veyron-design/images/desktop/profile-show-grey.png', './app/static/images/preferences/appearance/profile-show.png'],
    ['veyron-design/images/desktop/account-logo-*.png', './app/static/images/preferences/providers/'],
    ['veyron-design/images/desktop/account-logo-google.png', './app/static/images/preferences/providers/account-logo-gmail.png'], // todo delete
    // chat
    ['veyron-design/images/desktop/no-connection.png', './app/static/images/chat/no-connection.png'],
    ['veyron-design/images/desktop/image-not-found.png', './app/static/images/chat/image-not-found.png'],
    ['veyron-design/images/desktop/EmptyChat.png', './app/static/images/chat/EmptyChat.png'],
    // other images
    ['veyron-design/images/desktop/*nomail*.png', './app/static/images/empty-state/'],
    ['veyron-design/images/desktop/*zero*.png', './app/static/images/empty-state/'],
    ['veyron-design/images/desktop/nomail.png', './app/static/images/empty-state/nomail@2x.png'],
    ['veyron-design/images/desktop/nomail-drafts-3.png', './app/static/images/empty-state/ic-emptystate-drafts@2x.png'],
    ['veyron-design/images/desktop/nomail-flagged.png', './app/static/images/empty-state/ic-emptystate-flagged@2x.png'],
    ['veyron-design/images/desktop/installer-background.png', './app/build/resources/mac/'],
    ['veyron-design/images/desktop/edo-previewer-loading.gif', './app/build/resources/win/'],
]

let errorCommands = [];
function copyIt(from, to) {
    const command = `cp ../../${from} ${to}`;
    try {
        const result = child_process.execSync(command);
    } catch (e) {
        errorCommands.push(command);
    }
}

for (const mapping of file_mappings) {
    copyIt(mapping[0], mapping[1]);
}

// delete unused file
child_process.execSync(`rm ./app/static/images/empty-state/nomail.png`);

if (errorCommands.length) {
    console.log('*** Failed! *** ', errorCommands);
} else {
    console.log('*** Success! *** ');
}
