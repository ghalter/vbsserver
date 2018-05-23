class Submission {

    constructor(data) {

        data = (data) ? data : {};

        this._id;   // generated by Database
        this.competitionId = data.competitionId;
        this.taskId = data.taskId;
        this.teamId = data.teamId; // when the submission is created, we do not know the _.id yet. it is determined later
        this.videoId = data.videoId;  // when the submission is created, we do not know the _.id yet. it is determined later

        this.teamNumber = data.teamNumber;
        this.videoNumber = data.videoNumber;        
        this.shotNumber = data.shotNumber;  // 1-based shotNumber (according to msb)
        this.frameNumber = data.frameNumber;
        this.imageId = data.imageId;    // LSC tasks: submitted imageId
        this.iseq = data.iseq;
        this.searchTime = data.searchTime;   // in seconds        
        
        // for AVS tasks, judgement of the submission is asynchronous
        // for KIS and LSC tasks, this.judged can be ignored
        this.judged = null;     // supported types of judgement: kis, lsc, tvgt, extgt, judge_<judgeName>  (for KIS tasks, Trecvid ground truth, extended ground truth, live judge)
        this.correct = null;    // we do not know yet...        

    }

}

module.exports = Submission;

