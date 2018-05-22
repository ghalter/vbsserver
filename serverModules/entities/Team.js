class Team {
    constructor(data) {

        data = (data) ? data : {};

        this._id;   // generated by Database
        this.teamNumber = data.teamNumber;  // previously called teamId, which is also used in submission
        this.competitionId = data.competitionId;
        this.name = data.name;
        this.color = data.color;
        this.logoSrc = data.logoSrc;
    }   
}

module.exports = Team;