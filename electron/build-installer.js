process.noAsar = true;
const path = require('path');
const { build, Platform } = require('electron-builder');

async function main() {
  console.log('[build-installer] starting electron-builder packaging for Windows x64...');
  try {
    const result = await build({
      targets: Platform.WINDOWS.createTarget(),
      projectDir: __dirname,
      config: {
        ...require('./package.json').build,
      }
    });
    console.log('[build-installer] Packaging complete!');
    console.log(result);
  } catch (err) {
    console.error('[build-installer] Packaging failed:', err);
    process.exit(1);
  }
}

main();
