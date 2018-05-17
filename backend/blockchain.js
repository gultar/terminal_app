//Modules
const sha256 = require('./sha256');
const JSONdb = require('simple-json-db');
/******************************************/
/***********Blockchain classes*************/
/******************************************/

///////////////Transaction//////////////////
//A transaction is done if there is a
//change of data on the blockchain
class Transaction{
  constructor(fromAddress, toAddress, amount, data=''){
    this.fromAddress = fromAddress;
    this.toAddress = toAddress;
    this.amount = amount;
    this.data = data;
  }
}

//////////////////Block/////////////////////
class Block{
  constructor(timestamp, transactions, previousHash=''){
    this.timestamp = timestamp;
    this.transactions = transactions;
    this.previousHash = previousHash;
    this.hash = this.calculateHash();
    this.nonce = 0;
  }

  calculateHash(){
    return sha256(this.previousHash + this.timestamp + JSON.stringify(this.transactions) + this.nonce).toString();
  }

  /*Proof of Work*/
  mineBlock(difficulty){
    while(this.hash.substring(0, difficulty) !== Array(difficulty+1).join("0")){
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log("Block mined: " + this.hash);

  }
}


/////////////////////Blockchain///////////////////////
class Blockchain{

  constructor(chain=false, pendingTransactions=false, nodeAddresses=[{}]){
    this.chain = (chain? chain: [this.createGenesisBlock()]);
    this.difficulty = 5;
    this.pendingTransactions = (pendingTransactions? pendingTransactions: []);
    this.miningReward = 50;
    this.nodeAddresses = (nodeAddresses.length > 0? nodeAddresses : []); //Stores all the node addresses of the P2P network
    this.blockSize = 10; //Minimum Number of transactions per block

  }

  createGenesisBlock(){
    return new Block("01/01/2018", "Genesis block", "0");
  }

  getLatestBlock(){
    return this.chain[this.chain.length - 1];
  }

  addBlock(newBlock){
    newBlock.previousHash = this.getLatestBlock().hash;
    newBlock.mineBlock(this.difficulty); //Proof of work in action
    this.chain.push(newBlock);
  }

  hasEnoughTransactionsToMine(){
    if(this.pendingTransactions.length >= this.blockSize){
      return true
    }else{
      return false;
    }
  }

  minePendingTransactions(miningRewardAddress){
    if(this.hasEnoughTransactionsToMine()){
      let block = new Block(Date.now(), this.pendingTransactions);
      block.previousHash = this.getLatestBlock().hash;
      block.mineBlock(this.difficulty);

      miningRewardAddress.minedOneBlock();
      miningRewardAddress.setBalance(this.miningReward);

      console.log("Block successfully mined!");
      this.chain.push(block);

      console.log("The Blockchain is " + this.chain.length + " blocks long.");
      console.log(miningRewardAddress.address + ' has mined ' + miningRewardAddress.blocksMined + ' blocks.');
      this.pendingTransactions = [
        new Transaction(null, miningRewardAddress.address, this.miningReward, "")
      ];
      return true;
    }else{
      console.log('Waiting for other transactions...');
      return false;
    }

  }

  createTransaction(transaction){
    this.pendingTransactions.push(transaction);
  }



  getBalanceOfAddress(token){
    let balance = 0;
    var trans;
    for(var block of this.chain){
      // console.log(block);
      for(var i=0; i < block.transactions.length; i++){
        trans = block.transactions[i];

          console.log('Trans: ', trans);
          console.log('token:', token);
          if(trans.fromAddress == token.address){
            console.log("sending ",trans.amount);
            balance = balance - trans.amount;
          }

          if(trans.toAddress == token.address){
            console.log("receiving ", balance);
            balance = balance + trans.amount;
          }


      }
    }
    return balance;
  }

  addBlockbaseRecord(address){

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
        return false;
      }
    }
    return true;
  }
}

class BlockchainAddress{
  constructor(address, hashSignature, blocksMined=0,   balance=0){
    this.address = address;
    this.blocksMined = blocksMined;
    this.balance = balance;
    this.hashSignature = hashSignature
  }

  getBalance(){
    return this.balance;
  }

  getBlocksMined(){
    return this.blocksMined;
  }

  getAddress(){
    return this.address;
  }

  setBalance(value){
    this.balance += value;
  }

  minedOneBlock(){
    this.blocksMined++;
  }
}


class BlockbaseRecord{
  constructor(address, data=[{}]){
    this.address = address;
    this.data = data;
    this.createdAt = Date.now();
    this.modifiedAt = 0;
    this.nbTimesModified = 0;
  }

  getFullData(){
    return data;
  }

  getDataValue(keyToLookup){
    var valueFound = [];
    valueFound = recursiveLookup(keyToLookup, data, true);
    console.log('Value:', valueFound);
  }

}


function RecalculateHash(block){
  //console.log(sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString())
  return sha256(block.previousHash + block.timestamp + JSON.stringify(block.transactions) + block.nonce).toString();
}

module.exports = { Blockchain, Block, BlockchainAddress, Transaction, BlockbaseRecord};
