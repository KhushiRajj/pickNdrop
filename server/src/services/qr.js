const QRCode = require('qrcode');

/**
 * Generate a QR code as a base64 data URL.
 * @param {string} text - The URL to encode
 * @returns {Promise<string>} - data:image/png;base64,...
 */
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
