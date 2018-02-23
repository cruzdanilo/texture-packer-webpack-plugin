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
  }

  apply(compiler) {
    compiler.hooks.emit.tapAsync('TexturePackerPlugin', async (compilation, callback) => {
      const { assets } = compilation;
      const textures = {};
      const packer = new MaxRectsPacker(2048, 2048, 1, {
        smart: true,
        pot: false,
        square: false,
      });
      await Promise.all(Object.entries(assets).map(async ([f, v]) => {
        if (path.extname(f) !== '.png') return;
        delete assets[f];
        const name = path.basename(f);
        const t = await Jimp.read(v.source());
        packer.add(t.bitmap.width, t.bitmap.height, { name });
        textures[name] = t;
      }));
      const atlas = new Jimp(packer.bins[0].width, packer.bins[0].height);
      const json = { frames: {} };
      packer.bins[0].rects.forEach((r) => {
        json.frames[r.data.name] = {
          spriteSize: `{${r.width},${r.height}}`,
          spriteSourceSize: `{${r.width},${r.height}}`,
          textureRect: `{{${r.x},${r.y}},{${r.width},${r.height}}}`,
        };
        const t = textures[r.data.name];
        t.scan(0, 0, r.width, r.height, (x, y) => {
          atlas.setPixelColor(t.getPixelColor(x, y), x + r.x, y + r.y);
        });
      });
      atlas.getBuffer(Jimp.MIME_PNG, async (err, buf) => {
        if (!err) {
          const outputPath = this.options.outputPath || '';
          const png = await imagemin.buffer(buf, { use: [optipng()] });
          const name = `${crypto.createHash('md5').update(png).digest('hex')}.png`;
          if (name !== this.lastName) {
            this.lastName = name;
            const pngPath = path.join(outputPath, name);
            assets[pngPath] = {
              source: () => png,
              size: () => png.length,
            };
            json.metadata = {
              format: 3,
              realTextureFileName: name,
              textureFileName: name,
              size: `{${atlas.bitmap.width},${atlas.bitmap.height}}`,
            };
            const txt = Buffer.from(plist.build(json));
            const plistPath = path.join(
              outputPath,
              `${crypto.createHash('md5').update(txt).digest('hex')}.plist`,
            );
            assets[plistPath] = {
              source: () => txt,
              size: () => txt.length,
            };
            this.output = { png: pngPath, plist: plistPath };
          }
        }
        callback(err);
      });
    });
  }

  static loader(options) {
    return { loader: require.resolve('./loader'), options };
  }
}

module.exports = TexturePackerPlugin;
