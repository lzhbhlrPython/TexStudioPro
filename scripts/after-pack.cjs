'use strict';
const path = require('node:path');
const { verifyPackagedApp } = require('./verify-release.cjs');
module.exports = async (context) => {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  console.log('[release] packaged ASAR and MCP verified', verifyPackagedApp(path.join(resources, 'app.asar')));
};
