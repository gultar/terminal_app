var childProcess = require('child_process');

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
	console.log('1. node: Start Blockchain Node');
	console.log('2. light: Start a light node');
	console.log('3. miner: Start a miner node');
	stdin.resume();
	stdin.setEncoding('utf8');

	stdin.on('data', function(data) {

		let choice = data.toString().trim()
		switch(choice){
			case '1':
			case 'node':
				startFullNode();
				break;
			case '2':
			case 'light':
				startLightNode();
				break;
			case '3':
			case 'miner':
				startMinerNode();
				break;
			default:
				stdout.write(`Unkown command: ${choice}`);
				break;
		}
	});


}


const startFullNode = () =>{
	runScript('./1node_server.js', function(err){
		console.log(err);
	})
}

const startLightNode = () =>{

}

const startMinerNode = () =>{
	runScript('./1node_server.js', function(err){
		console.log('err');
		mine();
	})

}

nodeMenu();
// module.exports = { nodeMenu }
