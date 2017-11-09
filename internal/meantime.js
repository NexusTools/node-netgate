(function () {
    var seconds = 900, interval;
    var timer = document.getElementById("timer");
    function tick() {
        if (seconds <= 0) {
            timer.innerHTML = "Reloading";
            clearInterval(interval);
            location.reload(true);
        }
        else {
            var minutes = Math.floor(seconds / 60);
            timer.innerHTML = minutes ? (minutes + "m " + (seconds % 60) + "s") : ((seconds % 60) + "s");
            seconds--;
        }
    }
    interval = setInterval(tick, 1000);
})();
//# sourceMappingURL=meantime.js.map