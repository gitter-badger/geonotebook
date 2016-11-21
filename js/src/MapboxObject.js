import _ from 'underscore';

import mapboxgl from 'mapbox/mapbox-gl-dev';
import 'mapbox/mapbox-gl.css';
import Draw from 'mapbox-gl-draw';
import 'mapbox-gl-draw/dist/mapbox-gl-draw.css';

import annotate from './jsonrpc/annotate';
import constants from './jsonrpc/constants';

mapboxgl.accessToken = 'pk.eyJ1IjoiamJlZXpsZXkiLCJhIjoiaHlXM01kNCJ9.od3nUvvjbGjwOAr6E7o7xQ';
var annotation_id = 0;

var MapboxObject = function (notebook) {
  this.notebook = notebook;
  this.mapboxmap = null;
  this.region = null;
  this.annotation_color_palette = [
    '#db5f57', // {r:219, g: 95, b: 87}
    '#dbae57', // {r:219, g:174, b: 87}
    '#b9db57', // {r:185, g:219, b: 87}
    '#69db57', // {r:105, g:219, b: 87}
    '#57db94', // {r: 87, g:219, b:148}
    '#57d3db', // {r: 87, g:211, b:219}
    '#5784db', // {r: 87, g:132, b:219}
    '#7957db', // {r:121, g: 87, b:219}
    '#c957db', // {r:201, g: 87, b:219}
    '#db579e'  // {r:219, g: 87, b:158}
  ];
  this._color_counter = -1;
};

MapboxObject.prototype.next_color = function () {
  this._color_counter = this._color_counter + 1;

  var idx = this._color_counter % this.annotation_color_palette.length;

  return this.annotation_color_palette[idx];
};

// convert a geojson coordinate into {x, y}
function convert_coordinate (coord) {
  return {
    x: coord[0],
    y: coord[1]
  };
}

MapboxObject.prototype.init_map = function () {
  $('#geonotebook-map').empty();
  this.mapboxmap = new mapboxgl.Map({
    container: 'geonotebook-map',
    style: 'mapbox://styles/mapbox/basic-v9'
  });
  this.draw = new Draw({
    controls: {
      point: true,
      line_string: false,
      polygon: true,
      trash: true,
      combine_features: false,
      uncombine_features: false
    }
  });
  this.mapboxmap.on(
    'draw.create', (evt) => this.add_annotation(evt)
  );
  this.mapboxmap.on(
    'draw.delete', function (evt) {
      console.log(evt);
    }
  );
  this.mapboxmap.on(
    'draw.update', function (evt) {
      console.log(evt);
    }
  );

  this.mapboxmap.addControl(this.draw);
};

MapboxObject.prototype.rpc_error = function (error) {
  console.log('JSONRPCError(' + error.code + '): ' + error.message); // eslint-disable-line no-console
};

MapboxObject.prototype.msg_types = [
  'get_protocol',
  'set_center',
  '_debug',
  'add_wms_layer',
  'replace_wms_layer',
  'add_osm_layer',
  'add_annotation_layer',
  'clear_annotations',
  'remove_layer'
];

MapboxObject.prototype._debug = function (msg) {
  console.log(msg); // eslint-disable-line no-console
};

// Generate a list of protocol definitions for the white listed functions
// in msg_types. This will be passed to the Python geonotebook object and
// will initialize its RPC object so JS map frunctions can be called from
// the Python environment.

MapboxObject.prototype.get_protocol = function () {
  return _.map(this.msg_types, (msg_type) => {
    var args = annotate(this[msg_type]);

    return {
      procedure: msg_type,
      required: args.filter(function (arg) { return !arg.default; }),
      optional: args.filter(function (arg) { return !!arg.default; })
    };
  });
};

MapboxObject.prototype.set_center = function (x, y, z) {
  if (x < -180.0 || x > 180.0 || y < -90.0 || y > 90.0) {
    throw new constants.InvalidParams('Invalid parameters sent to set_center!');
  }
  this.mapboxmap.flyTo({ // or jumpTo without animation
    center: [x, y],
    zoom: z
  });

  return [x, y, z];
};

MapboxObject.prototype.get_layer = function (layer_name) {
  return this.mapboxmap.getLayer(layer_name);
};

MapboxObject.prototype.remove_layer = function (layer_name) {
  this.mapboxmap.removeLayer(layer_name);
  this.mapboxmap.removeSource(layer_name + '-source');
  return layer_name;
};

MapboxObject.prototype.clear_annotations = function () {
  this.draw.deleteAll();
  return true;  // ?
};

MapboxObject.prototype.add_annotation = function (annotation) {
  var fillColor = this.next_color();
  /*
  var fillOpacity = 0.8;
  var strokeWidth = 2;
  */

  var feature = annotation.features[0];
  var geometry = feature.geometry;
  var meta = {
    id: ++annotation_id,
    name: geometry.type + '-' + annotation_id,
    rgb: fillColor
  };
  var type;
  var coordinates;

  switch (geometry.type) {
    case 'Point':
      type = 'point';
      coordinates = [convert_coordinate(geometry.coordinates)];
      break;
    case 'Polygon':
      type = 'polygon';
      coordinates = _.map(
        geometry.coordinates[0],
        convert_coordinate
      );
      break;
    default:
      throw new Error('Invalid feature type');
  }

  this.notebook._remote.add_annotation(
        type,
        coordinates,
        meta
    ).then(
        _.noop,
        this.rpc_error.bind(this));
};

MapboxObject.prototype.add_annotation_layer = function (layer_name, params) {
  return layer_name;
};

MapboxObject.prototype._set_layer_zindex = function (layer, index) {
  if (index !== undefined) {
    var annotation_layer = this.get_layer('annotation');
    layer.zIndex(index);
    if (annotation_layer !== undefined) {
            // Annotation layer should always be on top
      var max = _.max(_.invoke(this.geojsmap.layers(), 'zIndex'));
      annotation_layer.zIndex(max + 1);
    }
  }
};

MapboxObject.prototype.add_osm_layer = function (layer_name, url, params) {
  return layer_name;
};

MapboxObject.prototype.replace_wms_layer = function (layer_name, base_url, params) {
  return this.add_wms_layer(layer_name, base_url, params);
};

MapboxObject.prototype.add_wms_layer = function (layer_name, base_url, params) {
    // If a layer with this name already exists,  replace it
  if (this.get_layer(layer_name) !== undefined) {
    this.remove_layer(layer_name);
  }

  var tile_size = 512;
  var local_params = {
    'SERVICE': 'WMS',
    'VERSION': '1.3.0',
    'REQUEST': 'GetMap',
//                     'LAYERS': layer_name, // US Elevation
    'STYLES': '',
    'WIDTH': tile_size,
    'HEIGHT': tile_size,
    'FORMAT': 'image/png',
    'TRANSPARENT': true,
    'SRS': 'EPSG:3857',
    'TILED': true
           // TODO: What if anythin should be in SLD_BODY?
           // 'SLD_BODY': sld
  };

  if (params['SLD_BODY']) {
    local_params['SLD_BODY'] = params['SLD_BODY'];
  }

  var url = base_url + '&' + $.param(local_params) + '&BBOX={bbox-epsg-3857}';

  this.mapboxmap.addSource(layer_name + '-source', {
    type: 'raster',
    tiles: [url],
    tileSize: tile_size
  });
  this.mapboxmap.addLayer({
    id: layer_name,
    type: 'raster',
    source: layer_name + '-source',
    paint: {}
  }, 'tunnel_minor');
  return layer_name;
};

export default MapboxObject;
