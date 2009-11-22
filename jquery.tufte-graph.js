(function($) {
  //
  // Public interface
  //

  var line = {}
  var bar = {}

  // The main event - creates a pretty graph. See index.html for documentation.
  $.fn.tufteBar = function(options) {
    var defaultCopy = $.extend(true, {}, $.fn.tufteBar.defaults);
    var options =     $.extend(true, defaultCopy, options);

    return this.each(function () {
      bar.draw(makePlot(bar, $(this), options), options);
    });
  }

  $.fn.tufteLine = function(options) {
    var defaultCopy = $.extend(true, {}, $.fn.tufteBar.defaults);
    var options =     $.extend(true, defaultCopy, options);

    return this.each(function () {
      line.draw(makePlot(line, $(this), options), options);
    });
  }

  // Defaults are exposed publically so you can reuse bits that you find
  // handy (the colors, for instance)
  $.fn.tufteBar.defaults = {
    barWidth:  0.8,
    colors:    ['#07093D', '#0C0F66', '#476FB2'],
    color:     function(index, stackedIndex, options) { return options.colors[stackedIndex % options.colors.length]; },
    barLabel:  function(index, stackedIndex) {
      return $.tufteBar.formatNumber(totalValue(this[0]));
    },
    axisLabel: function(index, stackedIndex) { return index; },
    legend: {
      color: function(index, options) { return options.colors[index % options.colors.length]; },
      label: function(index) { return this; }
    },
    afterDraw: {
      point: function() {},
      stack: function() {},
      graph: function() {}
    }
  }

  $.tufteBar = {
    // Add thousands separators to a number to make it look pretty.
    // 1000 -> 1,000
    formatNumber: function(nStr) {
      // http://www.mredkj.com/javascript/nfbasic.html
      nStr += '';
      x = nStr.split('.');
      x1 = x[0];
      x2 = x.length > 1 ? '.' + x[1] : '';
      var rgx = /(\d+)(\d{3})/;
      while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + ',' + '$2');
      }
      return x1 + x2;
    }
  }

  //
  // Private functions
  //

  // This function should be applied to any option used from the options hash.
  // It allows options to be provided as either static values or functions which are
  // evaluated each time they are used
  function resolveOption(option, element) {
    // the @arguments@ special variable looks like an array, but really isn't, so we
    // need to transform it in order to perform array function on it
    function toArray() {
      var result = []
      for (var i = 0; i < this.length; i++)
        result.push(this[i])
      return(result)
    }

    return $.isFunction(option) ? option.apply(element, toArray.apply(arguments).slice(2, arguments.length)) : option;
  }

  // Returns the total value of a bar, for labeling or plotting. Y values can either be
  // a single number (for a normal graph), or an array of numbers (for a stacked graph)
  function totalValue(value) {
    if (value instanceof Array)
      return $.sum(value);
    else
      return value;
  }

  var drawFunc = function(plot, options, methods) {
    var ctx = plot.ctx;
    var axis = plot.axis;

    pixel_scaling_function = function(axis) {
      var scale = axis.pixelLength / (axis.max - axis.min);
      return function (value) {
        return (value - axis.min) * scale;
      }
    }

    // These functions transform a value from plot coordinates to pixel coordinates
    var t = {}
    t.W = pixel_scaling_function(axis.x);
    t.H = pixel_scaling_function(axis.y);
    t.X = t.W;
    // Y needs to invert the result since 0 in plot coords is bottom left, but 0 in pixel coords is top left
    t.Y = function(y) { return axis.y.pixelLength - t.H(y) };
    ctx.scale = t;
    ctx.axis = axis;

    // Iterate over each data point
    $(options.data).each(function (index) {
      var element = this;
      var x = index + 0.5;
      var all_y = toArray(element[0]);

      if ($(all_y).any(function() { return isNaN(+this); })) {
        throw("Non-numeric value provided for y: " + element[0]);
      }

      // Iterate over each data point for this line and render paths
      $(all_y).each(function(stackedIndex) {
        var optionResolver = function(option) { // Curry resolveOption for convenience
          return resolveOption(option, element, index, stackedIndex, options);
        }

        methods.drawPoint(optionResolver, stackedIndex, x, this);

        options.afterDraw.point(ctx, index, stackedIndex);
      });

      methods.drawStack(index, all_y, this, x);
      options.afterDraw.stack(ctx, index);
    });
    methods.drawGraph();
    options.afterDraw.graph(ctx);
  }

  bar.draw = function(plot, options) {
    var lastY = 0;

    drawFunc(plot, options, {
      drawPoint: function(optionResolver, stackedIndex, x, y) {
        var halfBar = optionResolver(options.barWidth) / 2;
        var left   = x - halfBar,
            width  = halfBar * 2,
            top = lastY + y,
            height = y;

        // Need to both fill and stroke the rect to make sure the whole area is covered
        // You get nasty artifacts otherwise
        var color = optionResolver(options.color);
        var t = plot.ctx.scale;
        var coords = [t.X(left), t.Y(top), t.W(width), t.H(height)];

        plot.ctx.rect(coords[0], coords[1], coords[2], coords[3]).attr({stroke: color, fill: color});

        lastY = lastY + y;
      },
      drawStack: function(i, stackedY, element, x) {
        addLabel = function(klass, text, pos) {
          html = '<div style="position:absolute;" class="label ' + klass + '">' + text + "</div>";
          $(html).css(pos).appendTo( plot.target );
        }

        var optionResolver = function(option) { // Curry resolveOption for convenience
          return resolveOption(option, element, i, options);
        }
        var t = plot.ctx.scale;

        addLabel('bar-label', optionResolver(options.barLabel), {
          left:   t.X(x - 0.5),
          bottom: t.H(lastY),
          width:  t.W(1)
        });
        addLabel('axis-label', optionResolver(options.axisLabel), {
          left:  t.X(x - 0.5),
          top:   t.Y(0),
          width: t.W(1)
        });
        lastY = 0;

      },
      drawGraph: function() {
        addLegend(plot, options);
      }
    });
  }

  function toArray(x) {
    if (x instanceof Array) {
      // This is a stacked graph, so the data is all good to go
      return x;
    } else {
      // This is a normal graph, wrap in an array to make it a stacked graph with one data point
      return [x];
    }
  }

  line.draw = function(plot, options) {
    var paths = [];

    drawFunc(plot, options, {
      drawPoint: function(optionResolver, index, x, y) {
        var ctx = plot.ctx;
        var coords = [ctx.scale.X(x), ctx.scale.Y(y)];

        if (!paths[index])
          paths[index] = ctx.path().moveTo(0, coords[1]).attr({stroke: optionResolver(options.color), "stroke-width": 4, "stroke-linejoin": "round"});

        var path = paths[index];

        path.lineTo(coords[0], coords[1]);
      },
      drawStack: function(index, stackedY) {
        if (index == options.data.length - 1) {
          $(toArray(options.data[index][0])).each(function(index) {
            paths[index].lineTo(plot.ctx.axis.x.pixelLength, plot.ctx.scale.Y(this));
          });
        }
      },
      drawGraph: function() {}
    });
  }


  // If legend data has been provided, transform it into an
  // absolutely positioned table placed at the top right of the graph
  function addLegend(plot, options) {
    if (options.legend.data) {
      elements = $(options.legend.data).collect(function(i) {
        var optionResolver = (function (element) {
          return function(option) { // Curry resolveOption for convenience
            return resolveOption(option, element, i, options);
          }
        })(this);

        var colorBox = '<div class="color-box" style="background-color:' + optionResolver(options.legend.color) + '"></div>';
        var label = optionResolver(options.legend.label);

        return "<tr><td>" + colorBox + "</td><td>" + label + "</td></tr>";
      });

      $('<table class="legend">' + elements.reverse().join("") + '</table>').css({
        position: 'absolute',
        top:  '0px',
        left: plot.width + 'px'
      }).appendTo( plot.target );
    }
  }

  // Calculates the range of the graph by looking for the
  // maximum y-value
  bar.makeAxis = function(options) {
    var axis = {
      x: {},
      y: {}
    }

    axis.x.min = 0
    axis.x.max = options.data.length;
    axis.y.min = 0;
    axis.y.max = 0;

    $(options.data).each(function() {
      var y = totalValue(this[0]);
      if (y < axis.y.min ) throw("Negative values not supported for bar graphs");
      if (y > axis.y.max ) axis.y.max = y;
    });

    if (axis.x.max <= 0) throw("You must have at least one data point");
    if (axis.y.max <= 0) throw("You must have at least one y-value greater than 0");

    return axis;
  }

  // Calculates the range of the graph by looking for the
  // minimum and maximum y-value, then adding some padding
  // since the drawing of the graph will go outside this
  // bounds slightly.
  line.makeAxis = function(options) {
    var axis = {
      x: {},
      y: {}
    }

    axis.x.min = 0
    axis.x.max = options.data.length;
    axis.y.min = Infinity;
    axis.y.max = -Infinity;

    $(options.data).each(function() {
      var all_y = toArray(this[0]);

      var min_y = Math.min.apply(Math, all_y);
      if (min_y < axis.y.min ) axis.y.min = min_y;

      var max_y = Math.max.apply(Math, all_y);
      if (max_y > axis.y.max ) axis.y.max = max_y;
    });

    if (axis.x.max <= 0) throw("You must have at least one data point");

    var range = axis.y.max - axis.y.min;
    axis.y.min = axis.y.min - range * 0.4;
    axis.y.max = axis.y.max + range * 0.4;

    return axis;
  }

  // Creates the canvas object to draw on, and set up the axes
  function makePlot(graph, target, options) {
    var plot = {};
    plot.target = target;
    plot.width = target.width();
    plot.height = target.height();
    target.html( '' ).css( 'position', 'relative' );

    if( plot.width <= 0 || plot.height <= 0 ) {
        throw "Invalid dimensions for plot, width = " + plot.width + ", height = " + plot.height;
    }

    // the canvas
    plot.ctx = Raphael(target[0].id, plot.width, plot.height);

    plot.axis = graph.makeAxis(options);
    plot.axis.x.pixelLength = plot.width;
    plot.axis.y.pixelLength = plot.height;

    return plot;
  }
} )( jQuery );
