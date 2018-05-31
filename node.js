//////////////////////////////////////////////////////////////
/////////////////////////NODE SCRIPT /////////////////////////
//////////////////////////////////////////////////////////////


//Server and p2p network stuff
const express = require('express');
const http = require('http');
const app = express();
const port = 8080
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
const { ipList } = require('./backend/iplist.js')
/*
  Blockchain classes and tools
*/
const { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord } = require('./backend/blockchain');
const merkle = require('merkle');
const sha256 = require('./backend/sha256');
const { encrypt, decrypt } = require('./backend/encryption.js')

let blockchain;
let dataBuffer;

let thisNode = {
  'type' : 'node',
  'address' : ipList[0],
  'hashSignature' : sha256(ipList[0], Date.now())
}


//Container for all connected client tokens
let clients = [];

//Container for all peer socket connections
let peers = [];

//Maybe implement a turned based mining system. It might be too cumbersome...
let currentMiners = [];
let sendTrials = 0;

/*
  Starts the websocket server, listens for inbound connections

*/
const startServer = () =>{
	console.log('Starting server at '+thisNode.address+'/');
	console.log('Node address:',thisNode.address);
	console.log('Node Hash:', thisNode.hashSignature);
	app.use(express.static(__dirname+'/views'));

	app.on('/', () => {
	  res.send(getIPAddress());
	})



	ioServer.on('connection', (socket) => {

	  socket.on('message', (msg) => {
	    console.log('Client:', msg);
	  });

		socket.on('error', (exception)=>{
			console.log('Error:',exception);
			socket.destroy();
		})

     //Create validation for connecting nodes
	  socket.on('client-connect', (token) => {
      clientConnect(socket, token);
    });


		socket.on('test', (hash)=>{

		})

		socket.on('sync', (hash, token)=>{
      sync(token, token)
    })

		socket.on('validateChain', (token) =>{
			if(blockchain != undefined){
				console.log('Blockchain valid?',blockchain.isChainValid());
			}
		})

		socket.on('getWholeCopy', (token)=>{
			sendEventToAllPeers('getBlockchain', thisNode);
		})

		socket.on('storeToken', (token) =>{ storeToken(token)	})

		socket.on('distributedTransaction', (transaction, fromNodeToken) => {
      distributeTransaction(socket, transaction, fromNodeToken);
		})

	  socket.on('transaction', (transaction, fromNodeToken) => {
      receiveTransactionFromClient(socket, transaction, fromNodeToken);
	  });

	  socket.on('miningRequest', (miningAddrToken) =>{
      attemptMining(miningAddrToken);
	  });


		socket.on('newBlock', (newBlock) =>{
      receiveNewBlock(newBlock);
		});

	  socket.on('getBlockchain', (token) =>{
      getBlockchain(socket, token);
	  });

	  socket.on('blockchain', (blockchainReceived) => {
	    blockchain = compareBlockchains(blockchain, blockchainReceived);
	  })

		socket.on('minerStarted', (miningAddress) =>{
			if(miningAddress != undefined){
				currentMiners[miningAddress.hash] = miningAddress;
			}
		})

		socket.on('disconnect', () =>{

		})

		socket.on('broadcastMessage', (msg) =>{
			sendEventToAllPeers('message', msg);
		})


	  socket.on('close', (token) => {
	    clients[token.address] = null;
	    console.log('Disconnected clients: ', token.address);
			getNumPeers();
	  });


	});

}

/*
  Broadcasts a defined event, need to find a way to handle more than two parameters

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
			blockchain.addMiningAddress(thisNode);
			blockchain.nodeTokens[thisNode.address] = thisNode;
    }


  }, 4000);


};

/*
  Defines a client socket connection
*/
const initClientSocket = (address) =>{

	var peerSocket = io(address, {'forceNew': true});

	peerSocket.emit('client-connect', thisNode);
	peerSocket.emit('storeToken', thisNode);

	peerSocket.emit('message', 'You are connected to '+thisNode.address);


	peerSocket.on('connect', () =>{

		// peerSocket.emit('getBlockchain', thisNode);
		// peerSocket.emit('blockchain', blockchain);
		console.log('Connected to ', address);
		peers.push(peerSocket);
	});

	peerSocket.on('disconnect', () =>{
		console.log('connection with peer dropped');
		peers.splice(peers.indexOf(peerSocket), 1);
		peerSocket.emit('close', thisNode);
	})

}

/*
  Open all client socket connection to peers
*/
const connectToPeerNetwork = () => {
  let peerConnections = [];

  for(var i=0; i < ipList.length; i++){

    if(ipList[i] != thisNode.address){

			var address = ipList[i];
			initClientSocket(address);

    }
  }

};

/*
  Searches for instanciated miningAddress in blockchain, if not, creates it
*/
const getMiningAddress = (addressToken) => {
  if(blockchain !== undefined){
		if(blockchain.miningAddresses[addressToken.hashSignature] && blockchain.miningAddresses[addressToken.hashSignature] instanceof BlockchainAddress){
			return blockchain.miningAddresses[addressToken.hashSignature];
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
						blockchainDataFromFile = JSON.parse(data);
						dataBuffer = instanciateBlockchain(blockchainDataFromFile);

						//validateBlockchain(dataBuffer); --- To be created
						console.log('Blockchain successfully loaded from file and validated')
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
						blockchainReceived = new Blockchain(
							blockchainReceived.chain,
							blockchainReceived.pendingTransactions,
							blockchainReceived.nodeAddresses,
							blockchainReceived.ipAddress,
							blockchainReceived.orphanedBlocks
						)
					}

					if(blockchain != undefined){
						longestBlockchain = compareBlockchains(blockchain, blockchainReceived);
					}else{
						longestBlockchain = blockchainReceived;
					}

					let json = JSON.stringify(longestBlockchain);

					if(json != undefined){
						console.log('Writing to blockchain file...');

						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);


					}

					// });
				}

      	} else {
          console.log("Creating new Blockchain file and saving to it")
          let json = JSON.stringify(blockchainReceived);
          if(json != undefined){

						var wstream = fs.createWriteStream('blockchain.json');

						wstream.write(json);
          }

			}
      });
}

/*
  Ran once, this attempts to mine all pending transactions if their number
  is at least equal to the blocksize
*/
const startMining = (miningAddrToken) => {

  miningAddr = blockchain.getMiningAddress(miningAddrToken);

	if(miningAddr){
		sendEventToAllPeers('message', miningAddrToken.address+ ' has started mining.');
		sendEventToAllPeers('minerStarted', miningAddr);

		miningSuccess = blockchain.minePendingTransactions(miningAddr);

		if(miningSuccess){

			console.log('\nBalance of '+miningAddr.address+' is '+ miningAddr.getBalance());

			var message =  'A new block has been mined by ' + miningAddr.hashSignature + '. Sending new block';
			var newBlock = blockchain.getLatestBlock();
			ioServer.emit('miningApproved', blockchain);
			ioServer.emit('message', message);
			sendEventToAllPeers('message', message);
			console.log(message);
			setTimeout(()=>{
				console.log('Sending:', newBlock)
				sendEventToAllPeers('newBlock', newBlock);
			}, 3000)

			return true;

		}

		return false;

	}else{
		console.log('Invalid mining address');
	}



}

/*
  Used to revalidate block hashes
*/
const calculateBlockHash = (block) =>{
	return sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
}

/*
  This the socket listener function for when a peer
  Connects to this node as a client
*/
const clientConnect = (socket, token) =>{
  if(token != undefined){
    clients[token.address] = token;

    // socket.id = token.address;

    console.log('Connected client hash: '+ token.hashSignature.substr(0, 10) + '...');
    console.log('At address:', token.address);

    socket.emit('message', 'You are now connected to ' + thisNode.address);

    getNumPeers();
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
        sendToTargetPeer('newBlock', blocks, token.address);

      }else{
        sendEventToAllPeers('message', 'No block found with received hash', token.address);

      }

  }
}

/*
  This is a listener function that catches, stores and instanciates
  into BlockchainAddresses all node tokens received
*/
const storeToken = (token) =>{
  if(token != undefined && blockchain != undefined && blockchain instanceof Blockchain){
    console.log('Received a node token from ', token.address);
    blockchain.nodeTokens[token.address] = token;
    blockchain.addMiningAddress(token);
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
  if(blockchain != undefined){
    if(transaction != undefined && fromNodeToken != undefined){
      console.log('Peer '+fromNodeToken.address+' has sent a new transaction.');
      console.log(transaction);
      var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);

      blockchain.createTransaction(transactionObj);
    }
  }
}

/*
  This is a listener function that catches a transaction emitted from endpoint client,
  validates it and distributes it to all peers
*/
const receiveTransactionFromClient = (socket, transaction, fromNodeToken) =>{
  ///////////////////////////////////////////////////////////
  //Need to validate transaction before adding to blockchain
  ///////////////////////////////////////////////////////////
  if(blockchain != undefined){
    if(transaction != undefined && fromNodeToken != undefined){
      if(fromNodeToken.address != thisNode.address){
        var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);
        //Need to validate transact before broadcasting it
        var transactIsValid = validateTransaction(transactionObj, fromNodeToken);

        blockchain.createTransaction(transactionObj);
        sendEventToAllPeers('distributedTransaction', transactionObj, fromNodeToken);
        console.log('Received new transaction:', transactionObj);
        transactionObj = null;
      }

    }else{
      socket.emit('message', 'ERROR: Either your transaction or your token is unreadable. Try again.')
    }
  }else{
    socket.emit('message', 'Node is unavailable for receiving the transaction');
  }
}

/*
  Creates an chain of block signatures, that is, the hash of the block and the previous hash only.
*/
const buildChainHashes = () =>{
	var hashSignaturesOnChain = []

	var chain = blockchain.chain;


	for(var i=0; i<chain.length; i++){
		hashSignaturesOnChain.push({
			hash:chain[i].hash,
			previousHash:chain[i].previousHash,
			index:i
		})
	}

	return hashSignaturesOnChain;
}

/*
  Logs the number of other active peers on network
*/
const getNumPeers = () =>{
	if(peers != undefined){
		if(peers.length > 0){
			console.log('Number of other available peers on network:',peers.length);
			return peers.length;
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

//self describing
const instanciateBlockchain = (blockchain) =>{
	return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
}

/*
  To run a proper transaction validation, one must look back at all the previous transactions that have been made by
  emitting peer every time this is checked, to avoid double spending. An initial coin distribution is made once the genesis
  block has been made. This needs some work since it is easy to send a false transaction and accumulate credits
*/
const validateTransaction = (transaction, token) =>{
	if(transaction != undefined && token != undefined){

		if(blockchain != undefined && blockchain instanceof Blockchain){

			var balanceOfSendingAddr = blockchain.getBalanceOfAddress(token) + blockchain.checkFundsThroughPendingTransactions(token);
			if(!balanceOfSendingAddr){
					console.log('Cannot verify balance of undefined address token');
			}else{
				if(balanceOfSendingAddr >= transaction.amount){
					console.log('Transaction validated successfully');
				}else if(transaction.type === 'query'){
					//handle blockbase queries
				}else{
					console.log('Address '+token.address+' does not have sufficient funds to complete transaction');
				}
			}


		}else{
			console.log("ERROR: Can't validate. Blockchain is undefined or not instanciated. Resync your chain");
		}

	}else{
		console.log('ERROR: Either the transaction or the token sent is undefined');
		return false;
	}

}

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

    if(newBlock.length > 1 && Array.isArray(newBlock)){
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
			ioServer.emit('blockchain', blockchain);
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
			// syncBlockchain();
      var latestBlock = blockchain.getLatestBlock();
    	sendEventToAllPeers('sync', latestBlock.hash, thisNode);
			// sendEventToAllPeers('getBlockchain', thisNode);
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
const attemptMining = (miningAddrToken) =>{
  ///////////////////////////////////////////////////////////
  //need to validate miningAddr before allowing mining action;
  ///////////////////////////////////////////////////////////
  if(blockchain != undefined){

    var hasMinedABlock = startMining(miningAddrToken);

    if(hasMinedABlock){
      saveBlockchain(blockchain);
    }


  }
}

//In case of CLI menu, automatic miner loop
const mine = (token) =>{
	setInterval(()=>{
		if(blockchain != undefined){

			var hasMinedABlock = startMining(token);

			if(hasMinedABlock){
				saveBlockchain(blockchain);
			}


		}
	}, 10000)
}


startServer()
initBlockchain();
setTimeout(()=>{
	connectToPeerNetwork();
	chainUpdater();
}, 2500)


// class Node{
// 	constructor(server, blockchain=new Blockchain()){
//     this.server = server;
//     this.blockchain = blockchain;
//     this.token = {
//       'type' : 'node',
//       'address' : ipList[0],
//       'hashSignature' : sha256(ipList[0], Date.now()) };
//
//
// 	}
//
// }