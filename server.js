var connect = require('connect');
var serveStatic = require('serve-static');
connect().use(serveStatic(__dirname)).listen(7000, function(){
    console.log('Server running on 7000...');
});
close();

function close(){
  connect = null;
}
