const express = require('express')
const app = express()
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const { v1: uuidv1 } = require('uuid');
const port = process.argv[2];
const rp = require('request-promise');
const forge = require('node-forge');
const crypto = require('crypto');


const nodeAddress = uuidv1().split('-').join('');

const bitcoin = new Blockchain;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));


app.get('/blockchain', function (req, res) {
  const key = bitcoin.createKeyPair();
  if(bitcoin.privateKey===null) bitcoin.privateKey=key.privatekeyPem;
  if(bitcoin.publicKey===null) bitcoin.publicKey = key.publickeyPem;
  res.send(bitcoin);
});

app.get('/prevblock', function (req, res){
  res.send(bitcoin.getLastBlock());
})

app.post('/transaction', function(req,res){
  const newTransaction  = req.body;
  if(!bitcoin.verifyTransaction(bitcoin.privateKey, bitcoin.publicKey)){
    const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({note: `Transaction will be added in block ${blockIndex} .`});
  }
  else{
    res.json({note: 'Transaction verification failed.'})
  };
    
});

app.post('/transaction/broadcast', function(req,res){
  const newTransaction = bitcoin.createNewTransaction(req.body.amount,req.body.stock, req.body.price,req.body.date, req.body.sender, req.body.recipient);
  
  if(newTransaction.sender===bitcoin.currentNodeUrl){
    const addr = newTransaction.recipient;
    if(bitcoin.networkNodes.indexOf(addr)!==-1){
      bitcoin.addTransactionToPendingTransactions(newTransaction);
      const requestPromises = [];
      bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
          uri: networkNodeUrl + '/transaction',
          method: 'POST',
          body: newTransaction,
          json: true
        };
        requestPromises.push(rp(requestOptions));

      });
      Promise.all(requestPromises)
      .then(data =>{
        res.json({note: 'Transaction created and broadcasted successfully.'})
      });
    }
    else{
      res.json({note: 'Transaction unverified and hence not added.'});
    };
  }
  else if(newTransaction.recipient === bitcoin.currentNodeUrl){
    const addr = newTransaction.sender;
    if(bitcoin.networkNodes.indexOf(addr)!==-1){
      bitcoin.addTransactionToPendingTransactions(newTransaction);
      const requestPromises = [];
      bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
          uri: networkNodeUrl + '/transaction',
          method: 'POST',
          body: newTransaction,
          json: true
        };
        requestPromises.push(rp(requestOptions));

      });
      Promise.all(requestPromises)
      .then(data =>{
        res.json({note: 'Transaction created and broadcasted successfully.'})
      });
    }
    else{
      res.json({note: 'Transaction unverified and hence not added.'});
    };
  }
  else if(newTransaction.recipient===nodeAddress){
    bitcoin.addTransactionToPendingTransactions(newTransaction);
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
      const requestOptions = {
        uri: networkNodeUrl + '/transaction',
        method: 'POST',
        body: newTransaction,
        json: true
      };
      requestPromises.push(rp(requestOptions));

    });
    Promise.all(requestPromises)
    .then(data =>{
      res.json({note: 'Transaction created and broadcasted successfully.'})
    });
  }
  else{
    res.json({note: 'Transaction unverified and hence not added.'});
  };
  

});

app.get('/mine', function(req,res){
  const lastBlock = bitcoin.getLastBlock();
  const previousBlockHash = lastBlock['hash'];
  const currentBlockData = {
    transactions: bitcoin.pendingTransactions,
    index: lastBlock['index']+1
  };

  const nonce = bitcoin.proofOfWork(previousBlockHash,currentBlockData);
  const blockHash = bitcoin.hashBlock(previousBlockHash,currentBlockData,nonce);
  const newBlock = bitcoin.createNewBlock(nonce,previousBlockHash,blockHash);

  const requestPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl =>{
    const requestOptions = {
      uri: networkNodeUrl + '/receive-new-block',
      method: 'POST',
      body: { newBlock: newBlock},
      json: true
    };
    requestPromises.push(rp(requestOptions));
  });

  Promise.all(requestPromises)
  .then(data =>{
    const requestOptions = {
      uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
      method: 'POST',
      body: {
        amount: 6.25,
        stock: "BTC",
        price: 1,
        date: "0",
        sender: "00",
        recipient: nodeAddress
      },
      json: true
    };
    return rp(requestOptions);
  })
  .then(data =>{
    res.json({
      note: "New Block Mined and sent Successfully.",
      block: newBlock
    });
  });
});

//Users receive a newly mined block
app.post('/receive-new-block', function(req,res){
  const newBlock = req.body.newBlock;
  const lastBlock = bitcoin.getLastBlock();
  const correctHash = lastBlock.hash === newBlock.previousBlockHash;
  const correctIndex = lastBlock.index + 1 === newBlock.index;

  if (correctHash || correctIndex) {
    bitcoin.chain.push(newBlock);
    bitcoin.pendingTransactions = [];
    res.json({
      note: "New block received and accepted.",
      newBlock: newBlock
    });
  }
  else{
    res.json({
      note: "New block rejected.",
      newBlock: newBlock
    });
  }

});

//Register a new node and broadcast it to the entire network
app.post('/register-and-broadcast-node', function(req, res){
  const newNodeUrl = req.body.newNodeUrl;
  const pubkey = req.body.publicKey;

  if(bitcoin.netpublickeys.indexOf(pubkey)==-1 && bitcoin.networkNodes.indexOf(newNodeUrl) == -1){
    bitcoin.networkNodes.push(newNodeUrl);
    bitcoin.netpublickeys.push(pubkey);
    const regNodesPromises = []; //array to store all requests
    bitcoin.networkNodes.forEach(networkNodeUrl => {
      const requestOptions = {
        uri: networkNodeUrl + '/register-node', //request to every existing node to add new node to their network
        method: 'POST',
        body: {newNodeUrl: newNodeUrl , publicKey: pubkey},
        json: true
      };
      regNodesPromises.push(rp(requestOptions)); /*Stores all such requests. e.g. if 5 existing nodes and 1 new node, there will be 5 such requests*/

    });
    Promise.all(regNodesPromises) //Process all the requests present in the array
    .then(data => {
      const bulkRegisterOptions = {
        uri: newNodeUrl + '/register-to-all-nodes',
        method: 'POST',
        body: {allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl], allpublickeys: [...bitcoin.netpublickeys, bitcoin.publicKey] },
        json: true
      };
      return rp(bulkRegisterOptions);
    })
    .then(data => {
      res.json({note: 'New node registered on the network successfully.'})
    });
  }
  else{
    res.json({
      note: "Already Registered."
    });
  }; 

});


//Register the broadcasted node in the network(for all already present nodes)
app.post('/register-node', function(req,res){
  const newNodeUrl = req.body.newNodeUrl;
  const pKey = req.body.publicKey;
  const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
  const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
  const pkNotAlreadyPresent = bitcoin.netpublickeys.indexOf(pKey) == -1;
  const notCurrentpk = bitcoin.publicKey != pKey;
  if(nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(newNodeUrl);
  if(pkNotAlreadyPresent && notCurrentpk) bitcoin.netpublickeys.push(pKey);
  res.json({note: 'New node registered successfully.'});
});

//Register multiple nodes at once(for the newly added node)
app.post('/register-to-all-nodes', function(req,res){
  const allNetworkNodes = req.body.allNetworkNodes;
  const allpublickeys = req.body.allpublickeys;
  allNetworkNodes.forEach(networkNodeUrl =>{
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
    const notCurrentNode = bitcoin.currentNodeUrl !== networkNodeUrl;
    if(nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(networkNodeUrl);
  });
  allpublickeys.forEach(publickey=>{
    const pkNotAlreadyPresent = bitcoin.netpublickeys.indexOf(publickey) == -1;
    const notCurrentpk = bitcoin.publicKey !=  publickey;
    if(pkNotAlreadyPresent && notCurrentpk) bitcoin.netpublickeys.push(publickey);
  });

  res.json({note: 'Bulk registration successful.'});
});

//send the correct version of the blockchain to the newly added node.
app.get('/uptodate', function(req,res){
  const requestPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl =>{
    const requestOptions = {
      uri: networkNodeUrl + '/blockchain',
      method:'GET',
      json:true
    };

    requestPromises.push(rp(requestOptions));
  });
  Promise.all(requestPromises)
  .then(blockchains => {
    const currentChainLength = bitcoin.chain.length;
    let maxChainLength = currentChainLength;
    let newLongestChain = null;
    let newPendingTransactions = null;

    blockchains.forEach(blockchain =>{
      if(blockchain.chain.length > maxChainLength){
        maxChainLength = blockchain.chain.length;
        newLongestChain = blockchain.chain;
        newPendingTransactions = blockchain.pendingTransactions;
      };
    });

    if(!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))){
      res.json({
        note: 'Current chain has not been replaced.',
        chain: bitcoin.chain
      });
    }
    else if(newLongestChain && bitcoin.chainIsValid(newLongestChain)){
      bitcoin.chain = newLongestChain;
      bitcoin.pendingTransactions = newPendingTransactions;
      res.json({
        note: 'This chain has been replaced.',
        chain: bitcoin.chain
      });
    }
  });

});


app.get('/block/:blockHash', function(req,res){  
  const blockHash = req.params.blockHash;
  const correctBlock = bitcoin.getBlock(blockHash);
  res.json({
    block: correctBlock
  });
});


app.get('/transaction/:transactionId', function(req, res){
  const transactionId = req.params.transactionId;
  const transactionData = bitcoin.getTransaction(transactionId);
  res.json({
    transaction: transactionData.transaction,
    block: transactionData.block
  });  
});


app.get('/address/:adr', function(req,res){
  const address = req.params.adr;
  if(address === nodeAddress){
    const addressData = bitcoin.getAddressData(address);
    res.json({
      addressData: addressData
    });
  }
  else{
    const addr = `http://localhost:${address}`; // get last four characters of the address
    const addressData = bitcoin.getAddressData(addr);
    res.json({
      addressData: addressData
    });
  };

  

});

app.get('/stocktransaction/:stock', function(req, res){
  const stock = req.params.stock;
  const stockTransactions = bitcoin.viewStock(stock);
  res.json({
    note: "Here are all the transactions for the selected stock",
    stockTransactions: stockTransactions
  });
});

app.get('/day/:date', function(req, res){
  const date = req.params.date;
  const dateTransactions = bitcoin.viewDay(date);
  res.json({
    note: "Here are all the transactions of the stocks traded on this day",
    dateTransactions: dateTransactions 
  })
});


app.listen(port, function(){
  console.log(`Listening on port ${port}...`);
});