var fs = require('fs');
var util = require('util');
var path = require('path')
var EventEmitter = require('events').EventEmitter;

function copier(source, destination, options) {
    this.running = 0;
    this.total = 0;
    this.processed = 0;
    this.stopped = false;
    this.started = true;
    this.limit = options.limit || 32;
    this.stopOnErr = options.stopOnErr || false;
    this.statInterval = options.statInterval || 200;
    this.source = path.resolve(source);
    this.destination = path.resolve(destination);
    fs.lstat(this.source, this.processStat.bind(this, this.source));
    this.stats();

}
util.inherits(copier, EventEmitter);

copier.prototype.stats = function() {
    var self = this;
    this.on('done', function() {
        clearInterval(self.statInterval);
    });
    this.statInterval = setInterval(function() {
        self.emit('stats', self.running, self.processed, self.total);
    }, this.statInterval);
}

copier.prototype.processStat = function(name, err, stats) {
    if(err) {
        this.handleErr(err);
        return;
    }
    if(!this.stopped) {
        if(this.source == name) {
            this.total++;
            this.makeDir("", stats.mode);
        } else {
            if(stats.isFile()) {
                this.total++;
                dest = name.replace(this.source, this.destination);
                this.copyFile(name, dest, stats.mode);
            } else if(stats.isDirectory()) {
                this.total++;
                this.makeDir(name.replace(this.source, ''), stats.mode);
            } else if(stats.isSymbolicLink()) {
                this.total++;
                this.link(name.replace(this.source, ''), stats.mode);
            }
        }
    }
}

copier.prototype.link = function(file) {
    var self = this;
    this.running++;
    fs.link(path.normalize(this.source+"/"+file), path.normalize(this.destination+"/"+file), function() {
        this.processed++;
        this.running--;
        if(this.total == this.processed && this.running == 0) {
            setTimeout(function(total) {
                if(self.total == total) {
                    self.emit("done", self.total);
                }
            }, 20, this.total);
        }
    }.bind(this));
}

copier.prototype.processRead = function(root, err, files) {
    var self = this;
    if(err) {
        self.handleErr(err);
        return;
    }
    files.forEach(function(file) {
        fs.lstat(path.normalize(root+"/"+file), self.processStat.bind(self, path.normalize(root+"/"+file)));
    });
}

copier.prototype.copyFile = function(file, dest, mode) {
    var self = this;
    if(this.running >= this.limit) {
        this.scheduleNext(file, dest, mode);
    } else {
        this.streamCp(file, dest, mode);
    }
}

copier.prototype.scheduleNext = function(file, dest, mode) {
    var interval = setInterval(function(file, dest, mode) {
        if(this.running < this.limit) {
            clearInterval(interval);
            this.streamCp(file, dest, mode);
        }
    }.bind(this), 10, file, dest, mode);
}

copier.prototype.streamCp = function(file, dest, mode) {
    var self = this;
    this.running++;
    write = fs.createWriteStream(dest, {mode, mode});
    write.on('finish', function() {
        this.running--;
        this.processed++;
        if(this.total == this.processed && this.running == 0) {
            setTimeout(function(total) {
                if(self.total == total) {
                    self.emit("done", self.total);
                }
            }, 20, this.total);
        }
    }.bind(this));
    fs.createReadStream(file).pipe(write);
}

copier.prototype.makeDir = function(dir, mode) {
    var self = this;
    this.running++;
    this.processed++;
    fs.exists(path.normalize(this.destination+"/"+dir), function(exists) {
        if(exists) {
            this.running--;
            fs.readdir(path.normalize(this.source+"/"+dir), this.processRead.bind(this, path.normalize(this.source+"/"+dir)));
            return;
        }
        fs.mkdir(path.normalize(this.destination+"/"+dir), mode, function(err) {
            this.running--;
            if(err) {
                this.handleErr(err);
                return;
            }
            fs.readdir(path.normalize(this.source+"/"+dir), this.processRead.bind(this, path.normalize(this.source+"/"+dir)));
        }.bind(this));
    }.bind(this));
}

copier.prototype.stop = function() {
    this.stopped = true;
}

copier.prototype.handleErr = function(err) {
    console.log(err);
    if(this.stopOnErr) {
        this.stop();
    } else {
        this.emit('error', err);
    }
}

module.exports = copier;