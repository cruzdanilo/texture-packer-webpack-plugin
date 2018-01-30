const loaderUtils = require('loader-utils');

module.exports = function loader(content) {
  const name = loaderUtils.interpolateName(this, '[name].[ext]', { content });
  this.emitFile(name, content);
  return `module.exports = ${JSON.stringify(`#${name}`)};`;
};

module.exports.raw = true;
