var controller = require('../Controller'),
        SubmissionHandlerKIS = require('./SubmissionHandlerKIS'),
        SubmissionHandlerAVS = require('./SubmissionHandlerAVS'),
        SubmissionHandlerLSC = require('./SubmissionHandlerLSC'),
        Video = require('../entities/Video'),
        logger = require('winston'),
        async = require('async');

class SubmissionHandler {

    constructor() {

        this.db = controller.db;

        this.handlerKIS = new SubmissionHandlerKIS(this);
        this.handlerAVS = new SubmissionHandlerAVS(this);
        this.handlerLSC = new SubmissionHandlerLSC(this);

        // updating scores (TaskResults) should be an atomic operation
        // otherwise, multiple updates triggered by concurrent judgements
        // could interleave and produce an inconsistent state (due to async database accesses)
        //  -> use an async Queue (with concurrency 1),
        //  i.e., always wait until an update is complete, before the next starts
        //  (kind of a critical section)
        this.updateQueue = async.queue((update, finished) => {
            update(finished);
        }, 1);
    }

    // when a new task is started, some things have to be reset
    //  (e.g., pool of correct shots and open live judgement requests (although there should not be any left...))
    resetTask() {
        this.handlerAVS.resetTask();
    }

    // first step of submission handling is the same for all task types
    handleSubmission(teamNumber, memberNumber, videoNumber, frameNumber, shotNumber, imageId, searchTime, timestamp) {
        return new Promise((resolve, reject) => {
            // first, retrieve the current task
            controller.currentTask((task) => {
                if (!task) {
                    reject("No task running.");
                } else {
                    // try to create submission entity
                    // this automatically triggers validation
                    this.db.createSubmission({
                        competitionId: task.competitionId,
                        taskId: task._id,
                        teamNumber: teamNumber,
                        memberNumber: memberNumber,
                        videoNumber: videoNumber,
                        // for KIS tasks, shot number is ignored (and later calculated from frame number)
                        shotNumber: (task.type.startsWith("AVS") ? shotNumber : null),
                        frameNumber: frameNumber,
                        imageId: imageId, // only relevant for LSC tasks
                        searchTime: searchTime,
                        timestamp: timestamp
                      },
                      (submission) => {
                        this.handleValidSubmission(submission, task);
                        resolve(submission);
                    }, (errorMsg) => {
                        // creation failed (propably due to validation)
                        reject(errorMsg);
                    });
                }
            });
        });
    }

    // content of the submission is basically valid
    handleValidSubmission(submission, task) {

        logger.info("New Submission", {teamNumber: submission.teamNumber, videoNumber: submission.videoNumber,
            shotNumber: submission.shotNumber, frameNumber: submission.frameNumber, imageId: submission.imageId,
            searchTime: submission.searchTime, submissionId: submission._id});
        logger.verbose("New Submission", {submission: submission, task: task});
        // submission has already been validated (contains all required fields)
        // but some details are still missing:
        //  - teamId and videoId: we only know the teamNumber and videoNumber, but we also need the db _ids
        //  - shotNumber and frameNumber: usually only one is submitted, but for AVS tasks both are required
        //          (shotNumber for judgement, frameNumber for preview image on client)
        this.enrichSubmission(submission, () => {
            // we have to differentiate between task types: AVS allows multiple correct submissions!
            if (task.type.startsWith("KIS")) {
                this.handlerKIS.handleSubmission(submission, task);
            } else if (task.type.startsWith("AVS")) {
                this.handlerAVS.handleSubmission(submission, task);
            } else if (task.type.startsWith("LSC")) {
                this.handlerLSC.handleSubmission(submission, task);
            } else {
                // should not be possible, because type is already checked in validation
                this.db.deleteSubmission(submission);
            }
        }, (err) => {
            logger.error("enriching submission failed", {submission: submission, errorMsg: err});
        });
    }

    enrichSubmission(submission, callback, error) {
        this.db.findTeam({competitionId: submission.competitionId, teamNumber: submission.teamNumber}, (team) => {
            submission.teamId = team._id;
            this.db.findTask({_id: submission.taskId}, (task) => {

                if (task.type.startsWith("KIS") || task.type.startsWith("AVS")) {
                    var video = controller.videoMap[submission.videoNumber];
                    if (!submission.shotNumber) {
                        submission.shotNumber = Video.frameToTrecvidShotNumber(submission.frameNumber, video);
                    }
                    if (!submission.frameNumber) {
                        submission.frameNumber = Video.getShotCenterFrame(submission.shotNumber, video);
                    }
                    submission.videoId = video._id;
                }

                this.db.updateSubmission(submission, () => {
                    callback();
                }, (err) => {
                    logger.error("updating submission failed", {submission: submission, errorMsg: err});
                    error(err);
                });

            }, error);
        }, error);
    }

    // result updates are performed strictly sequential,
    // otherwise they could interleave and produce an inconsistent state (due to asynchronous database accesses)
    criticalSection(criticalFunction) {
        var ts1 = (new Date()).getTime();
        this.updateQueue.push(criticalFunction, (err) => {
            var ts2 = (new Date()).getTime();
            logger.info("Results updated (" + (ts2 - ts1) + "ms)");
        });
    }

}

module.exports = SubmissionHandler;
