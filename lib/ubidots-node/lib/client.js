var request    = require('request'),
    util       = require('util'),
    config     = require('./config'),
    Datasource = require('./datasource'),
    Variable   = require('./variable');

function Client(opts) {

  if (typeof opts === "string") {
    this.apiKey = opts;
  } else {
    this.apiKey = opts.apiKey;
  }

  this.token = opts.token || null;
  this.url = opts.url || config.url;
  this.protocol = opts.protocol || config.protocol;
}

Client.prototype.auth = function auth(cb) {

  if (typeof cb !== 'function') {
    throw new Error('Must provide a callback');
  }

  this._request({
    method: 'POST',
    endpoint: 'auth/token',
    headers: { "X-Ubidots-ApiKey": this.apiKey }
  }, (function (err, res, body) {
    if (err) return cb(err);

    if(body && body.token) {
      this.token = body.token;
      return cb.call(this, null);
    }

    return cb.call(this, null);
  }).bind(this));
};

Client.prototype.getVariable = function getVariable(id) {
  return new Variable(id, this);
};

Client.prototype.getDatasource = function getDatasource(id) {
  return new Datasource(id, this);
};

Client.prototype.getDatasources = function getDatasources(cb) {

  if (typeof cb !== 'function') {
    throw new Error('Must provide a callback');
  }

  this._request({
    endpoint: 'datasources'
  }, function (err, res, body) {
    if (err) return cb(err);

    cb(null, body);
  });
};

Client.prototype.setValues = function setValues(values, cb) {
  /* Send values to many variables. values contains:
  [{"variable": "{VAR_ID_1}", "value":41.2}, {"variable": "{VAR_ID_1}", "value":88.3}]
  Also accepts the “timestamp” and “context” keys.
  Ubidots will create the valid values and reject only the ones with errors. */
  /* Accepted parameters in the URL:
  force	When false (default), the system will reject all values if there’s one of them with an error.
  When true, the system will create the valid values and reject only the ones with errors. */
  this._request({
    method: 'POST',
    endpoint: 'collections/values?force=true',
    params: values
  }, function (err, res, body) {
    if (err) return cb(err);

    cb(null, body);
  });
};

Client.prototype._request = function _request(opts, cb) {
  var url = this.protocol + "://" + this.url + "/" + opts.endpoint;
  var headers = opts.headers || {};

  if (this.token) {
    headers['X-Auth-Token'] = this.token;
  }

  request({
    url: url,
    method: opts.method || 'GET',
    body: opts.params || {},
    headers: headers,
    json: true
  }, function (err, res, body) {
    cb(err, res, body);
  });
};

module.exports = Client;
