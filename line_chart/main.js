'use strict';
(function() {
	var _data;
	var _mobile;
	var _width = 640;
	var _breakpoint = 640;
	
	var COLORS = ['#90b1c0', '#c2cca1', '#fdcd80', '#bf6151', '#ccb4c8', '#b5997d'];
	var FONT_SIZE = 13; // font size for the hover tooltip
	var Y_AXIS_PADDING = 0.02; // adds a bit of breathing room to y scale

	// called once on page load
	var init = function() {
		_mobile = isMobile.any();
		setupCopy();
		fetchData();
	};

	// called automatically on page resize
	window.onPymParentResize = function(width) {
		_width = width;
		Chart.resize();
	};

	// callback function (must be global to allow jsonp to work)
	window.onLoadData = function(response) {
		if(response) {
			_data = response.data ? response.data : response;
			formatData();
			Chart.setup();
		} else { console.log('no data'); }
	};

	// mobile detection
	var isMobile = function() {
		return {
			Android: function() { return navigator.userAgent.match(/Android/i); }, 
			BlackBerry: function() { return navigator.userAgent.match(/BlackBerry/i); }, 
			iOS: function() { return navigator.userAgent.match(/iPhone|iPad|iPod/i); }, 
			Opera: function() { return navigator.userAgent.match(/Opera Mini/i); }, 
			Windows: function() { return navigator.userAgent.match(/IEMobile/i); }, 
			any: function() { return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows()); }
		}
	}();

	// insert copy from config file into dom
	var setupCopy = function() {
		var html;
		var el;
		for(var prop in _chartConfig.copy) {
			html = createCopyHTML(prop);
			el = document.getElementsByClassName(prop);
			if(el) {
				el[0].innerHTML = html;
			}
		}
	};

	// make html output for copy to insert
	var createCopyHTML = function(prop) {
		var html = _chartConfig.copy[prop];
		if(prop === 'source') {
			html = '<span>SOURCE: ' + html + '</span>';
		} else if(prop === 'credit') {
			html = '<span>' + html + '</span>';
		}
		return html;
	};

	// load data from jsonp and trigger onLoadData
	var fetchData = function() {
		if(_chartConfig.data.indexOf('http') > -1) {
			var script = document.createElement('script');
			script.src = _chartConfig.data;
			document.getElementsByTagName('head')[0].appendChild(script);
		} else if(_chartConfig.data.length) {
			var dataType = _chartConfig.data.indexOf('.json') > -1 ? 'json' : 'csv';
			d3[dataType](_chartConfig.data, function(err, data) {
				if(err) { console.log(err.responseText); }
				else {
					onLoadData(data);
				}
			});
		} else { console.log('no data in config.js'); }
	};

	// turn strings into numbers and parse date
	var formatData = function() {
	    _data.forEach(function(d) {
	    	var dateColumn = _chartConfig.date.column;
	        d[dateColumn] = d3.time.format(_chartConfig.date.parseFormat).parse(d[dateColumn]);

	        // go through each property and convert all non-date columns to number
	        // do the special modifier function if included
        	for (var key in d) {
        		if(key !== _chartConfig.date.column) {
        			d[key] = +d[key];
        			if(_chartConfig.values.modify) {
            			d[key] = _chartConfig.values.modify(d[key]);
            		}
        		}
            }
	    });
	};

	// helper util for transform translate
	var translate = function(x, y) {
		return 'translate(' + x + ',' + y + ')';
	};

	// all the chart stuff
	var Chart = (function() {
		var data = {};
		var svg;
		var container;
		var line;
		var interaction;
		var focus;
		var axis = { x: null, y: null };
		var grid = { x: null, y: null };

		var scale = { x: null, y: null, color: null };
		var dimension = { w: 640, h: 480 };
		var tickCount = {x: 10, y: 10 };
		var aspect = 'desktop';
		
		var MARGIN = { top: 10, bottom: 20, left: 45, right: 20 };
		var ASPECT = { desktop: { x: 16, y: 9 }, mobile: { x: 4, y: 3 } };

		var bisectDate = d3.bisector(function(d) { return d.date; }).left;
		var formatValue = d3.format(_chartConfig.values.format);
		var formatDate = d3.time.format(_chartConfig.date.displayFormat);

		// run all setup tasks
		var setup = function() {
			updateScales();
			setupData();
			setupDOM();
			resize();
		};

		// seperate out data into array for each column and create legend
		var setupData = function() {
			var columnName;

			var setupLegend = function() {
				var color = scale.color(columnName);

				var html = '';
				html += '<li class="theta">';
				html += '<span style="background-color:' + color + ';"></span>';
				html += '<label>' + columnName + '</label>';
				html += '</li>';

				var el = document.getElementsByClassName('legend')[0];
				el.innerHTML = el.innerHTML + html;
			};

			var mapData = function() {
				data[columnName] = _data.map(function(d) {
		        	return {
		        		'date': d[_chartConfig.date.column],
		        		'value': d[columnName]
		        	};
		        });
			};

			for (var i in _chartConfig.values.columns) {
				columnName = _chartConfig.values.columns[i];
				mapData();

				if(_chartConfig.values.columns.length > 1) {
					setupLegend();
				}
		    }
		};

		// attach svg elements to dom
		var setupDOM = function() {
			svg = d3.select('#chart').append('svg');

			container = svg.append('g')
				.attr('class', 'container')
				.attr('transform', translate(MARGIN.left, MARGIN.top));

			axis.x = container.append('g')
				.attr('class', 'axis axis-x');

			axis.y = container.append('g')
				.attr('class', 'axis axis-y');

			grid.x = container.append('g')
				.attr('class', 'grid grid-x');

			grid.y = container.append('g')
				.attr('class', 'grid grid-y');

  			line = container.append('g')
        		.attr('class', 'lines')
        		.selectAll('path')
        		.data(d3.entries(data))
        		.enter()
    			.append('path')
            		.attr('class', function(d) {
            			return 'line line-' + d.key.replace(/\W/g, '');
        			});

            focus = container.append('g')
      			.attr('class', 'focus')
      			.style('display', 'none');
			
			focus.append('line');      			

  			var group = focus.selectAll('g')
  				.data(_chartConfig.values.columns)
  				.enter()
  				.append('g')
  					.attr('class', function(d) {
  						return 'focus-group focus-group--' + d.replace(/\W/g, '');
  					});

  			group.append('circle')
  				.attr('r', 4);

  			group.append('rect')
  				.attr({
  					'x': 0,
  					'y': 0,
  					'rx': 4,
  					'ry': 4
  				});

  			group.append('text')
  				.attr({'x': 0, 'y': 0 })
      			.each(function(d) {
      				d3.select(this).append('tspan')
      					.attr({
      						'class': 'focus-text--date',
      						'x': 0,
      						'y': 0
      					});
      				d3.select(this).append('tspan')
      					.attr({
      						'class': 'focus-text--value',
      						'x': 0,
      						'y': Math.round(FONT_SIZE * 1.25)
      					})
      					.style('fill', function(d) {
      						return scale.color(d);
      					});
      			});

            interaction = container.append('rect')
            	.attr('class', 'interaction')
		        .style('fill', 'none')
		        .style('pointer-events', 'all');

		    if(_chartConfig.hover) {
		    	interaction
		    		.on('mouseover', function() { focus.style('display', null); })
			        .on('mouseout', function() { focus.style('display', 'none'); })
			        .on('mousemove', mousemove);
		    }
	    };

		// update sizes and reflow chart
		var resize = function() {
			var w = _width;

			var aspect = _width < _breakpoint ? 'mobile' : 'desktop';

			var h = Math.round(_width / (ASPECT[aspect].x / ASPECT[aspect].y));

			dimension.w = w - (MARGIN.left + MARGIN.right);
			dimension.h = h - (MARGIN.top + MARGIN.bottom);

			tickCount.x = _width < _breakpoint ? 5 : 10;
			tickCount.y = _width < _breakpoint ? 5 : 10;			

			if(svg) {
				svg.attr('width', w);
				svg.attr('height', h);

				updateScales();
				updateChart();
			}
		};

		// update scales based on dimensions
		var updateScales = function() {
			var getMaxFromDatum = function(d) {
				var max = -99999999;
				for(var i in _chartConfig.values.columns) {
					var num = d[_chartConfig.values.columns[i]];
					if(num > max) {
						max = num;
					}
				}
				return max;
			};

			scale.color = d3.scale.ordinal()
				.domain(_chartConfig.values.columns)
				.range(COLORS.slice(0, _chartConfig.values.columns.length));

			scale.x = d3.time.scale()
        		.domain(d3.extent(_data, function(d) {
            		return d['date'];
        		}))
        		.range([ 0, dimension.w ])

        	var max = d3.max(_data, function(d) {
        		var innerMax = getMaxFromDatum(d);
                return innerMax + (innerMax * Y_AXIS_PADDING);
            });

    		scale.y = d3.scale.linear()
    			.domain([ 0, max ])
	        	.range([ dimension.h , 0 ])
	        	.nice();
		};

		// update svg elements
		var updateChart = function() {

			var xAxis = d3.svg.axis()
		        .scale(scale.x)
		        .orient('bottom');

		    var yAxis = d3.svg.axis()
		        .scale(scale.y)
		        .orient('left')
		        .ticks(tickCount.y)
		        .tickFormat(function(d) {
		        	return formatValue(d);
		        });

		    var grid_x_axis = function() { return xAxis };
		    var grid_y_axis = function() { return yAxis };

		    axis.x
		    	.attr('transform', translate(0, dimension.h))
		    	.call(xAxis);

		    axis.y
		    	.call(yAxis);

        	grid.x
        		.attr('transform', translate(0, dimension.h))
        		.call(
		    		grid_x_axis()
		    			.tickSize(-dimension.h, 0)
		    			.tickFormat('')
	    		);

    		grid.y
        		.call(
		    		grid_y_axis()
		    			.tickSize(-dimension.w, 0)
		    			.tickFormat('')
	    		);

		    var createPath = d3.svg.line()
				.interpolate(_chartConfig.values.interpolate)
				.x(function(d) { return scale.x(d['date']) })
				.y(function(d) { return scale.y(d['value']) });

			line
				.attr('d', function(d) { return createPath(d.value); })
				.attr('stroke', function(d) {
            		return scale.color(d['key']);
        		});

        	interaction
        		.attr('width', dimension.w)
        		.attr('height', dimension.h);
		};

		// interaction
		// show tooltip on mousemove
	    var mousemove = function() {
	    	var date = scale.x.invert(d3.mouse(this)[0]);
		    var index = bisectDate(_data, date, 1); 
		    var d0 = _data[index - 1];
		    var d1 = _data[index];

		    var datum = date - d0[_chartConfig.date.column] > d1[_chartConfig.date.column] - date ? d1 : d0;

		    // move line
		    var x = scale.x(datum[_chartConfig.date.column]);

		    focus.style('display', 'block')
		    	.select('line')
		    	.attr({
      				'x1': x,
      				'y1': 0,
      				'x2': x,
      				'y2': dimension.h
      			})
		    
		    // find closest Y column and show that
		    var targetY = scale.y.invert(d3.mouse(this)[1]);
		    var closestColumn;
		    var closestNum = 9999999;
		    _chartConfig.values.columns.forEach(function(col) {
		    	var diff = Math.abs(datum[col] - targetY);
		    	if(diff < closestNum) {
		    		closestColumn = col;
		    		closestNum = diff;
		    	}
		    });

			showValue(datum, closestColumn);
	    };

	    // display current value on chart
	    var showValue = function(datum, column) {
	    	// hide all first
	    	_chartConfig.values.columns.forEach(function(col) {
	    		if(col !== column) {
	    			var hideEl = focus.select('.focus-group--' + col.replace(/\W/g, ''));
	    			hideEl.style('display', 'none');	
	    		}
	    	});

	    	var y = scale.y(datum[column]);
	    	var x = scale.x(datum[_chartConfig.date.column]);
	    	var formattedValue = formatValue(datum[column])
	    	var formattedDate = formatDate(datum[_chartConfig.date.column]);
	    	var className = '.focus-group--' + column.replace(/\W/g, '');
	    	var anchor = x > dimension.w / 2 ? 'end' : 'start';
	    	var offset = anchor === 'end' ? -FONT_SIZE : FONT_SIZE;
	    	var el = focus.select(className);

	    	el.style('display', 'block');
	    	
			el.select('.focus-text--date')
    			.text(formattedDate);
	    	
	    	el.select('.focus-text--value')
    			.text(formattedValue);

    		var rectW;
    		var rectH;

    		el.select('text').each(function() {
    			rectW = Math.ceil(this.getBBox().width + FONT_SIZE);
    			rectH = Math.ceil(this.getBBox().height + FONT_SIZE);
    		});

    		el.select('rect')
    			.attr({
    				'width': rectW,
    				'height': rectH,
    				'transform': function() {
    					var yOff = rectH / 2 - (rectH / 2 - FONT_SIZE / 2.5);
    					var xOff = anchor === 'start' ? FONT_SIZE - FONT_SIZE / 2 : -(FONT_SIZE - FONT_SIZE / 2 + rectW);
    					return translate(xOff, yOff);
    				}
    			});

    		el.select('text')
	    		.attr({
	    			'text-anchor': anchor,
	    			'transform': translate(offset, rectH / 2)
	    		});

    		el.attr('transform', translate(x, y))
	    };

		return {
			setup: setup,
			resize: resize
		};
	})();

	// run code
	init();
})();