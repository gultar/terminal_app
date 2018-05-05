// let WebSocket = require('ws');
let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
const express = require('express');
const http = require('http');
const url = require('url');
const WebSocket = require('ws');
const bodyParser = require('body-parser');


const app = express();
//let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];
// let peerAddr = ['ws://192.168.0.153:8080', 'ws://169.254.105.109:8080','ws://169.254.139.53:8080', 'ws://192.168.0.112:8080', 'ws://192.168.1.75:8080', 'ws://192.168.1.68:8080'];
let peerAddr = ['ws://192.168.1.75:8080','ws://192.168.1.68:8080'];


// var allowCrossDomain = function(req, res, next) {
//     res.header('Access-Control-Allow-Origin', "*");
//     res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
//     res.header('Access-Control-Allow-Headers', 'Content-Type');
//     next();
// }


app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
// app.use(allowCrossDomain);

function initP2PServer(blockchain){




  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });

  app.use(express.static(__dirname+'/views'));

  app.get('/', function(req, res, next) {

      res.render('index', { data: JSON.stringify(blockchain) });
  });


  app.get('/blockchain', function(req, res, next){
    res.json(JSON.stringify(blockchain));
  });

  wss.on('connection', function connection(ws, req) {
    const location = url.parse(req.url, true);
    const ip = req.connection.remoteAddress;
    // You might use location.query.access_token to authenticate or share sessions
    // or req.headers.cookie (see http://stackoverflow.com/a/16395220/151312)

    wss.broadcast = function broadcast(data) {
        wss.clients.forEach(function each(client) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(blockchain.chain.length,ip);
          }
        });
      };
    wss.broadcast(JSON.stringify(blockchain));
    ws.on('message', function incoming(message) {
      console.log('received: %s', message);
    });



  });

  app.get('/broadcast',(req, res)=>{
    wss.broadcast('Hello');
  })

  server.listen(8080, function listening() {
    console.log('Listening on %d', server.address().port);
  });

  wss.on('error', function(err){
    console.log('ERROR:', err);
  });
}


function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            peers[peersid[i]].send();
        });

		peers[peersid[i]].on('message', function(data){
			console.log('Received', data);
		});

    peers[peersid[i]].on('error', function(err){
      console.log('ERROR CLIENT:', err);
    })
    }
}

function pingAllPeers(){
  for(var i in peersid){
      peers[peersid[i]] = peerConnect(i);
  }

  for(var j in peersid){
      peers[peersid[j]]();
  }
}
//
// initP2PServer({'test':'test'});
// pingAllPeers({'client':'client'});

module.exports = { initP2PServer, pingAllPeers }
