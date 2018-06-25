#!/usr/bin/env node

var fs = require('fs');
var prog = require('commander');

var pkg = require('../package.json');
var sign = require('../');

var log = console.log.bind(console);
var error = console.error.bind(console);

// General options
prog
.option('-v, --verbose', 'Show warnings, etc ...')
.option('-k, --key <key>', 'Private or public RSA key')
.option('-e, --encoding <encoding>', 'Signature encoding for input/output', 'base64')
.version(pkg.version);

prog.command('verify <file> <signature>')
.description("Verify a document's signature")
.action(function(file, signature, options) {
    var data = fileOrMessage(file);
    var sigData = fileOrMessage(signature);
    var key = fileOrMessage(prog.key);

    log(sign.verify(key, data, sigData, prog.encoding));
});

prog.command('sign <file>')
.description("Sign a file or message and print it's signature")
.action(function(file, options) {
    var data = fileOrMessage(file);
    var key = fileOrMessage(prog.key);

    log(sign.sign(key, data, prog.encoding));
})

function fileOrMessage(file) {
    var data = '';
    try {
        data = fs.readFileSync(file);
    } catch(e) {
        data = file;
        if(prog.verbose) {
            console.error("Warning: Could not read file", file, "considering it as a message:");
        }
    }
    return data;
}

if(!(prog.parse(process.argv).args) || process.argv.length === 2) {
    prog.help();
}
