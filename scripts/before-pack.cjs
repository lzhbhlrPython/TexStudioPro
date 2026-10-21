'use strict';
const { verifyDirectory } = require('./verify-release.cjs');
module.exports = async (context) => {
  const result = verifyDirectory(context.packager.projectDir);
  console.log('[release] renderer verified before packing', result);
};
