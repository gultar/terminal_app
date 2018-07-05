//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////


//Server and p2p network stuff
const express = require('express');
const http = require('http');
const app = express();
const port = process.env.PORT || 8080
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
/*		'http://10.112.106.71:8080', 'http://10.112.106.71:8081', 'http://10.112.106.71:8082', //odesn't work - rasbpi at maria's
    'http://10.242.19.178:8080', 'http://10.242.19.178:8081', 'http://10.242.19.178:8082',
    'http://169.254.105.109:8080','http://169.254.105.109:8081','http://169.254.105.109:8082', //Ad hoc laptop*/
let thisAddress = 'http://'+getIPAddress()+':'+port;
let ipList = [ thisAddress ];
  // = [
  //     'http://'+getIPAddress()+':'+port,
  //     'http://169.254.139.53:8080', 'http://169.254.139.53:8081', 'http://169.254.139.53:8082', //Ad hoc rasbpi
  //     'http://192.168.0.153:8080', 'http://192.168.0.153:8081', 'http://192.168.0.153:8082', //rasbpi at home
  //     'http://192.168.0.154:8080', 'http://192.168.0.154:8081', 'http://192.168.0.154:8082', //laptop at home
	// 		'http://192.168.1.72:8080', 'http://192.168.1.72:8081', 'http://192.168.1.72:8082', //rasbpi at mom's
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

let blockchain;
let dataBuffer;
let privKey;

let thisNode = {
  'type' : 'node',
  'address' : ipList[0], //
  'status':'active',
  'publicID' : '',
  'publicKeyFull' : '',
  'isMining': false //ipList[0]
}


//Container for all connected client tokens
let clients = [];
let endpoints = [];

let peerConnections = []
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
	console.log('\nStarting node at '+thisNode.address+"\n");
	console.log('Node Public Address: '+thisNode.publicID + "\n");
  app.use(express.static(__dirname+'/views'));

	app.on('/', () => {
	  res.send(getIPAddress());
	})


	ioServer.on('connection', (socket) => {

	  socket.on('message', (msg) => {
	    console.log('Client:', msg);
      messageEndpoints(msg);
	  });

		socket.on('error', (exception)=>{
			console.log('Error:',exception);
			socket.destroy();
		})

     //Create validation for connecting nodes
	  socket.on('clientConnect', (token) => {
      clientConnect(socket, token);
    });

    // socket.on('getIpList', (fromSocket) =>{
    //   socket.emit('ipList', ipList);
    // })
    //
    // socket.on('ipList', (ipAddresses)=>{
    //   if(ipAddresses){
    //     if(ipAddresses.length >= ipList.length){
    //       ipList = ipAddresses;
    //     }
    //   }
    // })

    socket.on('sendYourAddress', (token)=>{

      socket.emit('addressReceived', thisNode);

      if(!clients[token.address]){
        try{
          blockchain.addNewToken(token);
          initClientSocket(token.address);
        }catch(err){
          console.log(err);
        }

      }

    })


		socket.on('sync', (hash, token)=>{
      sync(hash, token)
    })



    socket.on('tokenRequest', (peerToken)=>{
      storeToken(peerToken);

      setTimeout(()=>{
        sendToTargetPeer('storeToken', thisNode, peerToken.address);

      }, 2000)

    })

		socket.on('storeToken', (token) =>{
      storeToken(token, true);
      // handleNewClientConnection(token);
    })

    socket.on('triggerClientConnect', (token)=>{
      // console.log('Triggering client connection');
      handleNewClientConnection(token);
    })

    socket.on('getTokenFromClient', (fromNodeToken)=>{
      socket.emit('clientConnect', thisNode);
      // socket.emit('storeToken', thisNode);
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
          console.log('TOKEN HASH ' + token.hash.substr(0, 10)+ ' has started mining');
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

    /*
    * Endpoint Client listeners
    * Could add a small validation to limit to endpoints only
    *
    *
    */

    socket.on('registerEndpoint', (token)=>{
      if(token){
        if(token.type == 'endpoint'){
          endpoints[token.publicID] = socket;
        }
      }
    })

	  socket.on('getBlockchain', (token) =>{
      if(token){
        getBlockchain(socket, token);
      }

	  });

	  socket.on('blockchain', (blockchainReceived) => {
	    blockchain = compareBlockchains(blockchain, blockchainReceived);
	  });

    socket.on('broadcastMessage', (msg) =>{
      sendEventToAllPeers('message', msg);
    })


    socket.on('validateChain', (token) =>{
      if(blockchain != undefined && blockchain instanceof Blockchain){
        console.log('Blockchain valid?',blockchain.isChainValid());
        var validStatus = blockchain.validateAddressToken(thisNode);
        console.log(validStatus);
      }
    })

    socket.on('firstContact', (address)=>{

      if(address){
        socket.emit('message', 'Attempting to reach to '+address);
        if(!clients[address]){
          // initClientSocket(address);
          firstContact(address);
        }


      }
    })

		socket.on('minerStarted', (miningAddress) =>{
			if(miningAddress != undefined){
				currentMiners[miningAddress.hash] = miningAddress;
			}
		})



	  socket.on('close', (token) => {
	    clients[token.address] = null;
	    console.log('Disconnected clients: ', token.address);
			getNumPeers();
	  });



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

const messageEndpoints = (message) =>{

}


// const messageEndpoints = (message) =>{
//   if(message){
//     ioServer.emit('message', message);
//   }
//
// }
/*
  Init blockchain starting from local file
*/
const initBlockchain = (tryOnceAgain=true) => {
  //flag to avoid crashes if a transaction is sent while loading


  console.log('Initiating blockchain');
  dataBuffer = loadBlockchainFromServer()


  setTimeout(() => {

    if(!dataBuffer){
      console.log('No blockchain is available');
      setTimeout(() => {

        if(tryOnceAgain){
          console.log('Trying to load blockchain again');
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


  if(!isPeerConnected(address)){

    var peerSocket = io(address);

    pingConnection(address, peerSocket);

  	peerSocket.on('connect', () =>{

  		console.log('Connected  to ', address);

      setTimeout(()=>{

        peerSocket.emit('triggerClientConnect', thisNode);
        peerSocket.emit('clientConnect', thisNode);
        peerSocket.emit('tokenRequest', thisNode);
        // peerSocket.emit('tokenRequest', thisNode);
        // peerSocket.emit('getTokenFromClient', thisNode);
        peers.push(peerSocket);

      }, 5000)

  	});

    peerSocket.on('clientConnect', (token) => {
      clientConnect(peerSocket, token);
    });

    peerSocket.on('message', (message)=>{
      console.log('Server: ' + message);
      messageEndpoints(message);
    })

    // peerSocket.on('storeToken', (token) =>{ storeToken(token)	})

  	peerSocket.on('disconnect', () =>{
  		console.log('connection with peer dropped');
  		peers.splice(peers.indexOf(peerSocket), 1);
      console.log(peerSocket.io.uri);

  		peerSocket.destroy()
  	})
  }else{
    console.log('Peer is already connected');
    return false;
  }


}

/*
  Open all client socket connection to peers
*/
const connectToPeerNetwork = () => {
  console.log('Connecting to all known peers...');
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != thisNode.address){

			var address = ipList[i];
			initClientSocket(address);

    }
  }

}

const pingConnection = (address, socket) =>{
  setInterval(()=>{
    if(address && socket){

        if(isPeerConnected(address)){
          console.log('Ping '+ socket.io.uri)
          console.log(clients);
            socket.emit('triggerClientConnect', thisNode);
            socket.emit('message', 'this is a message from a peer connection')
        }
    }
  }, 15000)
}

/*
  This is the socket listener function for when a peer
  Connects to this node as a client
*/
//
const handleNewClientConnection = (token) =>{
  if(token){
    if(!isPeerConnected(token.address)){
      initClientSocket(token.address);
    }
  }else{
    console.log('Received empty token');
  }
}

const clientConnect = (socket, token) =>{

  if(token != undefined){



    if(token.type == 'endpoint'){
      console.log('Endpoint client connected to this node');
      console.log('Hash: '+ token.publicID);
      endpoints[token.publicID] = {
        socket:socket,
        token:token
      };

    }else{
      console.log('Connected node at address : ', token.address);
      console.log('Public ID : ', token.publicID);
      clients[token.address] = token;
      // storeToken(token);

    }
    console.log('Connected at : '+ displayTime() +"\n");
    socket.emit('message', 'You are now connected to ' + thisNode.address);

    if(!isPeerConnected(token.address)){
      initClientSocket(token.address);
    }

    getNumPeers();
  }
}

const firstContact = (address) =>{
  if(address){
    try{
      var tempSocket = io(address);

      messageEndpoints('Establishing link between this node and + '+address);
      console.log('Establishing link between this node and + '+address);

      tempSocket.emit('sendYourAddress', thisNode);

      tempSocket.on('addressReceived', (peerToken)=>{
        messageEndpoints('Peer sent their token:');
        messageEndpoints(peerToken);
        if(ipList.indexOf(peerToken.address) == -1){
          ipList.push(peerToken.address);
          storeToken(peerToken);
          // blockchain.addNewToken(peerToken);
          // saveBlockchain(blockchain);
          initClientSocket(peerToken.address);

        }else{

          handleNewClientConnection(peerToken.address);
          tempSocket.destroy();
        }

      })
    }catch(err){
      console.log(err);
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

  console.log(ipList);
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
			console.log('Reading blockchain.json file...');

			rstream.on('error', (err) =>{
				console.log(err);
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
            console.log('Blockchain successfully loaded from file and validated')
          }catch(err){
            console.error(err);
          }



						//validateBlockchain(dataBuffer); --- To be created

						// blockchain = compareBlockchains(blockchain, dataBuffer);

						return dataBuffer;

				}else{
					return false;
				}


			});

		}else {
			console.log('Generating new blockchain')
				let newBlockchain = new Blockchain();
				// newBlockchain = seedNodeList(newBlockchain, thisNode);
				// seedNodeList(newBlockchain); //------------------------Have to find a better way to create nodes
				blockchain = newBlockchain;
				saveBlockchain(newBlockchain);
				console.log("file does not exist")

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

					// if(blockchain != undefined){
					// 	longestBlockchain = compareBlockchains(blockchain, blockchainReceived);
					// }else{
					// 	longestBlockchain = blockchainReceived;
					// }

					let json = JSON.stringify(blockchainReceived);

					if(json != undefined){
						console.log('Writing to blockchain file...');

						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);
						wstream.end();

					}

					// });
				}

      	} else {
          console.log("Creating new Blockchain file and saving to it")
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
        console.log('===============STARTED MINING!!!!!')
        sendEventToAllPeers('peerBuildingBlock', thisNode);
      }else if(!isMiningBlock && finishedBlock){
        console.log('+++++++++++++++FINISHED MINING!!!!!');
        // sendEventToAllPeers('peerFinishedBlock', thisNode);
      }

    });

		if(miningSuccess){

			console.log('\nBalance of '+miningAddr.address+' is '+ blockchain.getBalanceOfAddress(miningAddr));

			var message =  'A new block has been mined by ' + miningAddr.publicID + '. Sending new block';
			var newBlock = blockchain.getLatestBlock();
			ioServer.emit('miningApproved', blockchain);
			ioServer.emit('message', message);
			sendEventToAllPeers('message', message);
			console.log(message);
			setTimeout(()=>{
				// console.log('Sending:', newBlock)
				sendEventToAllPeers('newBlock', newBlock);
			}, 3000)

			return true;

		}

		return false;

	}else{
		console.log('Invalid mining address');
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
  if(token && blockchain && blockchain instanceof Blockchain){

    if(blockchain.nodeTokens[token.publicID] != token){

      console.log('Received a node token from ', token.address);
      blockchain.addNewToken(token);
      saveBlockchain(blockchain);

    }
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
      console.log('Peer '+fromNodeToken.address+' has sent a new transaction.');
      console.log(transaction);

      messageEndpoints('Peer '+fromNodeToken.address+' has sent a new transaction.');
      messageEndpoints(transaction);
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
            transaction.fromAddress,
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
            messageEndpoints('Received new transaction:');
            messageEndpoints(transactionObj);

            transactionObj = null;
          }, 1500)

        }
      }else{
        console.log('ERROR: Endpoint token is undefined')
      }
    }else{
      console.log('ERROR: Transaction is undefined')
    }
  }else{
    console.log('Node is unavailable for receiving the transaction');
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
      messageEndpoints('Number of other available peers on network: '+peers.length);
			console.log('Number of other available peers on network:',peers.length);
			return peers.length;
		}

	}
}




//self describing
const instanciateBlockchain = (blockchain) =>{
	return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks, blockchain.publicKeys);
}

/*
  To run a proper transaction validation, one must look back at all the previous transactions that have been made by
  emitting peer every time this is checked, to avoid double spending. An initial coin distribution is made once the genesis
  block has been made. This needs some work since it is easy to send a false transaction and accumulate credits
*/
// const validateTransaction = (transaction, token) =>{
// 	if(transaction != undefined && token != undefined){
//
// 		if(blockchain != undefined && blockchain instanceof Blockchain){
//
// 			var balanceOfSendingAddr = blockchain.getBalanceOfAddress(token) + blockchain.checkFundsThroughPendingTransactions(token);
//
// 			if(!balanceOfSendingAddr){
// 					console.log('Cannot verify balance of undefined address token');
// 			}else{
//
// 				if(balanceOfSendingAddr >= transaction.amount){
// 					console.log('Transaction validated successfully');
//           return true;
//
// 				}else if(transaction.type === 'query'){
// 					//handle blockbase queries
// 				}else{
// 					console.log('Address '+token.address+' does not have sufficient funds to complete transaction');
//           return false
// 				}
//
// 			}
//
//
// 		}else{
// 			console.log("ERROR: Can't validate. Blockchain is undefined or not instanciated. Resync your chain");
//       return false
// 		}
//
// 	}else{
// 		console.log('ERROR: Either the transaction or the token sent is undefined');
// 		return false;
// 	}
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
        // console.log(msg);
        sendEventToAllPeers('message', msg);
        sendToTargetPeer('blockchain', blockchain, token.address);
        ioServer.emit('blockchain', blockchain);
      }else{
        console.log('Current blockchain is invalid. Flushing local chain and requesting a valid one');
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
    // console.log(newBlock);
    if(newBlock.length >= 1 && Array.isArray(newBlock)){
      for(var i=0; i<newBlock.length; i++){

          hasSynced = handleNewBlock(newBlock[i]);

      }

    }else if(newBlock !== undefined){
      hasSynced = handleNewBlock(newBlock)
    }

  }else{
    console.log('New block received or blockchain is undefined');
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
		// console.log('Received block:', newBlock.hash);

		var isBlockSynced = blockchain.syncBlock(newBlock);
		if(isBlockSynced){

			return true;
		}else if(typeof isBlockSynced === 'number'){
			//Start syncing from the index returned by syncBlock;
			// sendEventToAllPeers('getBlockchain', thisNode); //Use this meanwhile
			console.log('Block is already present');
			return false;
		}else{
			// sendEventToAllPeers('getBlockchain', thisNode);
			// console.log('Block refused');
			return false;
		}
	}else{
		console.log('Block handler error: New block is undefined');
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
			console.log('blockchain is not loaded yet. Trying again');
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
    console.log('Miner is not active');
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
  var d = new Date(),	// Convert the passed timestamp to milliseconds
    year = d.getFullYear(),
    mnth = d.getMonth(),	// Months are zero based. Add leading 0.
    day = d.getDay(),			// Add leading 0.
    hrs = d.getHours(),
    min = d.getMinutes(),
    sec = d.getSeconds(),		// Add leading 0.
    ampm = 'AM';

    return hrs+":"+min+":"+sec;
}



initBlockchain();
setTimeout(()=>{
  startServer()
	connectToPeerNetwork();
	chainUpdater();
}, 5000)

getKeyPair((keys)=>{
  if(keys){

    /*
    Skipping privateKey. Only used when signing transactions
    */
    thisNode.publicKeyFull = keys.publicKey;
    thisNode.publicID = sha256(keys.publicKey);

  }

})


setTimeout(()=>{

  // var godTx = new Transaction('genesis', '1f739a220d91452ff5b4cc740cfb1f28cd4d8dce419c7a222640879128663b74', 100, { coinbase:'port8080'}, null, null, 'coinbase');
  // blockchain.createTransaction(godTx);

}, 20000)
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
//   // console.log(encrypt(JSON.stringify(myRecord.data)));
//
//   // console.log(blockchain.pendingTransactions);
//
//   var blockBase = new Blockbase(thisNode.address);
//   var bTables = [];
//   blockBase.buildTables(blockchain.chain, (tables)=>{
//     console.log(tables)
//     blockBase.tables = tables;
//     // console.log(blockBase.tables);
//     blockchain.blockbase = blockBase;
//
//   })
//     ioServer.emit('testJSON', blockchain);
//
//
//
// }, 6000)
