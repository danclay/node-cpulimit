
var priority = require('node-priority'),
    processFinder = require('./process_finder'),
    ProcessFamily = require('./process_family');

var MILS_IN_SECOND = 1000,
    MAX_PRIORITY = -20;

function createProcessFamily(options, callback) {
    processFinder.find(options, function(err, parentProcess) {
        if(err) {
            return callback(err);
        }

        var processFamily = new ProcessFamily(parentProcess, options.includeChildren);
        callback(null, processFamily);
    });
}

function limit(processFamily, options, callback) {
    tryHigherPriority(function(err, currentPriority, oldPriority) {
        var running = true,
            runningTime = MILS_IN_SECOND * (options.limit / 100),
            idleTime = MILS_IN_SECOND - runningTime,
            timeoutId = setTimeout(next, runningTime),
            parentProcess = processFamily.parentProcess;

        if(!parentProcess.kill(0)) {
            return stop(new Error('Process does not exist.'));
        }

        parentProcess.on('error', function (err) {
            stop(err);
        });

        parentProcess.on('exit', function(code, signal) {
            stop();
        });

        function next() {
            processFamily.refresh(function() {
                var timeout = null;

                if(processFamily.kill(running ? 'SIGSTOP' : 'SIGCONT')) {
                    timeout = running ? idleTime : runningTime;
                }

                if(timeout !== null) {
                    running = !running;
                    timeoutId = setTimeout(next, timeout);
                }
                else {
                    stop();
                }
            });
        }

        function stop(err) {
            clearTimeout(timeoutId);

            priority.set(priority.Process, 0, oldPriority, function() {
                callback(err);
            });
        }
    });
}

function tryHigherPriority(callback) {
    priority.get(priority.Process, 0, function(err, prio) {
        if(err) {
            return callback(err);
        }

        var oldPriority = prio;

        function next(currentPriority) {
            priority.set(priority.Process,  0, currentPriority - 1, function(err) {
                if(!err && currentPriority > MAX_PRIORITY) {
                    next(currentPriority - 1);
                }
                else {
                    return callback(null, currentPriority, oldPriority);
                }
            });
        }

        next(prio);
    });
}

exports.createProcessFamily = createProcessFamily;
exports.limit = limit;

