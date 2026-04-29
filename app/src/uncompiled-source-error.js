// In packaged builds we don't ship the TypeScript compiler, so trying to load
// a plugin's raw .ts/.tsx source can't work. Register tiny require.extensions
// hooks that surface a clear "must be compiled" dialog instead of letting Node
// fail with a syntax error on the type annotations or JSX.

let dialogShown = false;

function showDialog(filePath) {
  if (dialogShown) return;
  dialogShown = true;
  const dialog =
    process.type === 'renderer'
      ? require('@electron/remote').dialog
      : require('electron').dialog;
  dialog.showErrorBox(
    'Plugin must be compiled',
    `Mailspring no longer ships with a TypeScript compiler to recompile plugins on the fly. ` +
      `Ask the plugin developer to compile the plugin to vanilla JavaScript as a pre-publish step.` +
      `\n\nFile: ${filePath}`
  );
}

['.ts', '.tsx'].forEach(extension => {
  Object.defineProperty(require.extensions, extension, {
    enumerable: true,
    writable: true,
    value: (module, filePath) => {
      showDialog(filePath);
      throw new Error(
        `Cannot load ${filePath}: Mailspring no longer ships with a TypeScript compiler. ` +
          `Plugins must be compiled to vanilla JavaScript as a pre-publish step.`
      );
    },
  });
});
