var http = require('http')
  , express = require('express')
  , app = express()
  , server = http.createServer(app)
  , io = require('socket.io')(server)

app.use(express.static(__dirname+'/views'));

app.get('/', function (req, res) {
  res.render('index', { data: JSON.stringify(blockchain) });
})

app.get('/blockchain', function(req, res, next){
  res.json(JSON.stringify(blockchain));
  nodeAddresses.push(req.connection.remoteAddress);
  console.log('nodeAddresses:',req);

});

app.post('/blockchain', function(req, res){

  let rawBlockchain = JSON.parse(req.body.blockchain);
  // blockchain = new Blockchain(rawBlockchain.chain, rawBlockchain.pendingTransactions);
  rawBlockchain = null;
  // saveBlockchain(blockchain);

});

var count = 0

io.on('connection', function (socket) {
  count++

  io.emit('news', { msg: 'One more person is online', count: count })
  socket.emit('private', { msg: 'Welcome you are the ' + count + ' person here' })

  socket.on('private', function (data) {
    console.log(data);
  })

  socket.on('disconnect', function() {
    count--
    io.emit('news', { msg: 'Someone went home', count: count })
  })
})

server.listen(3000, function() {
  console.log('Listening on port 3000...')
})
