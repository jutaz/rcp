var fs = require('fs');
var util = require('util');
var path = require('path')
var EventEmitter = require('events').EventEmitter;

function copier(source, destination, options, callback) {
    this.running = 0;
    this.total = 0;
    this.processed = 0;
    this.stopped = false;
    this.started = true;
    this.limit = options.limit || 32;
    this.stopOnErr = options.stopOnErr || false;
    this.source = path.resolve(source);
    this.destination = path.resolve(destination);
    fs.lstat(this.source, this.processStat.bind(this, this.source));
}
util.inherits(copier, EventEmitter);

copier.prototype.processStat = function(name, err, stats) {
    if(err) {
        this.handleErr(err);
        return;
    }
    if(!this.stopped) {
        if(this.source == name) {
            this.makeDir("", stats.mode);
        } else {
            if(stats.isFile()) {
                dest = name.replace(this.source, this.destination);
                this.copyFile(name, dest);
            } else if(stats.isDirectory()) {
                this.makeDir(name.replace(this.source, ''), stats.mode);
            }
        }
    }
}

copier.prototype.processRead = function(root, err, files) {
    var self = this;
    process.nextTick(function() {
        if(err) {
            self.handleErr(err);
            return;
        }
        files.forEach(function(file) {
            fs.lstat(path.normalize(root+"/"+file), self.processStat.bind(self, path.normalize(root+"/"+file)));
        });
    });
}

copier.prototype.copyFile = function(file, dest) {
    var self = this;
    if(this.running >= this.limit) {
        interv = setInterval(function(file, dest, interval) {
            if(self.running < self.limit) {
                clearInterval(interval);
                fs.createReadStream(file).pipe(fs.createWriteStream(dest));
            }
        }, 10, file, dest, interv);
    } else {
        this.running++;
        fs.createReadStream(file).pipe(fs.createWriteStream(dest));
        this.running--;
    }
}

copier.prototype.makeDir = function(dir, mode) {
    var self = this;
    fs.exists(path.normalize(this.destination+"/"+dir), function(exists) {
        if(exists) {
            fs.readdir(path.normalize(self.source+"/"+dir), self.processRead.bind(self, path.normalize(self.source+"/"+dir)));
            return;
        }
        fs.mkdir(path.normalize(self.destination+"/"+dir), mode, function(err) {
            if(err) {
                self.handleErr(err);
                return;
            }
            fs.readdir(path.normalize(self.source+"/"+dir), self.processRead.bind(self, path.normalize(self.source+"/"+dir)));
        });
    });
}

copier.prototype.stop = function() {
    this.stopped = true;
}

copier.prototype.handleErr = function(err) {
    if(this.stopOnErr) {
        this.stop();
    } else {
        this.emit('error', err);
    }
}

module.exports = copier;