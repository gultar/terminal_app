function bufferize(data) {
    if(data instanceof Buffer) {
        return data;
    }
    return new Buffer(data);
}

module.exports = bufferize;
