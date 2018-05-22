class QueryGUI {

// situations when query visualization changes
//    - start task
//            depending on task type
//                    Visual: show video (with progressive blurring)
//                    Textual/AVS: show text (later refined)
//            starting in fullscreen for n seconds (initialFullscreenDuration)
//
//    - stop task
//            depending on task type
//                    Visual: reset blurring, continue video loop
//                    Textual: show video
//                    AVS: no change
//
//    - running task at loading time -> resume
//            same as on start (except for fullscreen)
//
//    - task finished at loading time (a.g., post-hoc inspection)
//            same as after stop task

    constructor(gui) {
        this.gui = gui;
        this.viewer = gui.viewer;
        this.elapsedTime = -1;   // elapsed time (in seconds) since the active task was started
    }

    init() {
        this.elapsedTime = -1;
        this.updateQueryState();
    }

    updateQueryState() {
        return new Promise((resolve, reject) => {
            var task = this.viewer.getActiveTask();
            if (task) {
                if (!task.running) {
                    this.updateTimer("TIME OVER");
                }
                if (task.type.startsWith("KIS_Visual")) {
                    this.hideQueryText();
                    this.showQueryVideo().then(() => {
                        if (task.finished) {
                            this.blurQueryVideo(0);
                        }
                        resolve();
                    });
                } else {
                    this.updateQueryText();
                    if (task.type.startsWith("AVS") || task.running) {
                        this.hideQueryVideo();
                        resolve();
                    } else {
                        this.showQueryVideo().then(() => {
							if (this.viewer.isInspector) {
								resolve();
							} else {
								this.unmuteVideo();
								this.showFullscreen("#queryVideo", config.client.initialFullscreenDuration, () => {
									this.muteVideo();
								});
								resolve();
							}
                        });
                    }
                }
            } else {
                this.hideQueryVideo();
                this.hideQueryText();
                resolve();
            }
        });
    }

    startTask() {
        this.elapsedTime = -1;
        var task = this.viewer.getActiveTask();
        if (task) {
            this.updateQueryState().then(() => {
                if (task.type.startsWith("KIS_Visual")) {
                    this.unmuteVideo();
                    this.showFullscreen("#queryVideo", config.client.initialFullscreenDuration, () => {
                        this.muteVideo();
                    });
                } else {
                    this.showFullscreen("#queryText", config.client.initialFullscreenDuration);
                }
            });
        } else {
            console.error("Task could not be started...");
        }
    }

    stopTask() {
		if (!this.viewer.toleranceTaskFlag) {
			this.updateTimer("TIME OVER");
			var task = this.viewer.getActiveTask();
			if (task) {
				this.updateQueryState();
			} else {
				this.hideQueryVideo();
				this.hideQueryText();
			}
		} else {
			this.updateTimer("WAITING...");
		}
    }

    hideQueryVideo() {
        $("#queryVideo").hide();
        $(".videoCtrlButton").hide();
        $("#queryVideo")[0].pause();
        $("#queryVideo")[0].ontimeupdate = null;
    }

    blurQueryVideo(size) {
        $("#queryVideo").css("filter", "blur(" + size + "px)");
    }

    showQueryVideo() {
        return new Promise((resolve, reject) => {
            var task = this.viewer.getActiveTask();
            if (task) {
                $("#queryVideo").show();
                $(".videoCtrlButton").show();
                var video = $("#queryVideo")[0];
                var playbackInfo = this.viewer.getTaskPlaybackInfo(task);
                video.src = playbackInfo.src;
                video.play().then(() => {
                    var blurDelayList = config.client.videoBlurProgress.delay;
                    var blurSizeList = config.client.videoBlurProgress.size;
                    video.ontimeupdate = () => {
                        if (video.currentTime < playbackInfo.startTimeCode || video.currentTime > playbackInfo.endTimeCode) {
                            video.currentTime = playbackInfo.startTimeCode;
                        }
                        if (task.type.startsWith("KIS_Visual") && this.viewer.isTaskRunning()) {
                            var idx = blurDelayList.findIndex((d) => d > this.elapsedTime);
                            if (idx < 0) {
                                idx = blurDelayList.length - 1;
                            } else {
                                idx--;
                            }
                            this.blurQueryVideo(blurSizeList[idx]);
                        } else {
                            this.blurQueryVideo(0);
                        }
                    };
                    resolve();
                });
            } else {
                this.hideQueryVideo();
                reject();
            }
        });
    }

    showFullscreen(element, duration, additionalActions) {

        $(".scoreDiv").hide();

        var targetHeight = $(window).height()
                - $("#title").outerHeight(true)
                - parseInt($("#title").css("margin-bottom")) * 2
                - parseInt($("body").css("margin-top"));

        var origZoom = parseFloat($(element).css("zoom"));
        var wrapper = $(element).parent();

        while ($(wrapper).height() < targetHeight) {
            this.gui.zoomElement(element, 1.01);
        }

        setTimeout(() => {
            // animate the zoom back to normal size
            var interval = setInterval(() => {
                var currentZoom = parseFloat($(element).css("zoom"));
                if (currentZoom > origZoom) {
                    this.gui.zoomElement(element, 0.99);
                } else {
                    clearInterval(interval);
                    if (additionalActions) {
                        additionalActions();
                    }
                    $(".scoreDiv").fadeIn();
                }
            }, 10);
        }, duration * 1000);
    }

    hideQueryText() {
        $("#queryText").hide();
    }

    showQueryText(text) {
        $("#queryText").html(text);
        $("#queryText").show();
    }

    updateQueryText() {
        var task = this.viewer.getActiveTask();
        if (task) {
            if (task.type.startsWith("KIS_Textual")) {
                var textIndex = 0;
                while (textIndex < task.textList.length - 1 && task.textList[textIndex + 1].delay <= this.elapsedTime) {
                    textIndex++;
                }
                this.showQueryText(task.textList[textIndex].text);
            } else if (task.type.startsWith("AVS")) {
                this.showQueryText(task.avsText);
            }
        } else {
            this.hideQueryText();
        }
    }

    togglePlay() {
        var video = $("#queryVideo")[0];
        if (video.paused) {
            video.play();
            $("#playBtn").css("background-image", 'url("../images/pause.png")');
        } else {
            video.pause();
            $("#playBtn").css("background-image", 'url("../images/play.png")');
        }
    }

    openVideo() {
        window.open($("#queryVideo")[0].src, '_blank');
    }

    toggleMute() {
        var video = $("#queryVideo")[0];
        if (video.muted) {
            this.unmuteVideo();
        } else {
            this.muteVideo();
        }
    }

    muteVideo() {
        var video = $("#queryVideo")[0];
        video.muted = true;
        $("#muteBtn").css("background-image", 'url("../images/mute.png")');
    }

    unmuteVideo() {
        var video = $("#queryVideo")[0];
        video.muted = false;
        $("#muteBtn").css("background-image", 'url("../images/unmute.png")');
    }

    updateTimer(time) {
        var task = this.viewer.getActiveTask();
        if (task) {
            if (typeof time == "number") {
                $("#timer").html(this.viewer.formatTime(time));
                this.elapsedTime = task.maxSearchTime - time;
                this.updateQueryText();
            } else {
                $("#timer").html(time);
            }
        } else {
            $("#timer").html("");
        }
    }

}