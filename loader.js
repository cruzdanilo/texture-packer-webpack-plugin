const path = require('path');
const loaderUtils = require('loader-utils');

module.exports = function loader(content) {
  const options = loaderUtils.getOptions(this) || {};
  const name = loaderUtils.interpolateName(this, '[name].[ext]', { content });
  this.emitFile(path.join(options.outputPath || '', name), content);
  return `/* ${loaderUtils.getHashDigest(content)} */
export default ${JSON.stringify(`#${name}`)};
if (module.hot) module.hot.decline();
`;
};

module.exports.raw = true;
