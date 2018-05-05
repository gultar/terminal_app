let WebSocket = require('ws');
let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
//let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];
//let peerAddr = ['ws://192.168.0.153:8080', 'ws://169.254.105.109:8080','ws://169.254.139.53:8080', 'ws://192.168.0.112:8080', 'ws://192.168.1.75:8080', 'ws://192.168.1.68:8080'];
let peerAddr = ['ws://192.168.1.75:8080','ws://192.168.1.68:8080'];

function initP2PServer(){
  // let WebSocketServer = require('ws').Server,
  //     wss = new WebSocketServer({ port: 8080 });
  //
  // wss.on('connection', function connection(ws) {
  //   console.log('WS:',ws.connection);
  //   ws.on('message', function incoming(message) {
  //     console.log('received: %s', message);
  //   });
  //
  // wss.on('error', function(err){
  //   console.log('ERROR:', err);
  // });
  //
  // ws.send('Server');
  // });

//   const WebSocket = require('ws');
//
// const wss = new WebSocket.Server({ port: 8080 });
let WebSocketServer = require('ws').Server,
    wss = new WebSocketServer({ port: 8080 });
let test = {
  'test1':'herm',
  'test2':'derm'
}
// Broadcast to all.
wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// wss.broadcast('Hey!');

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(data) {
    // Broadcast to everyone else.
    wss.broadcast(JSON.stringify(test));
    // wss.clients.forEach(function each(client) {
    //   if (client !== ws && client.readyState === WebSocket.OPEN) {
    //     client.send(data);
    //   }
    // });
  });
});


wss.on('error', function(err){
  console.log('ERROR:', err);
});
}
 initP2PServer();
 pingAllPeers();

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
