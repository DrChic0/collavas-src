const socket = io({
      timeout: 500
    });

    const canvas = document.getElementById('drawingCanvas');
    const canvasContainer = document.getElementById('canvasContainer');
    const buttons = document.getElementById('buttons');
    const tx = document.getElementById('x');
    const ty = document.getElementById('y');
    const context = canvas.getContext('2d');
	const chat = document.querySelector('.chat-container');
	const nameinput = document.getElementById('username');
	const drawingEmitDelay = 500;
	let lastDrawingEmitTime = 0;
    let drawings = [];
	let announcementIDs = [];
    let currentDrawing = [];
    let isDrawing = false;
    let uiVisible = true;
    let currentColor = '#000000';
	let announceCount = 1;
    let connectionTimer = null;
    let connectionSeconds = 0;
    let versionSet = false;
    let ping = null;
	let uuid = "";
    context.imageSmoothingEnabled = true;
    canvasContainer.style.transform = `scale(0.08)`;
	
	function getCookie(name) {
		const cookies = document.cookie.split(';').map(cookie => cookie.trim());
		for (const cookie of cookies) {
			const [cookieName, cookieValue] = cookie.split('=').map(part => decodeURIComponent(part));
			if (cookieName === name) {
				return cookieValue;
			}
		}
		return null;
	}
	
	function setCookie(name, value, expire) {
		const expirationDate = new Date();
		expirationDate.setDate(expirationDate.getDate() + expire);

		const cookieValue = encodeURIComponent(value) + (expire ? `; expires=${expirationDate.toUTCString()}` : '');
		document.cookie = `${name}=${cookieValue}; path=/`;
	}

    function pinger() {
      const startTime = Date.now();
      const pingtext = document.getElementById('ping').querySelector('p');

      socket.on('pong', () => {
        const latency = Date.now() - startTime;
        pingtext.textContent = 'Ping: ' + latency + 'ms';
        document.getElementById('ping').style.opacity = 0.25;
      });

      socket.emit('ping');
    }

    ping = setInterval(pinger, 1000);

    function startConnectionTimer() {
      const messages = document.querySelector('.messages');

      if(messages.querySelectorAll('[id="connection"]').length > 0) {
        return;
      }

      clearInterval(ping);
      const parentMessage = document.createElement('div');
      parentMessage.setAttribute('class', 'message fadeup red');
      parentMessage.setAttribute('id', 'connection');
      parentMessage.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
      parentMessage.style.width = "300px";
      const message = document.createElement('p');
      message.setAttribute('id', 'timeout');
      message.setAttribute('style', 'white-space: nowrap;margin: 25px 50px 25px 50px');
      message.textContent = "Server Connection Timeout: " + connectionSeconds.toFixed(1);
      parentMessage.appendChild(message);
      messages.appendChild(parentMessage);

      canvas.style.opacity = 0;
      buttons.style.opacity = 0;
      canvas.classList.add('fadedown');
      drawings = [];
      currentDrawing = [];
      draw();
      
      connectionTimer = setInterval(() => {
        connectionSeconds += 0.1;
        document.getElementById('timeout').textContent = "Server Connection Timeout: " + connectionSeconds.toFixed(1);
      }, 100);
    }

    function stopConnectionTimer() {
      clearInterval(connectionTimer);
      ping = setInterval(pinger, 1000);
      connectionSeconds = 0;

      const messages = document.querySelector('.messages');

      messages.querySelectorAll('[id="connection"]').forEach((child) => {
        child.classList.remove('fadeup');
        child.classList.add('fadedown');
        setTimeout(() => {
          child.remove();
        }, 500);
      });

      const parentMessage = document.createElement('div');
      parentMessage.setAttribute('class', 'message fadeup green');
      parentMessage.setAttribute('id', 'success');
      parentMessage.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
      parentMessage.setAttribute('style', "min-width: auto;");
      const messagetext = document.createElement('p');
      messagetext.setAttribute('id', 'timeout');
      messagetext.setAttribute('style', 'white-space: nowrap;margin: 25px 50px 25px 50px');
      messagetext.textContent = "Server connection has been restored";
      parentMessage.appendChild(messagetext);
      messages.appendChild(parentMessage);

      canvas.style.opacity = 1;
      buttons.style.opacity = 1;
      canvas.classList.remove('fadedown');
      canvas.classList.add('fadeup');
      const message = document.getElementById('success');

      setTimeout(() => {
        message.classList.remove('fadeup');
        message.classList.add('fadedown');
        setTimeout(() => {
          message.remove();
        }, 500);
      }, 2500);
    }

    socket.on('connect', () => {
      if(connectionSeconds != 0) {
        stopConnectionTimer();
      }
    });

    socket.on('connect_error', () => {
      startConnectionTimer();
    });

    socket.on('connect_timeout', () => {
      startConnectionTimer();
    });

    function toggleOP() {
      uiVisible = !uiVisible;
      buttons.style.display = uiVisible ? '' : 'none';
      document.getElementById('resetView').style.display = uiVisible ? '' : 'none';
      document.getElementById('xy').style.display = uiVisible ? '' : 'none';
      document.getElementById('connectedClients').style.display = uiVisible ? '' : 'none';
      document.getElementById('version').style.display = uiVisible ? '' : 'none';
      document.getElementById('ping').style.display = uiVisible ? '' : 'none';
	  document.getElementById('data').style.display = uiVisible ? '' : 'none';
	  chat.style.display = uiVisible ? 'flex' : 'none';
    }
    
    function resetView() {
      canvasContainer.style.transform = `scale(0.08)`;
      canvas.style.transform = `translate(0px, 0px)`;
	  zoomLevel = 0.08;
	  offsetX = 0;
	  offsetY = 0;
    }
    
    function changeColor(event) {
		currentColor = event.target.value;
	}
	
	document.addEventListener('mouseup', () => {
	  isDrawing = false;
	});
	
	canvas.addEventListener('mouseleave', () => {
	  isDrawing = false;
	});

    canvas.addEventListener('mousedown', (event) => {
	  isDrawing = true;
	  addPoint(event);
    });
	
	canvas.addEventListener('mouseup', () => {
		isDrawing = false;
		if (currentDrawing.length > 0) {
			socket.emit('draw', { type: 'draw', drawing: currentDrawing, valid: uuid });
			drawings.push(currentDrawing);
			draw();
			currentDrawing = [];
			lastDrawingEmitTime = Date.now();
		}
	});

    canvas.addEventListener('mousemove', (event) => {
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		const x = Math.round((event.clientX - rect.left) * scaleX);
		const y = Math.round((event.clientY - rect.top) * scaleY);

		tx.innerHTML = x;
		ty.innerHTML = y;

		if (isDrawing) {
			addPoint(event);

			const currentTime = Date.now();
			if (currentTime - lastDrawingEmitTime >= drawingEmitDelay) {
				//socket.emit('draw', { type: 'draw', drawing: currentDrawing, valid: uuid });
				lastDrawingEmitTime = currentTime;
			}
		}
	});
	
	document.getElementById('chat-input').addEventListener('keydown', function(event) {
		if(event.keyCode == 13) {
			socket.emit('message', { uuid: uuid, content: document.getElementById('chat-input').value });
			document.getElementById('chat-input').value = "";
		}
	});
	
	nameinput.addEventListener('keydown', function(event) {
		if(event.keyCode == 13) {
			socket.emit('changeName', { uuid: uuid, name: nameinput.value });
		}
	});
	
	document.addEventListener('keydown', function(event) {
	  if (event.key === 'ArrowUp') {
		pan('up');
	  } else if (event.key === 'ArrowDown') {
		pan('down');
	  } else if (event.key === 'ArrowLeft') {
		pan('left');
	  } else if (event.key === 'ArrowRight') {
		pan('right');
	  }
	});

    function addPoint(event) {
        if (!isDrawing) return;
		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		const x = (event.clientX - rect.left) * scaleX;
		const y = (event.clientY - rect.top) * scaleY;

		currentDrawing.push({ x: Math.round(x), y: Math.round(y), color: currentColor });
		draw();
    }

    function draw() {
	  context.clearRect(0, 0, canvas.width, canvas.height);

		for (const drawing of drawings) {
		  if (drawing.length < 2) continue;

		  for (let i = 1; i < drawing.length; i++) {
			const startPoint = drawing[i - 1];
			const endPoint = drawing[i];

			context.beginPath();
			context.strokeStyle = startPoint.color;
			context.moveTo(Math.round(startPoint.x), Math.round(startPoint.y));
			context.lineTo(Math.round(endPoint.x), Math.round(endPoint.y));
			context.stroke();
		  }
		}

		context.stroke();
	  

	  if (currentDrawing.length > 0) {
		context.beginPath();
		context.strokeStyle = currentColor;
		context.moveTo(Math.round(currentDrawing[0].x), Math.round(currentDrawing[0].y));

		for (let i = 1; i < currentDrawing.length; i++) {
		  const point = currentDrawing[i];
		  context.lineTo(Math.round(point.x), Math.round(point.y));
		}

		context.stroke();
	  }
	}
	
	socket.on('changeName', (data) => {
		document.getElementById('nameStatus').textContent = data.status.message;
		document.getElementById('nameStatus').style.display = "";
		
		setTimeout(() => {
			document.getElementById('nameStatus').style.display = "none";
		}, 5000);
	});
	
	socket.on('chat', (data) => {
		if(data.type == "message") {
			const message = document.createElement('li');
			message.textContent = "<" + data.name + "> " + data.content;
			chat.querySelector('ul').appendChild(message);
			chat.querySelector('.chat-messages').querySelector('ul').scrollTop = chat.querySelector('.chat-messages').querySelector('ul').scrollHeight;
		} else if(data.type == "existingMessages") {
			const messages = JSON.parse(data.messages);
			chat.querySelector('ul').innerHTML = "";
			messages.forEach(entry => {
				const message = document.createElement('li');
				message.textContent = "<" + entry.name + "> " + entry.content;
				chat.querySelector('ul').appendChild(message);
				chat.querySelector('.chat-messages').querySelector('ul').scrollTop = chat.querySelector('.chat-messages').querySelector('ul').scrollHeight;
			});
		}
	});
	
	socket.on('dataSize', (data) => {
		document.getElementById('data').querySelector('p').textContent = "Size: " + data.size + "MB";
		document.getElementById('data').style.opacity = 0.25;
	});
	
	socket.on('play', (data) => {
		if(data.audio != "stop") {
			document.getElementById('audio-player').src = data.audio;
			document.getElementById('audio-player').play();
		} else {
			document.getElementById('audio-player').pause();
		}
	});

	socket.on('announcement', (data) => {
	  if (data.message && data.color) {
		const announcementMessage = data.message;
		const messages = document.querySelector('.messages');

		const announcement = document.createElement('div');
		announcement.setAttribute('class', 'message fadeup ' + data.color);
		announcement.setAttribute('id', announceCount);
		announcement.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.1)";
		const message = document.createElement('p');
		message.setAttribute('style', 'white-space: normal;margin: 25px 50px 25px 50px');
		message.textContent = announcementMessage;
		announcement.appendChild(message);
		messages.appendChild(announcement);
		announceCount++;
		
		announcementIDs.push(announceCount - 1);

		setTimeout(() => {
		  const el = document.getElementById(announceCount - 1);
		  el.classList.remove('fadeup');
		  el.classList.add('fadedown');
		  setTimeout(() => {
			el.style.display = "none";
			el.remove();
		  }, 500);
		}, 5000);
	  }
	});

	function hideMessages() {
	  const parentDiv = document.querySelector('.messages');
	  if (parentDiv) {
		const childDivs = parentDiv.querySelectorAll('div');
		
		if(childDivs.length > 1) {
			childDivs.forEach((child) => {
		  if (child.getAttribute('id') != "connection") {
				child.classList.add('fadedown');
		  }
			});

			setTimeout(() => {
			  childDivs.forEach((child) => {
			if (child.getAttribute('id') != "connection") {
			  child.style.display = 'none';
			  child.remove();
			}
			  });
			}, 500);
		}
	  }
	}

	setInterval(hideMessages, 5000);

	socket.on('connectedClients', (count) => {
	  document.getElementById('clientNum').textContent = `Connected Clients: ${count}`;
	  document.getElementById('connectedClients').style.opacity = 0.25;
	});
	
	socket.on('reload', (count) => {
	  location.reload(true);
	});

	socket.on('version', (version) => {
		document.title = "Collavas v" + version;
		document.getElementById('version').querySelector('p').textContent = "Version: " + version;
		document.getElementById('version').style.opacity = 0.25;
		versionSet = true;
		
		document.getElementById('w-version').textContent = "Collavas v" + version;
	});
		
	socket.on('draw', (data) => {
	  if (data.type === 'draw' && data.drawing) {
		drawings.push(data.drawing);
		draw();
	  } else if (data.type === 'existingDrawings' && data.drawings) {
		const parsedDrawings = JSON.parse(data.drawings);
		const messages = JSON.parse(data.chat);
		drawings = [];
		
		chat.querySelector('ul').innerHTML = "";
		messages.forEach(entry => {
			const message = document.createElement('li');
			message.textContent = "<" + entry.name + "> " + entry.content;
			chat.querySelector('ul').appendChild(message);
			chat.querySelector('.chat-messages').querySelector('ul').scrollTop = chat.querySelector('.chat-messages').querySelector('ul').scrollHeight;
		});
		
		uuid = data.id;
		nameinput.value = data.name;
		setCookie("uuid", uuid, 1);
		
		drawings.push(...parsedDrawings);
		draw();

		document.getElementById('transition').style.opacity = 1;
		document.getElementById('transition').style.visibility = "hidden";
		canvas.style.opacity = 1;
		canvas.style.visibility = "visible";
		buttons.style.opacity = 1;
		chat.style.display = "flex";
		
		if(!getCookie("visited")) {
			var welcome = document.getElementById('welcome');
			welcome.style.display = "flex";
			welcome.style.opacity = 1;
			welcome.querySelector('div').classList.add('fadeup');
			setCookie("visited", "true", 1);
			
			document.getElementById('w-close').addEventListener('click', (event) => {
				welcome.style.opacity = 0;
				welcome.querySelector('div').classList.remove('fadeup');
				welcome.querySelector('div').classList.add('fadedown');
				
				setTimeout(() => {
					welcome.style.display = "none";
				}, 500);
			});
		}
	  }
	});

    let zoomLevel = 0.08;
    const zoomFactor = 0.1;

    let offsetX = 0;
    let offsetY = 0;

    function pan(direction) {
      const panSpeed = 40;

      switch (direction) {
        case 'left':
          offsetX += panSpeed;
          break;
        case 'right':
          offsetX -= panSpeed;
          break;
        case 'up':
          offsetY += panSpeed;
          break;
        case 'down':
          offsetY -= panSpeed;
          break;
        default:
          break;
      }

      updateCanvasContainerPosition();
    }

    function updateCanvasContainerPosition() {
	  if(zoomLevel == 0.08) {
		canvas.style.transform = `0px, 0px)`;
		offsetX = 0;
		offsetY = 0;
	  } else {
		canvas.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
      }
    }
    canvasContainer.addEventListener('wheel', (event) => {
      event.preventDefault();
    
      const scrollAmount = event.deltaY > 0 ? -1 : 1;
      const scaleFactor = 1 + scrollAmount * zoomFactor;
    
      zoomLevel *= scaleFactor;
    
      if (zoomLevel < 0.08) { zoomLevel = 0.08; canvas.style.transform = `translate(0px, 0px)`; updateCanvasContainerPosition(); }
      if (zoomLevel > 20.0) zoomLevel = 20.0;
    
      canvasContainer.style.transform = `scale(${zoomLevel})`;
    });