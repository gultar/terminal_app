const express = require('express');
const http = require('http');
const app = express();
const port = 8080
const server = http.createServer(app);
app.use(express.static(__dirname+'/views'));

module.exports = { app, server, port }
