const path = require('path');
const loaderUtils = require('loader-utils');

module.exports = function loader(content) {
  const options = loaderUtils.getOptions(this) || {};
  const name = loaderUtils.interpolateName(this, '[name].[ext]', { content });
  this.emitFile(path.join(options.outputPath || '', name), content);
  return `export default ${JSON.stringify(`#${name}`)};`;
};

module.exports.raw = true;
