
document.onkeydown = function(event) {
	switch (event.keyCode) {
		case 37:
			event.preventDefault();
			var a = document.getElementById("prev");
			//console.log('Left key pressed', a);
			if (a) window.location.href = a.href
			return false;
		case 38:
			event.preventDefault();
			var a = document.getElementById("up");
			//console.log('Up key pressed', a);
			if (a) window.location.href = a.href
			return false;
			break;
		case 39:
			event.preventDefault();
			var a = document.getElementById("next");
			//console.log('Right key pressed', a);
			if (a) window.location.href = a.href
			return false;
		case 40:
			//console.log('Down key pressed');
			break;
	}
};
