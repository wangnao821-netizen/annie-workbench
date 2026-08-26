process.noAsar = true;
const path = require('path');
const { build, Platform } = require('electron-builder');

console.log('[build-installer] starting electron-builder packaging for Windows x64...');

build({
  targets: Platform.WINDOWS.createTarget(),
  projectDir: __dirname,
  config: {
    ...require('./package.json').build,
  }
})
  .then((result) => {
    console.log('[build-installer] Packaging complete!');
    console.log(result);
  })
  .catch((err) => {
    console.error('[build-installer] Packaging failed:', err);
    process.exit(1);
  });
