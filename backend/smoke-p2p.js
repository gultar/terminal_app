
const smoke = require('smokesignal');

const initSmokeNetwork = () => {
  var node = smoke.createNode({
    port: 8496
  , address: smoke.localIp('192.168.0.154/255.255.255.0') // Tell it your subnet and it'll figure out the right IP for you
  , seeds: [{port: 8495, address: '192.168.0.153'}]
  , minPeerNo: 1 // the address of a seed (a known node) //,{port: 13, address:'192.168.0.154'}
  });

  // listen on network events...
  node.on('connect', function() {
    // Hey, now we have at least one peer!
    // ...and broadcast stuff -- this is an ordinary duplex stream!
    console.log('connected to peers');
    node.broadcast.write('HEYO! I\'m here')
  })

  node.on('disconnect', function() {
    // Bah, all peers gone.
  })

  // Broadcast is a stream
  process.stdin.pipe(node.broadcast).pipe(process.stdout)

  // Start the darn thing
  console.log('Listening for other peers');
  node.start();
  // mah, i'd rather stop it
  node.stop();

}


initSmokeNetwork();
