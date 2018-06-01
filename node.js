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
class Node{
	constructor(blockchain=new Blockchain()){
    this.blockchain = blockchain;
    this.token = {
      'type' : 'node',
      'address' : ipList[0],
      'hashSignature' : sha256(ipList[0], Date.now()) };
    this.peers = [];
    this.nodeTokens = [];

	}

  startServer(){
    	console.log('Starting server at '+this.token.address+'/');
    	console.log('Node address:',this.token.address);
    	console.log('Node Hash:', this.token.hashSignature);
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
          this.clientConnect(socket, token);
        });


    		socket.on('test', (hash)=>{

    		})

    		socket.on('sync', (hash, token)=>{
          this.sync(hash, token)
        })

    		socket.on('validateChain', (token) =>{
    				console.log('Blockchain valid?',this.blockchain.isChainValid());
    		})

        socket.on('tokenRequest', (peerToken)=>{
          this.storeToken(peerToken);
          this.sendToTargetPeer('storeToken', this.token, peerToken.address);
        })

    		socket.on('getWholeCopy', (token)=>{
    			this.sendEventToAllPeers('getBlockchain', thisNode);
    		})

    		socket.on('storeToken', (token) =>{ this.storeToken(token)	})

    		socket.on('distributedTransaction', (transaction, fromNodeToken) => {
          console.log('from:', fromNodeToken);
          this.distributeTransaction(socket, transaction, fromNodeToken);
    		})

    	  socket.on('transaction', (transaction, fromNodeToken) => {
          this.receiveTransactionFromClient(socket, transaction, fromNodeToken);
    	  });

    	  socket.on('miningRequest', (miningAddrToken) =>{
          attemptMining(miningAddrToken);
    	  });


    		socket.on('newBlock', (newBlock) =>{
          this.receiveNewBlock(newBlock);
    		});

    	  socket.on('getBlockchain', (token) =>{
          this.getBlockchain(socket, token);
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
    			this.sendEventToAllPeers('message', msg);
    		})


    	  socket.on('close', (token) => {
    	    clients[token.address] = null;
    	    console.log('Disconnected clients: ', token.address);
    			this.getNumPeers();
    	  });


    	});

  }

	createBlockchainInstance(blockchain){
    if(blockchain !== undefined){
      return new Blockchain(blockchain.chain, blockchain.pendingTransactions, blockchain.nodeTokens, blockchain.ipAddresses, blockchain.orphanedBlocks);
    }else{
      console.log(blockchain);
    }
	}

	initChain(tryOnceAgain=true){
		console.log('Initiating blockchain');
	  dataBuffer = this.loadBlockchain()


	  setTimeout(() => {

	    if(!dataBuffer){
	      console.log('No blockchain is available');
	      setTimeout(() => {

	        if(tryOnceAgain){
	          console.log('Trying to load blockchain again');
	          return this.initChain(false);
	        }

	      })

	    }else{
	      this.blockchain = this.createBlockchainInstance(dataBuffer);
				this.blockchain.addMiningAddress(this.token);
				this.blockchain.nodeTokens[thisNode.address] = this.token;
	    }


	  }, 4000);
	}

	loadBlockchain(){
      var that = this;
		  //flag to avoid crashes if a transaction is sent while loading
			fs.exists('./blockchain.json', function(exists){
				if(exists){
					var data = '';
					let blockchainDataFromFile;
					var rstream = fs.createReadStream('./blockchain.json');
					console.log('Reading blockchain.json file...');

					rstream.on('error', (err) =>{
						console.log(err);
						return err;
					})

					rstream.on('data', (chunk) => {
						data += chunk;
					});

					rstream.on('close', () =>{  // done

						if(data !== undefined && data != null && data != 'undefined:1'){
              // console.log(data);
								blockchainDataFromFile = JSON.parse(data);

								dataBuffer = that.createBlockchainInstance(blockchainDataFromFile);

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
						that.blockchain = newBlockchain;
						that.save(newBlockchain);
						console.log("file does not exist")

						return false;
				}

			});


	}

  save(blockchainReceived){
    var that = this;
    fs.exists('./blockchain.json', function(exists){
        if(exists){
          var longestBlockchain;

          if(blockchainReceived != undefined){

            if(!(blockchainReceived instanceof Blockchain)){
              blockchainReceived = that.createBlockchainInstance(blockchainReceived);
            }

            longestBlockchain = compareBlockchains(that.blockchain, blockchainReceived);

            let json = JSON.stringify(longestBlockchain);

            if(json != undefined){
              console.log('Writing to blockchain file...');

              var wstream = fs.createWriteStream('./blockchain.json');

              wstream.write(json);

              wstream.end();

            }

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

  storeToken(token){
    if(token != undefined){
      console.log('Received a node token from ', token.address);
      this.nodeTokens[token.address] = token;
      this.blockchain.addMiningAddress(token);
    }
  }

  initClientSocket(address){
    var peerSocket = io(address, {'forceNew': true, 'timeout':5000, 'connect timeout': 5000});


  	peerSocket.emit('client-connect', this.token);
  	peerSocket.emit('tokenRequest', this.token);

  	peerSocket.emit('message', 'You are connected to '+this.token.address);


  	peerSocket.on('connect', () =>{

  		// peerSocket.emit('getBlockchain', thisNode);
  		// peerSocket.emit('blockchain', blockchain);
  		console.log('Connected to ', address);
  		this.peers.push(peerSocket);
  	});

  	peerSocket.on('disconnect', () =>{
  		console.log('connection with peer dropped');
  		this.peers.splice(this.peers.indexOf(peerSocket), 1);
  		peerSocket.emit('close', this.token);
  	})
  }

  connectToPeerNetwork(){
    let peerConnections = [];

    for(var i=0; i < ipList.length; i++){

      if(ipList[i] != this.token.address){

  			var address = ipList[i];
  			this.initClientSocket(address);

      }
    }

  };

  clientConnect(socket, token){
    if(token != undefined){
      clients[token.address] = token;

      console.log('Connected client hash: '+ token.hashSignature.substr(0, 10) + '...');
      console.log('At address:', token.address);

      socket.emit('message', 'You are now connected to ' + thisNode.address);

      this.getNumPeers();
    }else{
      console.log('Connection error')
    }
  }

  sendToTargetPeer(eventType, data, address){
    for(var peer of this.peers){
  		var peerAddress = 'http://'+peer.io.opts.hostname +':'+ peer.io.opts.port

  		if(peerAddress === address){
  			peer.emit(eventType, data);
  		}
  	}
  }

  sendEventToAllPeers(eventType, data, moreData=false ){
    if(this.peers.length > 0){

      for(var i=0; i<this.peers.length; i++){
        if(!moreData){
          this.peers[i].emit(eventType, data);
        }else{
          this.peers[i].emit(eventType, data, moreData);
        }
      }
    }

  }

  getNumPeers(){
    if(this.peers != undefined){
  		if(this.peers.length > 0){
  			console.log('Number of other available peers on network:',this.peers.length);
  			return this.peers.length;
  		}

  	}
  }

  getBlockchain(socket, token){
    var validityStatus;

    //Query all nodes for blockchain
    if(this.blockchain != undefined && token != undefined){

      if(!(this.blockchain instanceof Blockchain)){
        this.blockchain = this.createBlockchainInstance(this.blockchain);
      }
        validityStatus = this.blockchain.isChainValid();

        if(validityStatus === true){
          var msg = token.address + ' has requested a copy of the blockchain!';
          // console.log(msg);
          if(token.type === 'node'){
            this.sendEventToAllPeers('message', msg);
            this.sendToTargetPeer('blockchain', this.blockchain, token.address);
          }else if(token.type === 'endpoint'){
            ioServer.emit('blockchain', this.blockchain);
          }


        }else{
          console.log('Current blockchain is invalid. Flushing local chain and requesting a valid one');
          this.blockchain = new Blockchain(); //Need to find a way to truncate invalid part of chain and sync valid blocks
          this.sendEventToAllPeers('getBlockchain', this.token);
        }

    }else{
      socket.emit('message', 'Blockchain is unavailable on node. It might be loading or saving.');
    }

  }

  sync(hash, token){
    if(hash != undefined && token != undefined){
        var blocks = this.blockchain.getBlocksFromHash(hash);

        if(blocks){
          this.sendToTargetPeer('newBlock', blocks, token.address);

        }else if(!blocks){

  			}

    }
  }

  /*
    Listener funcction that catches a block or a group of blocks, validates everything and
    appends it to current chain. With every single block, there needs to be thorough validation,
    on every single transaction
  */
  receiveNewBlock(newBlock){
    var hasSynced = false;
    if(newBlock != undefined){

      if(newBlock.length > 1 && Array.isArray(newBlock)){
        for(var i=0; i<newBlock.length; i++){

            hasSynced = this.handleNewBlock(newBlock[i]);

        }

      }else if(newBlock !== undefined){
        hasSynced = this.handleNewBlock(newBlock)
      }

    }else{
      console.log('New block received or blockchain is undefined');
    }

    if(hasSynced){
      this.save(this.blockchain);
    }
  }

  handleNewBlock(newBlock){
  	if(newBlock != undefined && newBlock != null && typeof newBlock == 'object'){
  		// console.log('Received block:', newBlock.hash);

  		var isBlockSynced = this.blockchain.syncBlock(newBlock);
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
  chainUpdater(){
  	// sendEventToAllPeers('getBlockchain', thisNode);
  	setInterval(() =>{

        var latestBlock = this.blockchain.getLatestBlock();
  			console.log('Sending hash:', latestBlock.hash);
      	this.sendEventToAllPeers('sync', latestBlock.hash, this.token);

  	}, 30000)

  }




  /*
    Transactions
  */
  distributeTransaction(socket, transaction, fromNodeToken){
    ///////////////////////////////////////////////////////////
    //Need to validate transaction everytime it is received
    ///////////////////////////////////////////////////////////

      if(transaction != undefined && fromNodeToken != undefined){
        console.log('Peer '+fromNodeToken.address+' has sent a new transaction.');
        console.log(transaction);
        var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);

        this.blockchain.createTransaction(transactionObj);
      }

  }

  receiveTransactionFromClient(socket, transaction, fromNodeToken){
    ///////////////////////////////////////////////////////////
    //Need to validate transaction before adding to blockchain
    ///////////////////////////////////////////////////////////

      if(transaction != undefined && fromNodeToken != undefined){
        if(fromNodeToken.address != this.token.address){
          var transactionObj = new Transaction(transaction.fromAddress, transaction.toAddress, transaction.amount, transaction.data);
          //Need to validate transact before broadcasting it
          var transactIsValid = this.blockchain.validateTransaction(transactionObj, fromNodeToken);
          console.log(transactIsValid);
          this.blockchain.createTransaction(transactionObj);
          this.sendEventToAllPeers('distributedTransaction', transactionObj, fromNodeToken);
          console.log('Received new transaction:', transactionObj);
          transactionObj = null;
        }

      }else{
        socket.emit('message', 'ERROR: Either your transaction or your token is unreadable. Try sending again.')
      }

  }

}

var myNode = new Node();

myNode.initChain();
var blockc = myNode.blockchain;
console.log(blockc)
setTimeout(()=>{ //always wait for readstream to close before saving or vice versa
  // myNode.save(blockc);
  myNode.startServer();
  myNode.connectToPeerNetwork();
  myNode.chainUpdater();
}, 3000)
