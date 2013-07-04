var crypto = require('crypto'),
	EventEmitter = require('events').EventEmitter;

var inherits = function(ctor, superCtor) {
	ctor.super_ = superCtor;
	ctor.prototype = Object.create(superCtor.prototype, {
		constructor: {
			value: ctor,
			enumerable: false,
			writable: true,
			configurable: true
		}
	});
};

var Tracer = function(commandline, id){
	EventEmitter.call(this);
	this._commandline = commandline;
	this._started = false;
	this._id = id;
	var self = this;
	global.events.on('stop', function(id){
		if (self._started && id === self._id){
			self.stop();
		}
	});
	return this;
};

inherits(Tracer, EventEmitter);

Tracer.prototype.start = function(){
	var columns = [
		'insert',
		'query',
		'update',
		'delete',
		'getmore',
		'command',
		'flushes',
		'mapped',
		'vsize',
		'res',
		'faults',
		'locked db',
		'idx miss %',
		'qr|qw',
		'ar|aw',
		'netIn',
		'netOut',
		'conn',
		'time'
	];
	var self = this;
	var run_cmd = function (cmd, args, onData, onDone) {
		var spawn = require("child_process").spawn;
		var child = spawn(cmd, args);
		child.stdout.on("data", function (data) {
			onData(null, ""+ data);
			if (!self._started){
				child.kill();
			}
		});
		child.stdout.on("end", function () {
			onDone();
		});
		child.on("error", function(){
			onDone();
		});
	};
	this._started = true;
	var columnPositions = null;

	run_cmd(this._commandline, "", function(err, data){
		try{
			var now = new Date();
			if (data.substring(0, 6) === 'insert'){
				columnPositions = {};
				for(var i = 0; i < columns.length; i++){
					var startIndex = 0,
						endIndex = data.length;
					if (i > 0){
						startIndex = data.indexOf(columns[i-1]) + columns[i-1].length;
					}
					endIndex = data.indexOf(columns[i]) + columns[i].length;
					columnPositions[columns[i]] = {
						start: startIndex,
						end: endIndex,
						index: i
					};
				}
				return;
			}
			if (!columnPositions) return;
			var parts = [];
			for(var key in columnPositions) if (columnPositions.hasOwnProperty(key)){
				var column = columnPositions[key];
				parts.push(data.substring(column.start, column.end).trim());
			}
			var db = parts[columnPositions['locked db'].index].split(':');
			parts[columnPositions['locked db'].index] = db[0];
			db[1] = parseFloat(db[1].substring(1, db[1].length-1));
			parts.push(db[1]);

			'insert,query,update,delete,getmore,command,flushes,faults,idx miss %,conn'.split(',').forEach(function(el){
				parts[columnPositions[el].index] = parseFloat(parts[columnPositions[el].index]);
			});
			parts[columnPositions['qr|qw'].index] = parts[columnPositions['qr|qw'].index].split('|').map(function(el){ return parseInt(el);});
			parts[columnPositions['ar|aw'].index] = parts[columnPositions['ar|aw'].index].split('|').map(function(el){ return parseInt(el);});
			var time = parts[columnPositions['time'].index].split(':');
			parts[columnPositions['time'].index] = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time[0], time[1], time[2]);
			console.log(data);
		}catch(e){
			console.error(e, data);
			return;
		}
		var result = {};
		for(var key in columnPositions) if (columnPositions.hasOwnProperty(key)){
			var column = columnPositions[key];
			result[key] = parts[column.index];
		}
		result['locked'] = parts[parts.length-1];
		self.emit('data', result);
	}, function(err){
		self.stop();
	});
};

Tracer.prototype.stop = function(){
	this._started = false;
};


var tracers = {};

exports.index = function(req, res){
  res.render('index', { title: 'MongoDB stat view' });
};

exports.startTrace = function(req, res){
	var id = crypto.randomBytes(20).toString('hex'),
		commandLine = req.param('commandline', 'mongostat');
	try{
		var tracer = new Tracer(commandLine, id);
		tracer.start();
		tracer.on('data', function(data){
			global.events.emit('data', id, data);
		});
		tracers[id] = tracer;
	}catch(e){
		res.json({success: false});
		return;
	}
	res.json({success: true, id: id});
};

exports.stopTrace = function(req, res){
	var id = req.param('id', '');
	if (!id || !tracers[id]){
		res.json({success: false});
		return;
	}
	tracers[id].stop();
	delete tracers[id];
	res.json({success: true});
};