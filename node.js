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
    			sendEventToAllPeers('message', msg);
    		})


    	  socket.on('close', (token) => {
    	    clients[token.address] = null;
    	    console.log('Disconnected clients: ', token.address);
    			getNumPeers();
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
      this.addMiningAddress(token);
    }
  }

  initClientSocket(address){
    var peerSocket = io(address, {'forceNew': true});

  	peerSocket.emit('client-connect', thisNode);
  	peerSocket.emit('storeToken', thisNode);

  	peerSocket.emit('message', 'You are connected to '+thisNode.address);


  	peerSocket.on('connect', () =>{

  		// peerSocket.emit('getBlockchain', thisNode);
  		// peerSocket.emit('blockchain', blockchain);
  		console.log('Connected to ', address);
  		this.peers.push(peerSocket);
  	});

  	peerSocket.on('disconnect', () =>{
  		console.log('connection with peer dropped');
  		this.peers.splice(this.peers.indexOf(peerSocket), 1);
  		peerSocket.emit('close', thisNode);
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

}

var myNode = new Node();

myNode.initChain();
var blockc = myNode.blockchain;
console.log(blockc)
setTimeout(()=>{ //always wait for readstream to close before saving or vice versa
  // myNode.save(blockc);
  myNode.startServer();
  myNode.connectToPeerNetwork();
}, 3000)
