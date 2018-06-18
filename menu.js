var childProcess = require('child_process');
const { getPublicKeyAndRsaKey } = require('./backend/keysHandler');

function runScript(scriptPath, callback) {

    // keep track of whether callback has been invoked to prevent multiple invocations
    var invoked = false;

    var process = childProcess.fork(scriptPath);

    // listen for errors as they may prevent the exit event from firing
    process.on('error', function (err) {
        if (invoked) return;
        invoked = true;
        callback(err);
    });

    // execute the callback once the process has finished running
    process.on('exit', function (code) {
        if (invoked) return;
        invoked = true;
        var err = code === 0 ? null : new Error('exit code ' + code);
        callback(err);
    });

}


const nodeMenu = () =>{
	let stdin = process.stdin;
	let stdout = process.stdout;
	console.log('*********************************************');
	console.log('*...........BLOCKCHAIN SIMULATOR............*');
	console.log('*********************************************');
	console.log('node: Start Blockchain Node');
	console.log('light: Start a light node');
	console.log('miner: Start a miner node');
	stdin.resume();
	stdin.setEncoding('utf8');

	stdin.on('data', function(data) {

		let choice = data.toString().trim()
		switch(choice){
			case '1':
			case 'node':
      case 'node 1':
				startFullNode('1');
        stdin.end();
				break;
      case '2':
      case 'node 2':
        startFullNode('2');
        break;
      case '3':
      case 'node 3':
        startFullNode('3');
        break;

			case 'light':
				startLightNode();
				break;

			case 'miner':
      case 'miner 1':
				startFullNode('1');
        stdin.end();
				break;
      case 'miner 2':
        startFullNode('2');
        break;
      case 'miner 3':
        startFullNode('3');
        break;
			default:
				stdout.write(`Unkown command: ${choice}`);
				break;
		}
	});




}


const startFullNode = (num) =>{
	runScript('./'+num+'node_server.js', function(err){
		console.log(err);
	})
}

const startLightNode = () =>{

}

const startMinerNode = (num) =>{
  runScript('./'+num+'node_server.js', function(err){
		console.log(err);
    mine();
	})
}


getPublicKeyAndRsaKey(()=>{
  nodeMenu();
})

// module.exports = { nodeMenu }
