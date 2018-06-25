var crypto = require('crypto');
var bufferize = require('./bufferize');

function Signer(key) {
    if(!(this instanceof Signer)) {
        return new Signer(key);
    }

    this.key = bufferize(key);

    // Bind methods
    this.sign = this.sign.bind(this);
}

// data and signature should both be buffers
// encoding is optional and should be either 'base64', 'hex' or 'binary'
Signer.prototype.sign = function(data, encoding) {
    // PKCS1v15 - RSA & SHA1
    var signer = crypto.createSign('RSA-SHA1');

    // Add data to sign
    signer.update(bufferize(data));

    return signer.sign(this.key, encoding);
};

module.exports = Signer;
