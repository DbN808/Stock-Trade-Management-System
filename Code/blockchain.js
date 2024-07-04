const sha256 = require('sha256');
const currentNodeUrl = process.argv[3];
const { v1: uuidv1 } = require('uuid');
const crypto = require('crypto');
const forge = require('node-forge');
const flag = true;

function Blockchain(){
  this.chain = [];
  this.pendingTransactions = [];

  this.currentNodeUrl = currentNodeUrl;
  this.networkNodes = [];
  this.privateKey = null;
  this.publicKey = null;
  this.netpublickeys = [];

  this.createNewBlock(100,'0','0');
};

Blockchain.prototype.createNewBlock = function(nonce, previousBlockHash, hash){
  const newBlock = {
    index: this.chain.length+1,
    timestamp: Date.now(),
    transactions: this.pendingTransactions,
    nonce: nonce,
    hash: hash,
    previousBlockHash: previousBlockHash,
  };

  this.pendingTransactions = [];
  this.chain.push(newBlock);

  return newBlock;
};

Blockchain.prototype.getLastBlock = function(){
  return this.chain[this.chain.length-1];
};


Blockchain.prototype.createNewTransaction = function(amount,stock, price, date, sender, recipient){
  const newTransaction = {
    amount: amount,
    stock: stock,
    price: price,
    date: date, //date format is dd-mm-yyyy
    sender: sender,
    recipient: recipient,
    transactionId: uuidv1().split('-').join('') // remove dashes from UUIDs
  };
  return newTransaction;
};

Blockchain.prototype.addTransactionToPendingTransactions = function(transactionObj){
  this.pendingTransactions.push(transactionObj);
  return this.getLastBlock['index'] + 1;
};


Blockchain.prototype.hashBlock = function(previousBlockHash, currentBlockData, nonce){
  const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
  const hash = sha256(dataAsString);
  return hash;
};


Blockchain.prototype.proofOfWork = function(previousBlockHash,currentBlockData){
  /*proofOfWork should produce a hash that starts with 4 zeros, then it will be valid and miner will  get rewarded. For this we will call hashBlock method numerous times, each time incrementing the nonce(starting from 0) till we get a hash that has 4 zeros at the start*/
  let nonce = 0;
  let hash = this.hashBlock(previousBlockHash,currentBlockData,nonce);
  while(hash.substring(0,4) !== '0000'){
    nonce++;
    hash = this.hashBlock(previousBlockHash,currentBlockData,nonce);
    //console.log(hash); //print all hash values till suitable hash encountered.
  }

  return nonce;
};


Blockchain.prototype.chainIsValid = function(blockchain){
  let validChain = true; 
  for(var i = 1; i<blockchain.length; i++){
    const currentBlock = blockchain[i];
    const prevBlock = blockchain[i-1];
    const blockHash = this.hashBlock(prevBlock['hash'], { transactions: currentBlock['transactions'], index: currentBlock['index']}, currentBlock['nonce']);
    if(blockHash.substring(0,4) !== '0000'){
      validChain = false; //making sure that the block hash starts with 4 zeros and the proofOfWork is done.
    } 
    if(currentBlock['previousBlockHash'] !== prevBlock['hash']){
      validChain = false; //check that all hashes are aligned properly
    }

    // console.log('previousBlockHash =>',prevBlock['hash']);
    // console.log('currentBlockHash =>',currentBlock['hash']);

  };

  //validity check for genesis block.
  const genesisBlock = blockchain[0];
  const correctNonce = genesisBlock['nonce'] === 100;
  const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
  const correctHash = genesisBlock['hash'] === '0';
  const correctTransactions = genesisBlock['transactions'].length === 0;

  if(!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions) validChain = false;


  return validChain;
}


Blockchain.prototype.getBlock = function(blockHash){
  let correctBlock = null;
  this.chain.forEach(block => {
    if(block.hash === blockHash) correctBlock = block;
    
  });
  return correctBlock;
};


Blockchain.prototype.getTransaction = function(transactionId){
  let correctTransaction = null;
  let correctBlock = null;
  this.chain.forEach(block =>{
    block.transactions.forEach(transaction =>{
      if(transaction.transactionId === transactionId){
        correctTransaction = transaction;
        correctBlock = block;
      };
    });
  });
  return {
    transaction: correctTransaction,
    block: correctBlock
  };
};


Blockchain.prototype.getAddressData = function(address){
  const addressTransactions = [];
  const minerTransactions = [];
  let flag = 0;
  this.chain.forEach(block => {
    block.transactions.forEach(transaction => {
      if((transaction.sender === address || transaction.recipient === address) && transaction.stock !== "BTC"){
        addressTransactions.push(transaction);
      }
      else if(transaction.sender === '00' && address.substring(0,4) !== 'http'){
        flag = 1;
        minerTransactions.push(transaction);
      };
    });
  });

  let balance = 0;
  if(flag === 0){
    addressTransactions.forEach(transaction =>{
      if(transaction.recipient === address) balance -= (transaction.amount*transaction.price);
      else if(transaction.sender === address) balance += (transaction.amount*transaction.price);
    });
    return {
      note: "Trader transactions",
      addressTransactions: addressTransactions,
      addressBalance: balance
    };
  }
  else{
    minerTransactions.forEach(transaction =>{
      balance+=transaction.amount;
    });
    return {
      note: "Miner transactions",
      addressTransactions: minerTransactions,
      addressBalance: balance
    };
  };
};

Blockchain.prototype.viewStock = function(stock){
  const stockTransactions = [];
  this.chain.forEach(block =>{
    block.transactions.forEach(transaction =>{
      if(transaction.stock === stock){
        stockTransactions.push(transaction);
      };
    });
  });
  return {
    stockTransactions: stockTransactions
  };
};


Blockchain.prototype.viewDay = function(date){
  const dateTransactions = [];
  this.chain.forEach(block =>{
    block.transactions.forEach(transaction => {
      if(transaction.date === date){
        dateTransactions.push(transaction);
      };
    });
  });
  return {
    dateTransactions: dateTransactions
  };
};

//Challenge Response Authentication using HMAC sha256 algo.
Blockchain.prototype.generateChallenge = function(){
  return crypto.randomBytes(32).toString('hex');
};

Blockchain.prototype.createResponse = function(challenge, key){
  const bit = Math.round(Math.random());
  const hmac = forge.hmac.create();
  hmac.start('sha256', key);
  hmac.update(challenge + bit);
  return {
    hmac: hmac.digest().toHex(),
    bit: bit
  };  
};

Blockchain.prototype.verifyResponse = function(challenge, bit, key){
  const hmac = forge.hmac.create();
  hmac.start('sha256', key);
  hmac.update(challenge + bit);
  const expectedResponse = hmac.digest().toHex();
  return expectedResponse;
};

Blockchain.prototype.verifyTransaction = function(privateKey, publickey){
  const challenge  = this.generateChallenge();
  const hmac1 = this.createResponse(challenge, privateKey);
  const bit = hmac1.bit;
  const hmac = hmac1.hmac;
  const hmac2 =  this.verifyResponse(challenge, bit, publickey);
  const verify = hmac === hmac2;
  return verify
};



//Creates public and private keys for a user, used to verify transactions.
Blockchain.prototype.createKeyPair = function(){
  const keys = forge.pki.rsa.generateKeyPair({bits: 512});
  const privatekeyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const publickeyPem = forge.pki.publicKeyToPem(keys.publicKey);
  return {
    privatekeyPem: privatekeyPem,
    publickeyPem: publickeyPem
  };
};







module.exports = Blockchain;