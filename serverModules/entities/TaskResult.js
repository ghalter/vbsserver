// Whenever a task is started, an "empty" TaskResult is created for each team
class TaskResult {
    constructor(data) {
        
        data = (data) ? data : {};
        
        this._id;   // generated by Database
        this.competitionId = data.competitionId;
        
        this.taskId = data.taskId;
        this.teamId = data.teamId;  // attention: this is not the teamNumber, but the unique database _.id !!        
        this.taskScore = 0;        // absolute score for this task in the range [0,100]
        this.searchTimes = new Array();   // array of search times for correct submissions (in seconds)
        this.numAttempts = 0;
        this.numCorrect = 0;
        this.numWrong = 0;
        this.numVideos = 0; // number of distinct videos that were found (only relevant for AVS)
        this.numRanges = 0; // number of distinct video ranges that were found (only relevant for AVS)
    }

}

module.exports = TaskResult;