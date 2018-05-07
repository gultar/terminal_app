var express = require('express');
var app = express();
var expressWs = require('express-ws')(app);
const bodyParser = require('body-parser');

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}

app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));

app.use(function (req, res, next) {
  console.log('middleware');
  req.testing = 'testing';
  return next();
});

app.use(express.static(__dirname+'/views'));

app.get('/', function(req, res, next) {

    res.render('index', { data: JSON.stringify(blockchain) });
});


app.get('/blockchain', function(req, res, next){
  res.json(JSON.stringify(blockchain));
});

app.ws('/', function(ws, req) {
  ws.on('message', function(msg) {
    console.log(msg);
  });
  console.log('socket', req.testing);
});

console.log('Listening on 8080...');
app.listen(process.env.PORT || 8080);
