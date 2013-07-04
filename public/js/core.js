$(function(){

	var socket = io.connect(["http:/", document.location.host].join("/"));
	var jq = {
		startBtn: $('#start'),
		stopBtn: $('#stop'),
		clearBtn: $('#clear'),
		commandPrompt: $('#command-prompt'),
		chart : $('#chart'),
		counterSelector: $('#counter-selector')
	};
	var tracerId = null;

	jq.stopBtn.hide();
	jq.startBtn.click(function(){
		$.post('/start', {
			commandline: jq.commandPrompt.val()
		}, function(data){
			if (!data.success){
				alert('Can not start trace');
			} else {
				tracerId = data.id;
				jq.startBtn.hide();
				jq.stopBtn.show();
				socket.emit('status', {trace: tracerId});
			}
		}, "json");
	});

	jq.stopBtn.click(function(){
		$.post('/stop', {id: tracerId}, function(data){
			if (!data.success){
				alert('Can not stop trace');
			} else {
				tracerId = null;
				jq.stopBtn.hide();
				jq.startBtn.show();
				socket.emit('status', {trace: false});
			}
		}, "json");
	});


	socket.on('data', function (data) {
		if (!tracerId) return;
		parseData(data);
	});

	Highcharts.setOptions({
		global: {
			useUTC: false
		}
	});

	var getCounter = function(){
		return jq.counterSelector.val();
	};

	var getCounterLabel = function(counter){
		return $('option[value="' + counter + '"]').text();
	};

	var allowLoadData = true;

	var initChart = function(){
		jq.chart.highcharts({
			chart: {
				type: 'spline',
				animation: Highcharts.svg, // don't animate in old IE
				marginRight: 10,
				events: {
					load: function() {
						var self = this;
						var interval = setInterval(function() {
							if (!allowLoadData) return;
							if (!self.series){
								clearInterval(interval);
								return;
							}
							var counter = getCounter(),
								counterLabel = getCounterLabel(counter);
							if (toAddSeries.length > 0){
								toAddSeries.forEach(function(el){
									self.addSeries({name: el, data: []});
									dbs[el].seriesIndex = self.series.length-1;
								});
								toAddSeries = [];
							}
							for(var dbName in dbs) if (dbs.hasOwnProperty(dbName)){
								var db = dbs[dbName],
									series = self.series[db.seriesIndex];
								db.data.forEach(function(el){
									var x = new Date(el.time), y;

									'insert,query,update,delete,getmore,command,flushes,faults,idx miss %,conn,locked'.split(',').forEach(function(counterName){
										if (counterName === counter){
											y = el[counterName];
										}
									});
									if (y == null){
										if (counter === 'qr') y = el['qr|qw'][0];
										else if (counter === 'qw') y = el['qr|qw'][1];
										else if (counter === 'ar') y = el['ar|aw'][0];
										else if (counter === 'aw') y = el['ar|aw'][1];
										else if (
											counter === 'netIn'  ||
											counter === 'netOut' ||
											counter === 'res'    ||
											counter === 'mapped' ||
											counter === 'vsize'
											) {
											var text = el[counter],
												size = text.substr(-1),
												value = parseFloat(text.substr(0, text.length-1));
											if (size == 'k') value *= 1024;
											else if (size == 'm') value *= 1024 * 1024;
											else if (size == 'g') value *= 1024 * 1024 * 1024;
											y = value;
										}
									}

									series.addPoint([x.getTime(), y]);
								});
								db.data = [];
							}
						}, 1000);
					}
				}
			},
			title: {
				text: 'MongoDB Stat Live Chart'
			},
			xAxis: {
				type: 'datetime',
				tickPixelInterval: 150,
				showLastTickLabel: true
			},
			yAxis: {
				title: {
					text: 'Value'
				},
				plotLines: [{
					value: 0,
					width: 1,
					color: '#808080'
				}]
			},
			tooltip: {
				formatter: function() {
					var counter = getCounter();
					var y = Highcharts.numberFormat(this.y, 2);
					if (
						counter === 'netIn'  ||
						counter === 'netOut' ||
						counter === 'res'    ||
						counter === 'mapped' ||
						counter === 'vsize'
						) {
						var size = 'b', value = this.y;
						if (value > 1024 * 1024 * 1024){
							size = 'g';
							value /= 1024 * 1024 * 1024;
						} else if (value > 1024 * 1024){
							size = 'm';
							value /= 1024 * 1024;
						} else if (value > 1024){
							size = 'k';
							value /= 1024;
						}
						y = Highcharts.numberFormat(value, 2) + size;
					}
					return '<b>'+ this.series.name +'</b><br/>'+
						Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) +'<br/>'+
						y;
				}
			},
			plotOptions: {
				spline: {
					lineWidth: 4,
					states: {
						hover: {
							lineWidth: 5
						}
					},
					marker: {
						enabled: false
					}
				}
			},
			legend: {
				enabled: true
			},
			exporting: {
				enabled: false
			},
			series: []
		});
	};

	var dbs = {};
	var toAddSeries = [];

	var parseData = function(data){
		var db = data['locked db'];
		if (!dbs[db]){
			dbs[db] = {
				data: [],
				seriesIndex: -1,
				allData: []
			};
			toAddSeries.push(db);
		}
		dbs[db].data.push(data);
		dbs[db].allData.push(data);
	};
	initChart();
	jq.counterSelector.change(function(){
		allowLoadData = false;
		setTimeout(function(){
			toAddSeries = [];
			for(var dbName in dbs) if (dbs.hasOwnProperty(dbName)){
				var db = dbs[dbName];
				db.seriesIndex = -1;
				db.data = [].concat(db.allData);
				toAddSeries.push(dbName);
			}
			allowLoadData = true;
			jq.chart.highcharts().destroy();
			initChart();
		},1000);
	});
	jq.clearBtn.click(function(){
		allowLoadData = false;
		setTimeout(function(){
			toAddSeries = [];
			dbs = {};
			allowLoadData = true;
			jq.chart.highcharts().destroy();
			initChart();
		},1000);
	});
});
