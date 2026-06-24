const QRCode = require('qrcode');

async function generateQR(text) {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.95,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    width: 300,
  });
}

module.exports = { generateQR };
