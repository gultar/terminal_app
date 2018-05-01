
const express = require('express');
const fs = require('fs');
const find = require('find-process');
const Blockchain = require('./backend/blockchain');
const BlockchainAddress = require('./backend/blockchain-address');
const bodyParser = require('body-parser');
const app = express();
const router = express.Router();
const JSONdb = require('simple-json-db');
const p2pServer = require('./p2p-server');
const WebSocket = require('ws');

let nodeAddresses = [];
let peers = {};
let peersid = ['raspiOne', 'raspiTwo'];
let peerAddr = ['ws://169.254.139.53:8080', 'ws://169.254.139.53:8081'];



const PORT = 5000;

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
}


app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}));
app.use(allowCrossDomain);

//Request blockchain from peers


//fetch blockchain from file
let blockchain;
let blockchainFetched;

const initBlockchain = () => {
  const db = new JSONdb('/path/to/your/database.json');

  console.log('Initiating blockchain');
  blockchainFetched = loadBlockchainFromServer()

  setTimeout(() => {

    if(!blockchainFetched){
      console.log('No blockchain is available');
      blockchain = new Blockchain();

    }else{
      blockchain = new Blockchain(blockchainFetched.chain, blockchainFetched.pendingTransactions, blockchainFetched.nodeAddresses);
      blockchainFetched = null;
    }

  }, 4000);



};

const startServer = () => {
  console.log('Listening on port 5000');
  const server = app.listen(PORT);
  app.use(express.static(__dirname+'/views'));

  app.get('/', function(req, res, next) {

      res.render('index', { data: JSON.stringify(blockchain) });
  });

  app.get('/blockchain', function(req, res, next){
    res.json(JSON.stringify(blockchain));
    nodeAddresses.push(req.connection.remoteAddress);

  });

  app.post('/blockchain', function(req, res){

    let rawBlockchain = JSON.parse(req.body.blockchain);
    blockchain = new Blockchain(rawBlockchain.chain, rawBlockchain.pendingTransactions);
    rawBlockchain = null;
    saveBlockchain(blockchain);
  });

}

process.on('uncaughtException', (error) => {
  if (error.code === 'EADDRINUSE') {
    find('port', PORT)
      .then((list) => {
        const blockingApplication = list[0]
        if (blockingApplication) {
          console.log(`Port "${PORT}" is blocked by "${blockingApplication.name}".`)
          console.log('Shutting down blocking application PID...', blockingApplication.pid)
          process.kill(blockingApplication.pid)
        }
      })
  }
})

loadBlockchainFromServer = async () => {
  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              blockchainFetched = JSON.parse(data);
              console.log('------FromFile:',blockchainFetched);
            if (err){
                console.log(err);
            }


            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain()
            console.log(newBlockchain)
            saveBlockchain(newBlockchain);
            console.log("file does not exist")
            return false;
        }
      });
}

saveBlockchain = (blockchainReceived) => {
  console.log('Saving: ', blockchainReceived);
  fs.exists('blockchain.json', function(exists){
      if(exists){
          console.log("Saving Blockchain data to existing File");
          fs.readFile('blockchain.json', function readFileCallback(err, data){
            console.log('Reading blockchain.json file...');
          if (err){
              console.log(err);
          }

          let blockchainFromFile = JSON.parse(data);
          console.log('BlockchainFromFile: ', blockchainFromFile);
          let blockchain = compareBlockchains(blockchainFromFile, blockchainReceived);
          console.log('Longest blockchain is :',blockchain);
          let json = JSON.stringify(blockchain);
          if(json != undefined){
            console.log('Writing to file...');
            fs.writeFile('blockchain.json', json);
          }

          });
      } else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){
            fs.writeFile('blockchain.json', json);
          }

      }


      });
}

let initP2PNode = () => {

    let WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({ port: 8080 });

    wss.on('connection', function connection(ws) {

      ws.on('message', function incoming(blockchainReceived) {
        console.log('received: %s', blockchainReceived);

      });

    ws.send(JSON.stringify(blockchain));
    });

}

function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            console.log(JSON.stringify(blockchain));
            peers[peersid[i]].send(JSON.stringify(blockchain));
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


let fetchFromDistantNode = () => {
  const req = new XMLHttpRequest();
  req.open('GET', '192.168.0.153:5000/blockchain', false);
  req.send(null);

  if (req.status === 200) {
      console.log("Réponse reçue: %s", req.responseText);
  } else {
      console.log("Status de la réponse: %d (%s)", req.status, req.statusText);
  }
}

let stripIPAddr = (ip) => {
  var ipV4 = ip.substr()
}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

  if(receivedBlockchain){
      if(storedBlockchain.chain.length >= receivedBlockchain.chain.length){
      longestBlockchain = storedBlockchain;
    }
    else{
      longestBlockchain = receivedBlockchain;
    }

    return longestBlockchain;

  }else{
    return storedBlockchain;
  }

}

initBlockchain();
startServer();
initP2PNode();
pingAllPeers();
