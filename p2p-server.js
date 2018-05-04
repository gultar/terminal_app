let WebSocket = require('ws');
let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
//let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];
let peerAddr = ['ws://192.168.0.153:8080', 'ws://169.254.105.109:8080',
'ws://169.254.139.53:8080', 'ws://192.168.0.112:8080', 'ws://192.168.1.75:8080', 'ws://192.168.1.68:8080'];


function initP2PServer(){
  let WebSocketServer = require('ws').Server,
      wss = new WebSocketServer({ port: 8080 });

  wss.on('connection', function connection(ws) {
    console.log('WS:',ws.connection);
    ws.on('message', function incoming(message) {
      console.log('received: %s', message);
    });

  ws.send('something');
  });

}
 initP2PServer();
 pingAllPeers();

function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            peers[peersid[i]].send(i);
        });

		peers[peersid[i]].on('message', function(data){
			console.log('Received', data);
		});
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
