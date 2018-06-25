var signer = require('./lib/signer');
var verifier = require('./lib/verifier');

function sign(key, data, encoding) {
    return (signer(key)).sign(data, encoding);
}

function verify(key, data, signature, encoding) {
    return (verifier(key)).verify(data, signature, encoding);
}

module.exports = {
    sign: sign,
    verify: verify,

    Signer: signer,
    createSign: signer,

    Verifier: verifier,
    createVerify: verifier,
};
