var crypto = require('crypto');
var bufferize = require('./bufferize');

function Verifier(key) {
    if(!(this instanceof Verifier)) {
        return new Verifier(key);
    }

    this.key = bufferize(key);

    // Bind methods
    this.verify = this.verify.bind(this);
}

// data and signature should both be buffers
// encoding is optional and should be either 'base64', 'hex' or 'binary'
Verifier.prototype.verify = function(data, signature, encoding) {
    // PKCS1v15 - RSA & SHA1
    var verifier = crypto.createVerify('RSA-SHA1');

    // Add data to sign
    verifier.update(bufferize(data));

    return verifier.verify(this.key, signature, encoding);
};

module.exports = Verifier;
