var fs = require('fs');
var util = require('util');
var copier = require('./lib/copier');
var path = require('path');
var EventEmitter = require('events').EventEmitter;

module.exports = rcp;

function rcp(options) {
    this.limit = options.limit || 32;
    this.stopOnError = options.stopOnError || false;
}
util.inherits(rcp, EventEmitter);

rcp.prototype.copy = function(source, destination, callback) {
    var self = this;
    options = {
        limit: this.limit,
        stopOnError: this.stopOnError
    };
    copier = new copier(path.resolve(source), path.resolve(destination), options);
    copier.on('done', function(processed) {
        callback(null, processed);
    })
    copier.on('error', function(err) {
        if(self.stopOnError) {
            callback(err);
        } else {
            self.emit('error', err);
        }
    });
}