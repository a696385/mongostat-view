
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , http = require('http')
  , path = require('path')
  , EventEmitter = require('events').EventEmitter;

global.events = new EventEmitter();

var app = express();

// all environments
app.set('port', process.env.PORT || 5858);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(express.cookieParser('pojgjgoighreaogihreaoghr'));
app.use(express.session());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.post('/start', routes.startTrace);
app.post('/stop', routes.stopTrace);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
	createSocketServer(this);
});

var createSocketServer = function(app){
	var io = require('socket.io').listen(app);
	io.sockets.on('connection', function (socket) {
		var listening = false;
		socket.on('status', function (data) {
			if (data.trace){
				listening = data.trace;
			} else if (data.trace === false){
				listening = false;
			}
		});
		socket.on('disconnect', function(){
			if (listening) global.events.emit('stop', listening);
		});
		global.events.on('data', function(id, data){
			if (!listening || id != listening) return;
			socket.emit('data', data);
		});
	});
};


