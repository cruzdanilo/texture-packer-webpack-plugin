const path = require('path');
const crypto = require('crypto');
const { MaxRectsPacker } = require('maxrects-packer');
const Jimp = require('jimp');
const imagemin = require('imagemin');
const optipng = require('imagemin-optipng');
const plist = require('plist');

class TexturePackerPlugin {
  constructor(options = {}) {
    this.options = options;
    this.textures = new Map();
  }

  apply(compiler) {
    compiler.hooks.thisCompilation.tap(this.constructor.name, (compilation) => {
      const moduleTextures = {};

      compilation.hooks.optimizeTree.tap(this.constructor.name, (chunks, modules) => {
        modules.forEach(m => TexturePackerPlugin.transferTextures(moduleTextures, m.buildInfo));
      });

      compilation.hooks.optimizeAssets.tapPromise(this.constructor.name, async () => {
        await this.buildAssets(compilation, moduleTextures);
        Object.assign(compilation.assets, this.assets);
      });
    });
  }

  async buildAssets(compilation, newTextures = {}) {
    TexturePackerPlugin.transferTextures(newTextures, compilation);
    if (!Object.keys(newTextures).length) return;
    this.results = [];
    this.assets = {};
    await Promise.all(Object.entries(newTextures)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(async ([filename, texture]) => {
        this.textures.set(filename, {
          name: path.basename(filename),
          jimp: await Jimp.read(texture.source()),
        });
      }));
    const packer = new MaxRectsPacker(2048, 2048, 1, {
      smart: true,
      pot: false,
      square: false,
    });
    this.textures.forEach(t => packer.add(t.jimp.bitmap.width, t.jimp.bitmap.height, t));
    await Promise.all(packer.bins.map(async (bin) => {
      const atlas = new Jimp(bin.width, bin.height);
      const atlasInfo = { frames: {} };
      bin.rects.forEach((rect) => {
        const { name, jimp } = rect.data;
        atlasInfo.frames[name] = {
          spriteSize: `{${rect.width},${rect.height}}`,
          spriteSourceSize: `{${rect.width},${rect.height}}`,
          textureRect: `{{${rect.x},${rect.y}},{${rect.width},${rect.height}}}`,
        };
        jimp.scan(0, 0, rect.width, rect.height, (x, y) => {
          atlas.setPixelColor(jimp.getPixelColor(x, y), x + rect.x, y + rect.y);
        });
      });
      await new Promise((resolve, reject) => atlas.getBuffer(Jimp.MIME_PNG, async (err, b) => {
        if (err) reject(err);
        const outputPath = this.options.outputPath || '';
        const imageData = await imagemin.buffer(b, { use: [optipng()] });
        const name = `atlas.${crypto.createHash('md5').update(imageData).digest('hex').substr(0, 6)}.png`;
        const imagePath = path.join(outputPath, name);
        atlasInfo.metadata = {
          format: 3,
          realTextureFileName: name,
          textureFileName: name,
          size: `{${atlas.bitmap.width},${atlas.bitmap.height}}`,
        };
        const plistData = Buffer.from(plist.build(atlasInfo));
        const plistPath = path.join(
          outputPath,
          `atlas.${crypto.createHash('md5').update(plistData).digest('hex').substr(0, 6)}.plist`,
        );
        Object.assign(this.assets, {
          [imagePath]: { source: () => imageData, size: () => imageData.length },
          [plistPath]: { source: () => plistData, size: () => plistData.length },
        });
        this.results.push({ image: imagePath, plist: plistPath });
        resolve();
      }));
    }));
  }

  static transferTextures(target, buildInfo) {
    if (!buildInfo.assets) return;
    Object.entries(buildInfo.assets).forEach(([filename, asset]) => {
      if (!TexturePackerPlugin.isTexture(filename, asset)) return;
      const { assets } = buildInfo;
      delete assets[filename];
      Object.assign(target, { [filename]: asset });
    });
  }

  static isTexture(filename, asset) {
    return asset && path.extname(filename) === '.png';
  }

  static loader(options) {
    return { loader: require.resolve('./loader'), options };
  }
}

module.exports = TexturePackerPlugin;
