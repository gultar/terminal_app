//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////


//Server and p2p network stuff
const express = require('express');
const http = require('http');
const app = express();
const port = process.env.PORT || 8081
const server = http.createServer(app).listen(port);
const expressWs = require('express-ws')(app);
const io = require('socket.io-client');
const ioServer = require('socket.io')(server, {'pingInterval': 2000, 'pingTimeout': 10000, 'forceNew':false });
const fs = require('fs');
const { compareBlockchains } = require('./backend/validation.js');
/*
  List of peer ips and self ip finder
*/
const { getIPAddress } = require('./backend/ipFinder.js');
/*              'http://10.112.106.71:8080', 'http://10.112.106.71:8081', 'http://10.112.106.71:8082', //odesn't work - rasbpi at maria's
    'http://10.242.19.178:8080', 'http://10.242.19.178:8081', 'http://10.242.19.178:8082',
    'http://169.254.105.109:8080','http://169.254.105.109:8081','http://169.254.105.109:8082', //Ad hoc laptop*/
let thisAddress = 'http://'+getIPAddress()+':'+port;//'http://24.201.224.97:8080'
let ipList = [ thisAddress ];
  // = [
  //     'http://'+getIPAddress()+':'+port,
  //     'http://169.254.139.53:8080', 'http://169.254.139.53:8081', 'http://169.254.139.53:8082', //Ad hoc rasbpi
  //     'http://192.168.0.153:8080', 'http://192.168.0.153:8081', 'http://192.168.0.153:8082', //rasbpi at home
  //     'http://192.168.0.154:8080', 'http://192.168.0.154:8081', 'http://192.168.0.154:8082', //laptop at home
        //              'http://192.168.1.72:8080', 'http://192.168.1.72:8081', 'http://192.168.1.72:8082', //rasbpi at mom's
  //     'http://192.168.1.74:8080', 'http://192.168.1.74:8081', 'http://192.168.1.74:8082', //laptop at mom's
  //     ]; //desn't work - laptop at maria's
/*
  Blockchain classes and tools
*/
const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord, Blockbase } = require('./backend/blockchain');
const {  encrypt, decrypt, getKeyPair } = require('./backend/keysHandler');
const cryptico = require('cryptico');
const merkle = require('merkle');
const sha256 = require('./backend/sha256');
var crypto = require('crypto');

let blockchain;
let dataBuffer;
let privKey;

let thisNode = {
  'type' : 'node',
  'address' : ipList[0], //
  'status':'active',
  'publicID' : '',
  'publicKeyFull' : '',
  'isMining': false,
  'fingerprint':'',
  'timestamp':''
}


//Container for all connected client tokens
let clients = [];
let endpoints = [];
//Container for all peer socket connections
let peers = [];
let miner = false;

let currentMiners = [];
let peerBuildsNextBlock = false;
let sendTrials = 0;

//Variable to handle reconnection efficiently
let pingClient;


/*
  Starts the websocket server, listens for inbound connections
*/

const startServer = () =>{



  log('\nStarting node at '+thisNode.address+"\n");
  log('Node Public Address: '+thisNode.publicID + "\n");

  app.use(express.static(__dirname+'/views'));

  app.on('/', () => {
    res.send(getIPAddress());
  })


  ioServer.on('connection', (socket) => {


    validateFingerprint(socket, (isNode, isEndpoint)=>{
      if(isNode){
        log('Node is connecting...')
        nodeEventListeners(socket);
      }else if(isEndpoint){
        log('Endpoint connecting...')
        endpointEventListeners(socket);
      }else{
        log('Connection attempt failed. Invalid fingerprint.');
        log('Shutting down connection...');
        socket.disconnect('unauthorized');
      }
    })


  });

}

const nodeEventListeners = (socket) =>{

      socket.on('message', (msg) => {
        log('Client:', msg);
      });

      socket.on('error', (exception)=>{
              log('Error:',exception);
              socket.destroy();
      })

      socket.on('sendYourAddress', (token)=>{

        socket.emit('addressReceived', thisNode);

        if(!clients[token.address]){
          try{
            blockchain.addNewToken(token);
            initClientSocket(token.address);
          }catch(err){
            log(err);
          }

        }

      })

      socket.on('sync', (hash, token)=>{
        sync(hash, token)
      })


      socket.on('connectionRequest', (peerToken)=>{

        storeToken(peerToken);

        setTimeout(()=>{
          handleNewClientConnection(peerToken)

        }, 2000)

      })

      socket.on('storeToken', (token) =>{
        storeToken(token);
      })



      socket.on('distributedTransaction', (transaction, fromNodeToken) => {
        distributeTransaction(transaction, fromNodeToken);
      })

      socket.on('transaction', (transaction, fromNodeToken) => {
        receiveTransactionFromClient(transaction, fromNodeToken);
      });



      socket.on('miningRequest', () =>{
        if(!thisNode.isMining){
          attemptMining(thisNode);
        }else{
          cancelMining(true);
        }

      });


      socket.on('newBlock', (newBlock) =>{
        receiveNewBlock(newBlock);
      });

      socket.on('peerBuildingBlock', (token) =>{
        if(token != undefined){
          if(currentMiners[token.address] == token){
            log('TOKEN HASH ' + token.publicID.substr(0, 10)+ ' has started mining');
          }
        }
      })

      socket.on('peerFinishedBlock', (token) =>{
        if(token != undefined){
          if(thisNode.isMining){
            attemptMining(thisNode);
          }
        }

      })

}

const endpointEventListeners = (socket) =>{
  /*
  * Endpoint Client listeners
  *
  */

  socket.on('registerEndpoint', (token)=>{
    if(token){
        registerEndpoint(socket, token);
    }
  })

  socket.on('getBlockchain', (token) =>{
    if(token){
      getBlockchain(socket, token);
    }

  });


  socket.on('joinNetwork', (token)=>{
    if(token){
      connectToPeerNetwork();
    }
  })

  socket.on('leaveNetwork', (token)=>{
    if(token){
      leaveNetwork();
    }
  })


  socket.on('blockchain', (blockchainReceived) => {
          blockchain = compareBlockchains(blockchain, blockchainReceived);
  });

  socket.on('broadcastMessage', (msg) =>{

    log('-BROADCAST- '+msg);
    sendEventToAllPeers('message', msg);
  })


  socket.on('validateChain', (token) =>{
    if(blockchain != undefined && blockchain instanceof Blockchain){
      log('Blockchain valid?',blockchain.isChainValid());
      var validStatus = blockchain.validateAddressToken(thisNode);
      log(validStatus);
    }
  })

  socket.on('firstContact', (address)=>{

    if(address){
      socket.emit('message', 'Attempting to reach to '+address);
      if(!isPeerConnected(address)){
        // initClientSocket(address);
        initClientSocket(address)
      }else{
        log('Peer '+address+' is already connected');
      }


    }
  })

  socket.on('dropPeer', (address)=>{
    if(address){
      dropPeer(address);
    }
  })

  socket.on('minerStarted', (miningAddress) =>{
      if(miningAddress != undefined){
              currentMiners[miningAddress.hash] = miningAddress;
      }
  })



  socket.on('close', (token) => {
    if(token){
      try{
        if(token.type == 'endpoint'){
          delete endpoints[token.publicID];
          log('endpoint disconnected')
        }else{
          delete clients[token.address];
          log('Disconnected clients: ', token.address);
          getNumPeers();
        }
      }catch(err){
        log(err);
      }
    }

  });
}

/**
  Broadcasts a defined event, need to find a way to handle more than two parameters
  @param {string} Event type/name
  @param {Object} May be an object or any kind of data
  @param {Object} Optional: any kind of data also

*/
const sendEventToAllPeers = (eventType, data, moreData=false ) => {
  if(peers.length > 0){
    for(var i=0; i<peers.length; i++){
      if(!moreData){
        peers[i].emit(eventType, data);
      }else{

        peers[i].emit(eventType, data, moreData);
      }
    }
  }

}

/*
  Sends event to target socket client
*/
const sendToTargetPeer = (eventType, data, address) =>{
  for(peer of peers){
    var peerAddress = 'http://'+peer.io.opts.hostname +':'+ peer.io.opts.port

    if(peerAddress === address){
        peer.emit(eventType, data);
    }
  }
}

const sendMessageToAllEndpoints = (message) =>{
  if(message){

    if(Object.keys(endpoints).length > 0){
      for(var endpointID of Object.keys(endpoints)){
        var endpoint = endpoints[endpointID];


        endpoint.emit('message', message);
      }
    }
  }

}

/*
  Init blockchain starting from local file
*/
const initBlockchain = (tryOnceAgain=true) => {
  //flag to avoid crashes if a transaction is sent while loading


  log('Initiating blockchain');
  dataBuffer = loadBlockchainFromServer()


  setTimeout(() => {

    if(!dataBuffer){
      log('No blockchain is available');
      setTimeout(() => {

        if(tryOnceAgain){
          log('Trying to load blockchain again');
          return initBlockchain(false);
        }

      })
      blockchain = new Blockchain();

    }else{
      blockchain = instanciateBlockchain(dataBuffer);
      blockchain.addNewToken(thisNode);
      updateIpList();

    }


  }, 4000);


};

/*
  Defines a client socket connection
*/
const initClientSocket = (address) =>{
  if(address){
    if(!isPeerConnected(address)){

      try{

        var peerSocket = io(address, {
          'reconnection limit' : 1000,
          'max reconnection attempts' : 20,
          'query':{
            token: JSON.stringify(thisNode)
          }
        });

        peerSocket.heartbeatTimeout = 120000;
        log('Connecting to '+ address+ ' ...');

      }catch(err){
        console.log(err);
      }

      peerSocket.on('connect', () =>{

        peers.push(peerSocket);
        log('Connected!')
        getNumPeers();
        setTimeout(()=>{


          peerSocket.emit('connectionRequest', thisNode);

          peerSocket.emit('message', 'Peer connection established by '+ thisNode.address);
          peerSocket.emit('message', 'Connected at : '+ displayTime() +"\n");
          keepAlive(peerSocket, address);



        }, 8000)

      });

      peerSocket.on('message', (message)=>{
        log('Server: ' + message);
      })


      peerSocket.on('disconnect', () =>{
        log('connection with peer dropped');
        peers.splice(peers.indexOf(peerSocket), 1);
        peerSocket.destroy()
      })
    }else{
      // log('Peer '+address+' already connected');
    }
  }else{
    log('Address in undefined');
  }




}

/*
  Open all client socket connection to peers
*/
const connectToPeerNetwork = () => {
  log('Connecting to all known peers...');
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != thisNode.address){

        var address = ipList[i];
        initClientSocket(address);
        // firstContact(address);


    }
  }

}

const leaveNetwork = () =>{
  log('Leaving network...');
  peers = [];
  // if(peers.length > 0){
  //   // for(var peer of peers){
  //   //   log('Closing connection to '+ peer.io.uri);
  //   //   peer.emit('close', thisNode);
  //   //   peer.destroy();
  //   // }
  //
  // }else{
  //   log('Need to be connected to at least one peer...');
  // }

}

const makeSureIsConnectedToThisNode = (socket, address, nonce=10) =>{
  if(socket && address){
    var nonce = nonce;
    var requestTime = 1000 * nonce
    var requesting = setTimeout(()=>{
      // requestTime = 1000 * requestNumber;
      if(isPeerConnected(address)){
        socket.emit('connectionRequest', thisNode)
      }
      // log('Time', requestTime);
      // requestNumber = requestNumber + requestNumber;
      nonce = nonce + 5
      return makeSureIsConnectedToThisNode(socket, address, nonce)
    }, requestTime)



  }

}

const keepAlive = (socket, address) =>{
  if(socket && address){
    if(isPeerConnected(address)){
      var keepAlive = setInterval(()=>{
        socket.emit('connectionRequest', thisNode)
      }, 30000)

    }
  }
}



const isPeerConnected = (address) =>{
  if(address){
    for(var peer of peers){
      if(peer.io.uri == address){
        return true;
      }
    }
    return false;
  }
}

const getPeer = (address, cb) =>{
  if(address){
    for(var peer of peers){
      if(peer.io.uri == address){
        cb(peer);
      }
    }
    cb(false)
  }
}


/*
  This is the socket listener function for when a peer
  Connects to this node as a client
*/
const handleNewClientConnection = (token) =>{

  if(token){
    if(!isPeerConnected(token.address)){

      log('Initiating peer connection to ', token.address);
      initClientSocket(token.address);
    }else if(isPeerConnected(token.address) && !clients[token.address]){
      var peer;
      log('Received token from an inconnected client');
      log('Sending this token to request connection');

      getPeer(token.address, (socket)=>{
        peer = socket;

        if(peer){
          peer.emit('connectionRequest', thisNode);
        }else{
          log('invalid address');
        }
      });

    }else{
      // log('peer '+token.address+' already connected')
    }
  }else{
    log('Received empty token');
  }
}

const dropPeer = (address) =>{
  if(address){
    if(isPeerConnected(address)){
      log('address:'+address);
      getPeer(address, (socket)=>{
        if(socket){
          log('Connection to peer '+address+' closed');
          socket.emit('close');
          socket.destroy;
          return true;
        }else{
          log('Cannot drop connection, peer '+address+' not found')

        }

      })
    }
  }
}

const registerEndpoint = (socket, token) =>{
  if(token){
    if(token.type == 'endpoint'){

      endpoints[token.publicID] = socket;

      log('Endpoint client connected to this node');
      log('Hash: '+ token.publicID);
      socket.emit('message', 'You are now connected to ' + thisNode.address);
      log('Connected at : '+ displayTime() +"\n");

      getNumPeers();

    }
  }
}


const firstContact = (address) =>{
  if(address){
    try{
      var tempSocket = io(address);
      tempSocket.emit('sendYourAddress', thisNode);

      tempSocket.on('addressReceived', (token)=>{
        if(ipList.indexOf(token.address) == -1){
          ipList.push(token.address);
          storeToken(token);
          // blockchain.addNewToken(peerToken);
          // saveBlockchain(blockchain);
          initClientSocket(token.address);

        }else{

          handleNewClientConnection(token);
          tempSocket.destroy();
        }

      })
    }catch(err){
      log(err);
    }
  }
}


const updateIpList = () =>{
  var token;
  if(blockchain){
    for(var id of Object.keys(blockchain.nodeTokens)){
      token = blockchain.nodeTokens[id];
      if(ipList.indexOf(token.address) == -1){
        ipList.push(token.address);
      }
    }
  }

  // log(ipList);
}

/*
  Searches for instanciated miningAddress in blockchain, if not, creates it
*/
const getMiningAddress = (addressToken) => {
  if(blockchain !== undefined){
    if(blockchain.miningAddresses[addressToken.publicID] && blockchain.miningAddresses[addressToken.publicID] instanceof BlockchainAddress){
            return blockchain.miningAddresses[addressToken.publicID];
    }else{
            blockchain.addMiningAddress(addressToken);
    }

  }

}

/*
  Loads the blockchain from the json file and instanciates it
*/
const loadBlockchainFromServer = () => {

  //flag to avoid crashes if a transaction is sent while loading
  fs.exists('blockchain.json', function(exists){
      if(exists){
        var data = '';
        let blockchainDataFromFile;
        var rstream = fs.createReadStream('blockchain.json');
        log('Reading blockchain.json file...');

        rstream.on('error', (err) =>{
                log(err);
                return err;
        })

        rstream.on('data', (chunk) => {
                data += chunk;
        });



        rstream.on('close', () =>{  // done

                                if(data != undefined){
          try{
            blockchainDataFromFile = JSON.parse(data);
            dataBuffer = instanciateBlockchain(blockchainDataFromFile);
            log('Blockchain successfully loaded from file and validated')
          }catch(err){
            console.error(err);
          }


          return dataBuffer;

        }else{
                return false;
        }


      });

    }else {
            log('Generating new blockchain')
            let newBlockchain = new Blockchain();
            // newBlockchain = seedNodeList(newBlockchain, thisNode);
            // seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
            blockchain = newBlockchain;
            saveBlockchain(newBlockchain);
            log("file does not exist")

            return false;
    }

  });


}

/*
  Saves the blockchain to a json file
*/
const saveBlockchain = (blockchainReceived) => {


  fs.exists('blockchain.json', function(exists){
      if(exists){
          var longestBlockchain;

          if(blockchainReceived != undefined){

              if(!(blockchainReceived instanceof Blockchain)){
                      blockchainReceived = instanciateBlockchain(blockchainReceived);
              }

              let json = JSON.stringify(blockchainReceived);

              if(json != undefined){
                      log('Writing to blockchain file...');

                      var wstream = fs.createWriteStream('blockchain.json');

                      wstream.write(json);
                      wstream.end();

              }

                  // });
          }

      } else {
        log("Creating new Blockchain file and saving to it")
        let json = JSON.stringify(blockchainReceived);
        if(json != undefined){

              var wstream = fs.createWriteStream('blockchain.json');

                wstream.write(json);
                wstream.end();
        }

      }
  });
}

/*
  Ran once, this attempts to mine all pending transactions if their number
  is at least equal to the current blocksize
*/
const startMining = (miningAddrToken) => {

    miningAddr = blockchain.getMiningAddress(miningAddrToken);

      if(miningAddr){

                miningSuccess = blockchain.minePendingTransactions(miningAddr, (isMiningBlock, finishedBlock)=>{
      if(isMiningBlock && !finishedBlock){
        log('===============STARTED MINING!!!!!')
        sendEventToAllPeers('peerBuildingBlock', thisNode);
      }else if(!isMiningBlock && finishedBlock){
        log('+++++++++++++++FINISHED MINING!!!!!');
        // sendEventToAllPeers('peerFinishedBlock', thisNode);
      }

    });

    if(miningSuccess){

          log('\nBalance of '+miningAddr.address+' is '+ blockchain.getBalanceOfAddress(miningAddr));

          var message =  'A new block has been mined by ' + miningAddr.publicID + '. Sending new block';
          var newBlock = blockchain.getLatestBlock();
          ioServer.emit('miningApproved', blockchain);
          ioServer.emit('message', message);
          sendEventToAllPeers('message', message);
          log(message);
          setTimeout(()=>{
                  // log('Sending:', newBlock)
                  sendEventToAllPeers('newBlock', newBlock);
          }, 3000)

          return true;

    }

    return false;

    }else{
        log('Invalid mining address');
      return false;
    }



}

/*
  This the listener function that fetches missing blocks
  and sends them to querying peer
*/
const sync = (hash, token) =>{
  if(blockchain != undefined && hash != undefined && token != undefined){

      var blocks = blockchain.getBlocksFromHash(hash);

    if(blocks){
      if(blocks.length > 0){

        sendEventToAllPeers('message', 'Updating the chain of peer '+token.address+"Sending "+blocks.length+" blocks");
        sendToTargetPeer('newBlock', blocks, token.address);
      }



    }else if(!blocks){

    }

  }
}

/*
  This is a listener function that catches, stores and instanciates
  into BlockchainAddresses all node tokens received
*/
const storeToken = (token) =>{
  if(token && blockchain instanceof Blockchain){


    clients[token.address] = token;

    if(!blockchain.nodeTokens[token.publicID]){
      log('Received a node token from ', token.address);
      log(blockchain.nodeTokens[token.publicID]);
      saveBlockchain(blockchain);

      blockchain.nodeTokens[token.publicID] = token;

    }else{
      // log('Token already received');
    }

    updateIpList();
  }
}

/*
  This is a listener function that redistributes a transaction once its been received
  from an endpoint client
*/
const distributeTransaction = (transaction, fromNodeToken) =>{
  ///////////////////////////////////////////////////////////
  //Need to validate transaction everytime it is received
  ///////////////////////////////////////////////////////////
  if(blockchain){
    if(transaction && fromNodeToken){
      log('Peer '+fromNodeToken.address+' has sent a new transaction.');
      log(transaction);

      var transactIsValid = blockchain.validateTransaction(transaction, fromNodeToken);

      blockchain.createTransaction(transaction);

    }
  }
}

/*
  This is a listener function that catches a transaction emitted from endpoint client,
  validates it and distributes it to all peers
*/
const receiveTransactionFromClient = (transaction, fromEndpointToken) =>{
  ///////////////////////////////////////////////////////////
  //Need to validate transaction before adding to blockchain
  ///////////////////////////////////////////////////////////

  if(blockchain){
    if(transaction){
      if(fromEndpointToken){
        if(fromEndpointToken.type == 'endpoint'){

          var fromAddress = blockchain.nodeTokens[transaction.fromAddress];
          var toAddress = blockchain.nodeTokens[transaction.toAddress];

          var transactionObj = new Transaction(
            thisNode.publicID,
            transaction.toAddress,
            transaction.amount,
            transaction.data,
            transaction.timestamp,
            undefined,
            transaction.type
          );

          transactionObj.sign();

          //Need to validate transact before broadcasting it
          setTimeout(()=>{
            var transactIsValid = blockchain.validateTransaction(transactionObj, fromAddress);

            blockchain.createTransaction(transactionObj);
            sendEventToAllPeers('distributedTransaction', transactionObj, thisNode);
            console.log('Received new transaction:', transactionObj);
            transactionObj = null;
          }, 1500)

        }
      }else{
        log('ERROR: Endpoint token is undefined')
      }
    }else{
      log('ERROR: Transaction is undefined')
    }
  }else{
    log('Node is unavailable for receiving the transaction');
  }
}

/*
  Creates an chain of block signatures, that is, the hash of the block and the previous hash only.
*/
const buildChainHashes = () =>{
    var publicIDsOnChain = []

    var chain = blockchain.chain;


    for(var i=0; i<chain.length; i++){
            publicIDsOnChain.push({
                    hash:chain[i].hash,
                    previousHash:chain[i].previousHash,
                    timestamp:chain[i].timestamp
            })
    }

    return publicIDsOnChain;
}

/*
  Logs the number of other active peers on network
*/
const getNumPeers = () =>{
  if(peers != undefined){

    if(peers.length > 0){
            log('Number of other available peers on network:',peers.length);
            return peers.length;
    }

  }
}


//self describing
const instanciateBlockchain = (blockchain) =>{
        return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks, blockchain.publicKeys);
}


// const validateTransaction = (transaction, token) =>{
//     if(transaction != undefined && token != undefined){
//
//         if(blockchain != undefined && blockchain instanceof Blockchain){
//
//             var balanceOfSendingAddr = blockchain.getBalanceOfAddress(token) + blockchain.checkFundsThroughPendingTransactions(token);
//
//             if(!balanceOfSendingAddr){
//                             log('Cannot verify balance of undefined address token');
//             }else{
//
//                 if(balanceOfSendingAddr >= transaction.amount){
//                         log('Transaction validated successfully');
//                         return true;
//
//                 }else if(transaction.type === 'query'){
//                         //handle blockbase queries
//                 }else{
//                         log('Address '+token.address+' does not have sufficient funds to complete transaction');
//                         return false
//                 }
//
//             }
//
//
//         }else{
//                 log("ERROR: Can't validate. Blockchain is undefined or not instanciated. Resync your chain");
//                 return false
//         }
//
//   }else{
//           log('ERROR: Either the transaction or the token sent is undefined');
//           return false;
//   }
//
// }

/*
  Need to find a way to use this in transaction validation
*/
const recalculateMerkleRoot = (transactions) =>{
  if(transactions != undefined){
    var transactionHashes = Object.keys(transactions);


    let merkleRoot = merkle('sha256').sync(transactionHashes);
    return merkleRoot.root();
  }

}


/*
  Listener function that sends blockchain if it's valid
*/
const getBlockchain = (socket, token) =>{
  var validityStatus;

  //Query all nodes for blockchain
  if(blockchain != undefined){

    if(!(blockchain instanceof Blockchain)){
      blockchain = instanciateBlockchain(blockchain);
    }
      validityStatus = blockchain.isChainValid();
      if(validityStatus === true){
        var msg = token.address + ' has requested a copy of the blockchain!';
        // log(msg);
        sendEventToAllPeers('message', msg);
        sendToTargetPeer('blockchain', blockchain, token.address);
        ioServer.emit('blockchain', blockchain);
      }else{
        log('Current blockchain is invalid. Flushing local chain and requesting a valid one');
        blockchain = new Blockchain(); //Need to find a way to truncate invalid part of chain and sync valid blocks
        sendEventToAllPeers('getBlockchain', thisNode);
      }

  }else{
    socket.emit('message', 'Blockchain is unavailable on node. It might be loading or saving.');
  }

}

/*
  Listener funcction that catches a block or a group of blocks, validates everything and
  appends it to current chain. With every single block, there needs to be thorough validation,
  on every single transaction
*/
const receiveNewBlock = (newBlock) =>{
  var hasSynced = false;

  if(newBlock != undefined && blockchain != undefined){
    // log(newBlock);
    if(newBlock.length >= 1 && Array.isArray(newBlock)){
      for(var i=0; i<newBlock.length; i++){

          hasSynced = handleNewBlock(newBlock[i]);

      }

    }else if(newBlock !== undefined){
      hasSynced = handleNewBlock(newBlock)
    }

  }else{
    log('New block received or blockchain is undefined');
  }

  if(hasSynced){
    ioServer.emit('blockchain', blockchain);
    saveBlockchain(blockchain);
  }
}

/*
  Single block handler, aims to sync a block if valid and attached to last known block
*/
const handleNewBlock = (newBlock) =>{
  if(newBlock != undefined && newBlock != null && typeof newBlock == 'object'){
    // log('Received block:', newBlock.hash);

    var isBlockSynced = blockchain.syncBlock(newBlock);
    if(isBlockSynced){

      return true;
    }else if(typeof isBlockSynced === 'number'){
            //Start syncing from the index returned by syncBlock;
            // sendEventToAllPeers('getBlockchain', thisNode); //Use this meanwhile
      log('Block is already present');
      return false;
    }else{
            // sendEventToAllPeers('getBlockchain', thisNode);
            // log('Block refused');
      return false;
    }
  }else{
    log('Block handler error: New block is undefined');
    return false;
  }

}

/*
  Routine that pokes network to know if this node has missed a broadcasted change
*/
const chainUpdater = () =>{
        // sendEventToAllPeers('getBlockchain', thisNode);
    setInterval(() =>{
      if(blockchain != undefined){
        var latestBlock = blockchain.getLatestBlock();

        sendEventToAllPeers('sync', latestBlock.hash, thisNode);
        sendEventToAllPeers('ipList', ipList);

      }else{
              log('blockchain is not loaded yet. Trying again');
              return chainUpdater();
      }
    }, 30000)

}

/*
  Listener function that runs the miner and saves if it has a new block
  Not too useful, could be put into socket listener directly
*/

const cancelMining = (disableMiner=false) =>{
  if(miner){
    clearInterval(miner)
    if(disableMiner){
      thisNode.isMining = false;
    }

    miner = false;
  }else{
    log('Miner is not active');
  }

}

const attemptMining = (miningAddrToken) =>{

  ///////////////////////////////////////////////////////////
  //need to validate miningAddr before allowing mining action;
  ///////////////////////////////////////////////////////////

    thisNode.isMining = true;
    sendEventToAllPeers('message', miningAddrToken.address+ ' has started mining.');
                sendEventToAllPeers('minerStarted', miningAddrToken);
    miner = setInterval(()=>{
      if(blockchain != undefined){

        var hasMinedABlock = startMining(miningAddrToken);

        if(hasMinedABlock){
          saveBlockchain(blockchain);
        }


      }
    }, 1000)


}

const displayTime = () =>{
  var d = new Date(),   // Convert the passed timestamp to milliseconds
    year = d.getFullYear(),
    mnth = d.getMonth(),        // Months are zero based. Add leading 0.
    day = d.getDay(),                   // Add leading 0.
    hrs = d.getHours(),
    min = d.getMinutes(),
    sec = d.getSeconds(),               // Add leading 0.
    ampm = 'AM';

    return hrs+":"+min+":"+sec;
}

const log = (message, orMessageHere) =>{
  if(message){
    if(orMessageHere){
      console.log(message + ' ' + orMessageHere);
      sendMessageToAllEndpoints(message + ' ' + orMessageHere);
    }else{
      console.log(message);
      sendMessageToAllEndpoints(message);
    }

  }
}

const fingerprintGenerator = () =>{
  var timestamp = Date.now();

  log(timestamp)
    fs.exists('private.pem', (exists)=>{
      if(exists){
        try{

          var pem = fs.readFileSync('private.pem');
          var key = pem.toString('ascii');
          var sign = crypto.createSign('RSA-SHA256');
          sign.update(thisNode.publicID + timestamp);  // data from your file would go here
          thisNode.fingerprint = sign.sign(key, 'hex');
          thisNode.timestamp = timestamp;
          key == null;
          pem == null;
        }catch(err){
          console.log(err);
        }

      }else{
        log('ERROR: Need to generate a private key');
      }
    })


}

const validateFingerprint = (socket, callback) =>{

  let token = socket.handshake.query.token;
  log(token);
  if(token){

    try{
      token = JSON.parse(token)
    }catch(err){

      log(err);
      callback(false, false)
    }
    if(token.type == 'node'){
      if(token.publicKeyFull && token.fingerprint){

        /*Validating the finger which is an RSA-SHA256 signature from a timestamp and the publicID*/
        try{

          const verify = crypto.createVerify('RSA-SHA256');
          verify.update(token.publicID + token.timestamp);

          //Node
          callback(verify.verify(token.publicKeyFull, token.fingerprint, 'hex'), false)

        }catch(err){
          console.log(err);

          callback(false, false)
        }

      }else{
        log('ERROR: Invalid Token. Missing fingerprint');

        callback(false, false)
      }

    }else if(token.type == 'endpoint'){
      callback(false, true); //endpoint
    }

  }else{
    log('ERROR: Missing token from query. Shutting down connection');

    callback(false, false)
  }


}



initBlockchain();
setTimeout(()=>{
  startServer();


  chainUpdater();
}, 5000)

getKeyPair((keys)=>{
  if(keys){

    /*
    Skipping privateKey. Only used when signing transactions
    */
    thisNode.publicKeyFull = keys.publicKey;
    thisNode.publicID = sha256(keys.publicKey + thisAddress);
    fingerprintGenerator();
  }

})


setTimeout(()=>{

  // var godTx = new Transaction('genesis', '1f739a220d91452ff5b4cc740cfb1f28cd4d8dce419c7a222640879128663b74', 100, { coinbase:'port8080'}, null, null, 'coinbase');
  // blockchain.createTransaction(godTx);
  // saveBlockchain(blockchain);


}, 12000)
// setTimeout(()=>{
//   var myRecord = new BlockbaseRecord('test', 'testTable',thisNode.address, JSON.stringify({  test: 'Setting this will make Tor write an authentication cookie. Anything with' }))
//
//     blockchain.createTransaction(new Transaction(thisNode.address, 'blockbase', 0, JSON.stringify(myRecord), Date.now(), myRecord.uniqueKey));
//
//
//   var mySecondRecord = new BlockbaseRecord('test2', 'testTable',thisNode.address,  JSON.stringify({  test: "permission to read this file can connect to Tor. If you're going to run" }))
//
//     blockchain.createTransaction(new Transaction(thisNode.address, 'blockbase', 0, JSON.stringify(mySecondRecord), Date.now(), mySecondRecord.uniqueKey));
//
//   //
//   var myThirdRecord = new BlockbaseRecord('test3', 'testTable',thisNode.address,  JSON.stringify({  test: "your script with the same user or permission group as Tor then this is the" }))
//
//     blockchain.createTransaction(new Transaction(thisNode.address, 'blockbase', 0, JSON.stringify(myThirdRecord), Date.now(), myThirdRecord.uniqueKey));
//
//
//   var myFourthRecord = new BlockbaseRecord('test4', 'testTable',thisNode.address,  JSON.stringify({  test: "easiest method of authentication to use." }))
//
//     blockchain.createTransaction(new Transaction(thisNode.address, 'blockbase', 0, encrypt(JSON.stringify(myFourthRecord)), Date.now(), myFourthRecord.uniqueKey));
//
//
//   var myFifthRecord = new BlockbaseRecord('test5', 'testTable',thisNode.address,  JSON.stringify({  test: "Alternatively we can authenticate with a password. To set a password first" }))
//
//     blockchain.createTransaction(new Transaction(thisNode.address, 'blockbase', 0, JSON.stringify(myFifthRecord), Date.now(), myFifthRecord.uniqueKey));
//
//   // log(encrypt(JSON.stringify(myRecord.data)));
//
//   // log(blockchain.pendingTransactions);
//
//   var blockBase = new Blockbase(thisNode.address);
//   var bTables = [];
//   blockBase.buildTables(blockchain.chain, (tables)=>{
//     log(tables)
//     blockBase.tables = tables;
//     // log(blockBase.tables);
//     blockchain.blockbase = blockBase;
//
//   })
//     ioServer.emit('testJSON', blockchain);
//
//
//
// }, 6000)
