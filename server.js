
const express = require('express');
const fs = require('fs');
const find = require('find-process');
const { Blockchain, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
const bodyParser = require('body-parser');
const app = express();
const router = express.Router();
const JSONdb = require('simple-json-db');
const p2pServer = require('./p2p-server');
const WebSocket = require('ws');
const { getIPAddress } = require('./backend/ipFinder.js');

let nodeAddresses = [getIPAddress(), '192.168.0.153', '169.254.139.53'];
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
  const db = new JSONdb('./blockchain.json');

  console.log('Initiating blockchain');
  blockchainFetched = loadBlockchainFromServer()

  setTimeout(() => {

    if(!blockchainFetched){
      console.log('No blockchain is available');
      blockchain = new Blockchain();
      blockchain.addNodeAddress()

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
  });

  app.post('/blockchain', function(req, res){
    let rawBlockchain = JSON.parse(req.body.blockchain);
    blockchain = new Blockchain(rawBlockchain.chain, rawBlockchain.pendingTransactions);
    rawBlockchain = null;
    saveBlockchain(blockchain);
  });

  app.post('/transaction', function(req, res){
    if(typeof blockchain !== 'undefined'){
      let transReceived = JSON.parse(req.body.transaction);
      blockchain.createTransaction( new Transaction(transReceived.fromAddress, transReceived.toAddress, transReceived.amount, transReceived.data))
      transReceived = null;
      saveBlockchain(blockchain);
    }else{
      res.status(400);
      res.send('Blockchain not loaded or loading...');
    }

  })

  app.post('/mine', function(req, res){
    let rawMiningAddr = JSON.parse(req.body.address);

    miningAddr = new BlockchainAddress(rawMiningAddr.address, rawMiningAddr.blocksMined, rawMiningAddr.balance);
    console.log(miningAddr);
    var miningSuccess;
    var waitingOutputOnce = true;

    if(typeof blockchain != 'undefined'){
      console.log('Block:', blockchain);
      miningSuccess = blockchain.minePendingTransactions(miningAddr);
      if(miningSuccess){
        res.send(JSON.stringify(blockchain));
        console.log('Block mined: ' + blockchain.getLatestBlock().hash);
        console.log(miningAddr.address + ' mined ' + miningAddr.getBlocksMined() + ' blocks');
        console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());
        saveBlockchain(blockchain);
        return true;
      }else{
        if(waitingOutputOnce){
          console.log('Waiting for other transactions to occur');
          waitingOutputOnce = false;
          res.status(400);
          res.send('Waiting for other transactions to occur');
        }

      }
    }
  })

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

loadBlockchainFromServer = () => {
  fs.exists('blockchain.json', function(exists){

        if(exists){
            console.log("Loading Blockchain Data from file");
            fs.readFile('blockchain.json', function readFileCallback(err, data){
              console.log('Reading from blockchain.json file...');
              blockchainFetched = JSON.parse(data);
            if (err){
                console.log(err);
            }


            });
        } else {
          console.log('Generating new blockchain')
            let newBlockchain = new Blockchain()
            saveBlockchain(newBlockchain);
            console.log("file does not exist")
            return false;
        }
      });
}

saveBlockchain = (blockchainReceived) => {
  fs.exists('blockchain.json', function(exists){
      if(exists){
          console.log("Saving Blockchain data to existing File");
          fs.readFile('blockchain.json', function readFileCallback(err, data){
            console.log('Reading blockchain.json file...');
          if (err){
              console.log(err);
          }

          let blockchainFromFile = JSON.parse(data);
          let blockchain = compareBlockchains(blockchainFromFile, blockchainReceived);
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

let initP2PNode = (blockchainFromNode) => {

    let WebSocketServer = require('ws').Server,
        wss = new WebSocketServer({ port: 8080 });

    wss.on('connection', function connection(ws) {

      ws.on('message', function incoming(peerMsg) {

        console.log('Msg from peer: %s', peerMsg);
      });

      ws.on('message', function incoming(data) {
        // Broadcast to everyone else.
        wss.clients.forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      });
      wss.send(blockchainFromNode);
    });

// Broadcast to all.
}

function peerConnect(i){
    return function(){
        peers[peersid[i]] = new WebSocket(peerAddr[i]);
        peers[peersid[i]].on('open', function(){
            console.log('Sending: ', peerAddr);
            peers[peersid[i]].send(peerAddr); //
        });

		peers[peersid[i]].on('message', function(data){
			console.log('Received', data);
		});
    }
}

function pingAllPeers(blockchain){
  for(var i in peersid){
      peers[peersid[i]] = peerConnect(i, blockchain);
  }

  for(var j in peersid){
      peers[peersid[j]]();
  }
}


let fetchFromDistantNode = (address) => {
  const req = new XMLHttpRequest();
  req.open('GET', address + ':5000/blockchain', false);
  req.send(null);

  if (req.status === 200) {
      console.log("Réponse reçue: %s", req.responseText);

      rawBlockchainFromPeerNode = JSON.parse(req.responseText);

     return new Blockchain(rawBlockchainFromPeerNode.chain, rawBlockchainFromPeerNode.pendingTransactions, rawBlockchainFromPeerNode.blockbase);


  } else {
      console.log("Status de la réponse: %d (%s)", req.status, req.statusText);
  }
}

let queryAllNodesForBlockchain = (blockchainFromFile) => {
  let longestBlockchain = blockchainFromFile;
  console.log('Querying all nodes for blockchain...');
  for(let i=0; i < nodeAddresses.length; i++){
    nodeBlockchain = fetchFromDistantNode(nodeAddresses[i]);
    if(nodeAddresses.isChainValid()){
      longestBlockchain = compareBlockchains(longestBlockchain, nodeAddresses);
    }else{
      //invalid blockchain
      console.log('Address: ' + nodeAddresses[i] + ' has an invalid blockchain');
    }

  }
  blockchain = longestBlockchain;
}

const compareBlockchains = (storedBlockchain, receivedBlockchain=false) => {
  let longestBlockchain;

  if(receivedBlockchain){
      if(storedBlockchain.chain.length >= receivedBlockchain.chain.length){
        if(storedBlockchain.pendingTransactions.length >= receivedBlockchain.pendingTransactions.length){

            longestBlockchain = storedBlockchain;
        }
        else{
          longestBlockchain = receivedBlockchain;
        }
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
setTimeout(
function(){
  queryAllNodesForBlockchain(blockchain)
  console.log('Inititating p2p connections');
  initP2PNode(blockchain);
  pingAllPeers(blockchain);
}
, 6000);
