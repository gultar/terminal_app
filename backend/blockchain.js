//Modules
const sha256 = require('./sha256');
const merkle = require('merkle');
const cryptico = require('cryptico');
var crypto = require('crypto');
var fs = require('fs');
const { exec } = require('child_process');



/******************************************/
/***********Blockchain classes*************/
/******************************************/

///////////////Transaction//////////////////
//A transaction is done if there is a
//change of data on the blockchain


class Transaction{
  constructor(fromAddress, toAddress, amount, data='', timestamp='', hash='', type=''){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
    this.timestamp = (timestamp != undefined? timestamp : Date.now());
    this.hash = (hash? hash : sha256(this.fromAddress+ this.toAddress+ this.amount+ this.data+ this.timestamp));
    this.type = type;
    this.signature;
  }

  sign(){
    fs.exists('private.pem', (exists)=>{
      if(exists){
        try{

          var pem = fs.readFileSync('private.pem');
          var key = pem.toString('ascii');
          var sign = crypto.createSign('RSA-SHA256');
          sign.update(this.hash);  // data from your file would go here
          this.signature = sign.sign(key, 'hex');


        }catch(err){
          console.log(err);
        }

      }else{

      }
    })

  }

  verify(publicKey){
    if(publicKey){
      try{

        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(this.hash);

        return verify.verify(publicKey, this.signature, 'hex');

      }catch(err){
        console.log(err);
        return false;
      }
    }else{
      return false;
    }


  }

  byteCount(s) {
    return encodeURI(s).split(/%..|./).length - 1;
  }

}

//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions, previousHash='', blockNumber=0){
    this.blockNumber = blockNumber;
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.nonce = 0;
    this.valid = true;
    this.minedBy = '';
  }

  calculateHash(){
    return sha256(this.previousHash + this.timestamp + this.createMerkleRoot(this.transactions) + this.nonce).toString();
  }

  /*Proof of Work*/
  mineBlock(difficulty){
    while(this.hash.substring(0, difficulty) !== Array(difficulty+1).join("0")){
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log("Block mined: " + this.hash);

  }

  createMerkleRoot(transactions){

  	if(transactions != undefined){
  		var transactionHashes = Object.keys(transactions);


  		let merkleRoot = merkle('sha256').sync(transactionHashes);
      return merkleRoot.root();
  	}

  }

}


/////////////////////Blockchain///////////////////////
class Blockchain{

  constructor(chain=false, pendingTransactions=false, nodeTokens={}, ipAddresses=[], orphanedBlocks=[], publicKeys=[], unvalidatedTransactions=[]){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = 4;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: {});
    this.miningReward = 50;
    this.nodeTokens = nodeTokens; //Stores all the node addresses of the P2P network
    this.ipAddresses = ipAddresses;
    this.miningAddresses = {};
    this.blockSize = 10; //Minimum Number of transactions per block
    this.orphanedBlocks = orphanedBlocks;
    this.blockbase = '';
    this.unvalidatedTransactions = unvalidatedTransactions;

  }

  createGenesisBlock(){
    return new Block("01/01/2018", "Genesis block", "0");
  }



  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }

  addNewToken(token){
    if(token){
      this.nodeTokens[token.publicID] = token;
      this.addMiningAddress(token);
    }
  }

  hasToken(token){
    if(token){
      if(!this.nodeTokens[token.publicID]){
        return false;
      }else{
        return this.nodeTokens[token.publicID];
      }
    }
  }

  addMiningAddress(token){
    if(!this.miningAddresses[token.publicID]){
      this.miningAddresses[token.publicID] = new BlockchainAddress(token);
    }
  }

  getMiningAddress(addressToken){
    if(addressToken != undefined){
      if(this.miningAddresses[addressToken.publicID] && this.miningAddresses[addressToken.publicID] instanceof BlockchainAddress){
  			return this.miningAddresses[addressToken.publicID];
  		}else{
  			this.addMiningAddress(addressToken);
  		}
    }
  }

  addBlock(newBlock){
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty); //Proof of work in action
    this.chain.push(newBlock);
  }

  getTokenByPublicKey(key){
    if(key){
      var token;
      for(var tokenID of Object.keys(this.nodeTokens)){
        token = this.nodeTokens[tokenID];
        if(token.publicKeyFull == key){
          return token;
        }
      }

      return false;
    }

  }

  getTokenByAddress(addr){
    if(addr){
      var token;
      for(var tokenID of Object.keys(this.nodeTokens)){
        token = this.nodeTokens[tokenID];
        if(token.address == addr){
          return token;
        }
      }

      return false;
    }

  }

  syncBlock(newBlock, callback){

      var blockStatus;
      var pending = this.pendingTransactions;
      if(newBlock.transactions != undefined){
        var newTransactHashes = Object.keys(newBlock.transactions);
      }else{
        return false
      }

      //Will return true if the block is valid, false if not or the index of the block to which it is linked if valid but out of sync
      blockStatus = this.validateBlock(newBlock);

      if(blockStatus === true){
        console.log('New Block validated successfully');
        for(var hash of newTransactHashes){
          delete pending[hash];
        }
        this.chain.push(newBlock);
        this.pendingTransactions = pending;
        return true;
      }else if(blockStatus > 0){
        /*Handle chain forking between two peers*/
        // return blockStatus;
        return false;
      }else if(blockStatus === false){
        // console.log('New Block is invalid');
        return false;
      }else{
        return false;
      }





  }

  hasEnoughTransactionsToMine(){
    if(Object.keys(this.pendingTransactions).length >= this.blockSize){
      return true
    }else{
      return false;
    }
  }

  minePendingTransactions(miningRewardAddress, callback){

    var isMining = this.hasEnoughTransactionsToMine()
    callback(isMining, false);
    if(isMining){

      let block = new Block(Date.now(), this.pendingTransactions);
      block.blockNumber = this.chain.length;
      this.pendingTransactions = {};
      block.previousHash = this.getLatestBlock().hash;
      block.mineBlock(this.difficulty);
      block.minedBy = miningRewardAddress.hashSignature;

      miningRewardAddress.minedOneBlock();

      console.log("Block successfully mined!");

      if(this.validateBlock(block)){
        this.chain.push(block);
        console.log("The Blockchain is " + this.chain.length + " blocks long.");
        console.log(miningRewardAddress.address + ' has mined ' + miningRewardAddress.blocksMined + ' blocks.');
        this.createTransaction(new Transaction(null, miningRewardAddress.address, this.miningReward, "", Date.now(), false, 'coinbase'))
      }else{
        console.log('Block is not valid');

      }

      callback(false, true);
      return true;
    }else{

      return false;
    }

  }


  createTransaction(transaction){
    this.pendingTransactions[transaction.hash] = transaction;
  }

  checkFundsThroughPendingTransactions(token){
    var balance = 0;
    var trans;

    if(token != undefined){
      var address = token.publicID;
      /*****************************/
      if(!(typeof token == 'object')){  ///To be removed. For test purposes only
        console.log('Token not object');
        address = token;
      }else{
        address = token.address
      }
      /******************************/
      for(var transHash of Object.keys(this.pendingTransactions)){
        trans = this.pendingTransactions[transHash];

        if(trans.fromAddress == address){

          balance = balance - trans.amount;
        }

        // if(trans.toAddress == address){
        //
        //   balance = balance + trans.amount;
        // }
      }

      return balance;
    }else{
      return false;
    }

  }

  checkIfChainHasHash(hash){
    for(var i=this.chain.length; i > 0; i--){
      if(this.chain[i-i].hash === hash){
        return true
      }
    }

    return false;
  }

  getIndexOfBlockHash(hash){
    for(var i=0; i < this.chain.length; i++){
      if(this.chain[i].hash === hash){
        return i;
      }
    }

    return false;
  }

  checkIfBlockIsLinked(previousHash){
    var lastBlock = this.getLatestBlock();
    if(lastBlock.hash === previousHash){
      return true;
    }
    return false;
  }



  getBalanceOfAddress(token){
    if(token != undefined && typeof token == 'object'){
      var address = token.publicID;
      let balance = 0;
      var trans;
      if(token != undefined){

        for(var block of this.chain){
          // console.log(block);
          for(var transHash of Object.keys(block.transactions)){
            trans = block.transactions[transHash]
              if(trans.fromAddress == address){

                balance = balance - trans.amount;
              }

              if(trans.toAddress == address){

                balance = balance + trans.amount;
              }


          }
        }
      }else{

        return false;
      }

      return balance;
    }

  }



  getBalanceFromBlockIndex(index, token){
    var address = token.publicID;

    console.log('INDEX:', index);
    for(var i=0; i < index; i++){
      for(var transHash of Object.keys(this.chain[i].transactions)){
        trans = this.chain[i].transactions[transHash]


          if(trans.fromAddress == address){

            balance = balance - trans.amount;
          }

          if(trans.toAddress == address){

            balance = balance + trans.amount;
          }


      }
    }

  }



  isChainValid(){
    for(let i=1;i < this.chain.length; i++){

      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if(currentBlock.hash !== RecalculateHash(currentBlock)){

        console.log('currentblock hash does not match the recalculation');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        return false;
      }else if(currentBlock.previousHash !== previousBlock.hash){

        console.log('currentblock hash does not match previousblock hash');
        console.log('Invalid block is :' + i + ' with hash: ' + currentBlock.hash + ' and previous hash: ' + previousBlock.hash);
        console.log('Truncating chain from invalid block');
        this.truncateChain(i);
      }
    }

    return true;
  }

  truncateChain(index){
    if(index >= this.chain.length){
      var blockDifference = this.chain.length - index;
      this.chain.splice(index, blockDifference);
    }else{
      console.log('Segment of chain to truncate has out of range index');
    }

  }


  validateBlock(block){

    var containsCurrentBlock = this.checkIfChainHasHash(block.hash);
    var isLinked = this.checkIfBlockIsLinked(block.previousHash);
    var latestBlock = this.getLatestBlock();
    //Validate transactions using merkle root
    if(!containsCurrentBlock){
      if(!isLinked){
        if(latestBlock.previousHash == block.previousHash){
          /*New block received has been orphaned since latest block has been mined before.*/
          return false;
        }

        console.log('Current mined block is not linked with previous block. Sending it to orphanedBlocks');
        return this.getIndexOfBlockHash(block.previousHash);

      }else{
        // if(block.difficulty = )
        /*
          validate difficulty level
        */
        console.log('New block successfully validated. Will be appended to current blockchain.')
        return true;
      }

    }else if(containsCurrentBlock){
      // console.log('Chain already contains that block')
      /*Chain already contains that block*/
      return false;
    }

  }

  getBlocksFromHash(hash){
  	var blocks = [];
  	var index = this.getIndexOfBlockHash(hash);
    var latestBlock = this.getLatestBlock();
    /*
       Only sends block(s) if the hash sent is not the same as the current
       latest block on the chain, thus avoiding too much useless exchange
    */

      if(index > -1){

          for(var i=index+1; i < this.chain.length; i++){
            blocks.push(this.chain[i]);
          }
          return blocks;
      }else if(index == false){
    		console.log('ERROR: Hash not found');
        return false;
    	}



  }

  /**
  *  To run a proper transaction validation, one must look back at all the previous transactions that have been made by
  *  emitting peer every time this is checked, to avoid double spending. An initial coin distribution is made once the genesis
  *  block has been made. This needs some work since it is easy to send a false transaction and accumulate credits
  *
  * @param {Object, Object} A transaction object and an identity token
  * @return {boolean} If transaction is valid or not
  */

  validateTransaction(transaction, token){

    if(transaction && token){

      try{
        var isSendingNodeTheTxSender = (transaction.fromAddress == token.publicID);
        console.log('Is sending node the original sender? :', isSendingNodeTheTxSender);

        var isPartOfNetwork = this.validateAddressToken(token);
        console.log("Is sending node's token part of the network? :", isPartOfNetwork);

        var fromAddr = this.getTokenByID(transaction.fromAddress);
        console.log("Is from address a valid public key? :", (fromAddr? true:false));

        var toAddr = this.getTokenByID(transaction.toAddress);
        console.log("Is to address a valid public key? :", (toAddr? true:false));

        var isChecksumValid = this.validateChecksum(transaction);
        console.log("Is transaction hash valid? :", isChecksumValid);

        var isSignatureValid = this.validateSignature(fromAddr.publicKeyFull, transaction);
        console.log("Is transaction signature valid? :", isSignatureValid);

        var balanceOfSendingAddr = this.getBalanceOfAddress(token) + this.checkFundsThroughPendingTransactions(token);
        console.log("Balance of sender is : ",balanceOfSendingAddr);

          if(!balanceOfSendingAddr && balanceOfSendingAddr !== 0){
              console.log('Cannot verify balance of undefined address token');
              return false;
          }

          if(balanceOfSendingAddr >= transaction.amount){
            console.log('Transaction validated successfully');
            return true;
          }else if(transaction.type === 'query'){
            //handle blockbase queries
          }else{
            console.log('Address '+token.address+' does not have sufficient funds to complete transaction');
          }
      }catch(err){
        console.log(err);
      }




  	}else{
  		console.log('ERROR: Either the transaction or the token sent is undefined');
  		return false;
  	}


  }

  validateAddressToken(token){
    var exists = false;
    var isValid = false;
    if(token != undefined){
      if(this.nodeTokens[token.publicID] === token){
        exists = true;

        if(this.nodeTokens[token.publicID].publicID === sha256(this.nodeTokens[token.publicID].publicKeyFull + this.nodeTokens[token.publicID].address)){
          isValid = true;
        }
      }


    }

    return { exists, isValid };
  }

  validateChecksum(transaction){
    if(transaction){
      if(sha256(transaction.fromAddress+ transaction.toAddress+ transaction.amount+ transaction.data+ transaction.timestamp) === transaction.hash){
        return true;
      }
    }
    return false;
  }

  validateSignature(publicKey, transaction){

    if(publicKey){
      try{

        var verify = crypto.createVerify('RSA-SHA256');
        verify.update(transaction.hash);

        return verify.verify(publicKey, transaction.signature, 'hex');

      }catch(err){
        console.log(err);
        return false;
      }
    }else{
      return false;
    }



  }

  getTokenByID(id){
    if(id){
      for(var tokenID of Object.keys(this.nodeTokens)){
        if(id == tokenID){
          return this.nodeTokens[tokenID];
        }
      }
      return false;
    }

  }

}



class BlockchainAddress{
  constructor(token, blocksMined=0){
    this.address = token.address;
    this.blocksMined = blocksMined;
    this.publicAddress = token.publicID;
  }

  minedOneBlock(){
    this.blocksMined++;
  }


}


class BlockbaseRecord{
  constructor(name, tableName, address, data={}){ //, createTransaction
    this.name = name;
    this.tableName = tableName;
    this.address = address;
    this.data = data.toString();
    this.createdAt = (Date.now()).toString();
    this.modifiedAt = 0;
    this.nbTimesModified = 0;
    this.uniqueKey = sha256(name, tableName, data, address, this.createdAt);
    // createTransaction(this)
  }

  getData(){
    return this.data;
  }

}


class Blockbase{
  constructor(ownerAddress){
    this.ownerAddress = ownerAddress
    this.tables = [];

  }

  buildTables(chain, callback){
    var tables = [];
    var records;
    var block;
    if(chain !== undefined){
      if(Array.isArray(chain)){ //
        for(var i=0; i<chain.length; i++){ //var block of chain
          block = chain[i]

          if(block.transactions !== 'Genesis block'){
            records = this.findRecords(block.transactions);

            if(records){
                tables.push(records);
            }
          }

        }
        callback(tables);

      }
    }
  }

  findRecords(transactions){
    var recordsOfBlock = [];
    var record;
    var transactionHashes;
    if(transactions != undefined){
      if(typeof transactions === 'object'){
        transactionHashes = Object.keys(transactions);
        // console.log(transactionHashes);
        transactionHashes.forEach((hash)=>{///
          // console.log(hash);
          if(transactions[hash].toAddress === 'blockbase'){

            recordsOfBlock[hash] = transactions[hash].data;
            try{
              recordsOfBlock[hash] =  JSON.parse(transactions[hash].data)
            }catch(err){
              // console.log(err);
            }




          }else{

          }
        })
        return recordsOfBlock;

      }
    }
    return false;

  }

  encryptBlockbase(){

  }
}




function remove(array, element) {
    const index = array.indexOf(element);

    if (index !== -1) {
        array.splice(index, 1);
    }

    return array;
}

function RecalculateHash(block){
  //console.log(sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString())
  return sha256(block.previousHash + block.timestamp + merkleRoot(block.transactions) + block.nonce).toString();
}

const regenerateUniqueKey = (name, tableName, data, address, createdAt) =>{
    return sha256(name, tableName, data, address, createdAt)
}

function merkleRoot(dataSets){

  if(dataSets != undefined){
    var hashes = Object.keys(dataSets);


    let merkleRoot = merkle('sha256').sync(hashes);
    return merkleRoot.root();
  }

}



module.exports = { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord, Blockbase};
