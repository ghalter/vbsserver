var url = require('url'),
        controller = require('./Controller'),
        config = require('../config.json'),
        logger = require('winston'),
        Utils = require('./Utils');

class Routes {

    // setup all express routes
    constructor(app) {

        app.get('/', (req, res) => {
            res.render('index', {
                config: JSON.stringify(config)
            });
        });

        app.get('/test', (req, res) => {
            logger.info("Request for test page");
            logger.verbose("Request for test page", {requestHeaders: req.headers});
            if (config.debugMode) {
                res.render('test', {
                    config: JSON.stringify(config)
                });
            } else {
                res.send("Hello World. Server is running.");
            }
        });

        // only admin users can access edit and control views
        // data is only passed after successful login (via web socket)
        app.get('/edit', (req, res) => {
            logger.info("Request for edit page");
            logger.verbose("Request for edit page", {requestHeaders: req.headers});
            res.render('edit', {
                config: JSON.stringify(config)
            });
        });

        app.get('/control', (req, res) => {
            logger.info("Request for control page");
            logger.verbose("Request for control page", {requestHeaders: req.headers});
            res.render('control', {
                config: JSON.stringify(config)
            });
        });

        // viewer only displays what is going on at the server (current task etc.)
        // multiple clients can use this view simultaneously (but login required)
        // data is only passed after successful login (via web socket)
        app.get('/viewer', (req, res) => {
            logger.info("Request for viewer page");
            logger.verbose("Request for viewer page", {requestHeaders: req.headers});
            res.render('viewer', {
                config: JSON.stringify(config)
            });
        });

        // a new judge wants to register
        app.get('/judge', (req, res) => {
            logger.info("Request for judge page");
            logger.verbose("Request for judge page", {requestHeaders: req.headers});
            res.render('judge', {
                config: JSON.stringify(config)
            });
        });

        app.get('/inspect', (req, res) => {
            logger.info("Request for inspect page");
            logger.verbose("Request for inspect page", {requestHeaders: req.headers});
            res.render('inspect', {
                config: JSON.stringify(config)
            });
        });

        // attention: GET requests should not be used anymore, but are still included for backward compatibility
        // same URL format as POST request
        app.get('/vbs/submit', (req, res) => {

            this.computeSearchTime((searchTime, timestamp) => {

                // parse parameters
                var url_parts = url.parse(req.url, true);
                var query = url_parts.query;
                var teamNumber = parseInt(query.team);
				var memberNumber = parseInt(query.member);
                var videoNumber = parseInt((""+query.video).split(".")[0]);
                var frameNumber = parseInt(query.frame);
                var shotNumber = parseInt(query.shot);

                controller.submissionHandler.handleSubmission(teamNumber, memberNumber, videoNumber, frameNumber, shotNumber, null, searchTime, timestamp).then(()=>{}, ()=>{});
            });
        });

        // Returns response with one task per line of currently active competition
        // FORMAT:
        //      <current UNIX timestamp>;<task ID>;<task name>;<started UNIX timestamp>;<finished UNIX timestamp>
        app.get('/competition-state/get-active-competition-tasks', (req, res) => {

            const tasksArr = controller.competitionState.tasks;
            let responseArr = new Array();

            // Iterate over all finished and running tasks
            for (let i = 0; i < tasksArr.length; ++i)
            {
                let responseString = "";

                // <current UNIX timestamp>;
                responseString += Math.floor(new Date() / 1000) + ";";
                
                // <task ID>;
                responseString += tasksArr[i]._id + ";";

                // <task name>;
                responseString += tasksArr[i].name + ";";

                // <started UNIX timestamp>;
                responseString += Math.floor(tasksArr[i].startTimeStamp / 1000) + ";";

                // <finished UNIX timestamp>
                if (tasksArr[i].endTimeStamp) 
                {
                    responseString += Math.floor(tasksArr[i].endTimeStamp / 1000);
                } 
                else 
                {
                    responseString += "undefined";
                }

                responseArr.push(responseString);
            }


            // Send final response
            res.json(responseArr);
        });

        /*
          The preferred way to submit an answer to the server
          submission format:  <serveraddress:port>/vbs/submit?team=<int>&member=<int>&video=<int>&frame=<int>&shot=<int>
          frame number is 0-based
          shot id is 1-based (in accordance with the Trecvid master shot reference (msb)
          TODO: maybe limit the number of submissions per second to avoid a denial of service attack like behaviour
          the submission can optionally include a JSON log object which should adhere to a defined format (which is not validated at submission time)
          a log object can also be sent without a submission (if it includes no video and frame or shot number)
        */
        app.post('/vbs/submit', (req, res) => {

            this.computeSearchTime((searchTime, timestamp, task) => {

                // submission data is sent as URL parameters
                var url_parts = url.parse(req.url, true);
				var query = url_parts.query;
				var teamNumber = parseInt(query.team);
				var memberNumber = parseInt(query.member);
				var videoNumber = parseInt((""+query.video).split(".")[0]);  // tolerant submission format: either accept video ids like 1234, 01234, or 01234.mp4
				var frameNumber = parseInt(query.frame);
                var shotNumber = parseInt(query.shot);
                var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                var disableActionLogs = (typeof task === "undefined" || task.type.startsWith("AVS")) ? true : false; //ignore logs for AVS

                // action log can be sent as JSON encoded body (but is optional)
                var actionLog = req.body;
                if (actionLog && typeof actionLog === "object") actionLog.ipaddress = ip;

                var actionLogInfo = "";

				// a submission request does not necessarily have to contain an actual submission, it also can contain a sole actionLog
				if (Number.isInteger(videoNumber) && (Number.isInteger(frameNumber) || Number.isInteger(shotNumber))) {
					controller.submissionHandler.handleSubmission(teamNumber, memberNumber, videoNumber, frameNumber, shotNumber, null, searchTime, timestamp).then((submission) => {
                        if (!disableActionLogs) this.handleActionLog(actionLog, task, submission, teamNumber, memberNumber, searchTime, timestamp);
                        else actionLogInfo = "action log ignored";
                    }, () => {
                        if (!disableActionLogs) this.handleActionLog(actionLog, task, null, teamNumber, memberNumber, searchTime, timestamp);   // action log with invalid submission (e.g., because time over)
                        else actionLogInfo = "action log ignored";
                    });
				} else {
                    if (!disableActionLogs) this.handleActionLog(actionLog, task, null, teamNumber, memberNumber, searchTime, timestamp);  // action log without submission
                    else actionLogInfo = "action log ignored";
                }

                res.send(timestamp + " submission received after " + searchTime + " ms " + actionLogInfo);

            });
        });

        app.post('/vbs/log', (req, res) => {

            this.computeSearchTime((searchTime, timestamp, task) => {

                // submission data is sent as URL parameters
                var url_parts = url.parse(req.url, true);
				var query = url_parts.query;
				var teamNumber = parseInt(query.team);
                var memberNumber = parseInt(query.member);
                var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

                logger.info("Received log from team " + teamNumber + " member " + memberNumber);
				
                // action log can be sent as JSON encoded body (but is optional)
                var actionLog = req.body;
                if (actionLog && typeof actionLog === "object") actionLog.ipaddress = ip;

                if (typeof task !== "undefined" && !task.type.startsWith("AVS")) { //ignore logs for AVS
                    this.handleActionLog(actionLog, task, null, teamNumber, memberNumber, searchTime, timestamp);  // action log without submission
                    res.send("action log stored");
                } else {
                    res.send("action log ignored");
                }
            });
        });

        app.get('/lsc/submit', (req, res) => {
            this.computeSearchTime((searchTime, timestamp) => {

                // parse parameters
                var url_parts = url.parse(req.url, true);
                var query = url_parts.query;
                var teamNumber = parseInt(query.team);
                var imageId = query.image;
                
                controller.submissionHandler.handleSubmission(teamNumber, 0, 0, 0, 0, imageId, searchTime, timestamp);
            });
        });
    }

    handleActionLog(actionLog, task, submission, teamNumber, memberNumber, searchTime, timestamp) {

        if (actionLog && typeof actionLog === "object" && Object.keys(actionLog).length > 0) {

            // enrich the log entry with some additional information
            if (task) {
                actionLog.taskId = task._id;
            } else {
                // currently no task is running, but we can assume that this log belongs to the latest task
                actionLog.taskId = controller.getLatestTaskId();
            }
            if (submission) {
                // link this log entry to the according submission
                actionLog.submissionId = submission._id;
            }
            if (!Number.isInteger(actionLog.teamId)) {
                actionLog.teamId = teamNumber;
            }
            if (!Number.isInteger(actionLog.memberId)) {
                actionLog.memberId = memberNumber;
            }
            if (searchTime) {	// if the task is already over, searchTime is undefined
                actionLog.searchTime = searchTime;
            }
            actionLog.serverTimestamp = timestamp;	// receiving timestamp

            controller.db.createActionLogEntry(actionLog, () => {
                logger.verbose("Action log saved", {team: teamNumber, timestamp: timestamp}); // log entry is saved to database, no need to additionally log all the data...
                logger.info("log flush received", {team: actionLog.teamId});
            }, () => {
                logger.error("Saving action log failed", {actionLog: actionLog});
            });
        } else { // res is only available if the request doesn't contain a submission
            logger.error("received action log is empty or invalid");
        }
    }

    computeSearchTime(callback) {
        var timestamp = Date.now();
        controller.currentTask((task) => {
            if (task) {
                callback(Utils.roundSeconds((timestamp - task.startTimeStamp) / 1000), timestamp, task);
            } else {
                callback(NaN, timestamp);
            }
        });

    }
}

module.exports = Routes;
