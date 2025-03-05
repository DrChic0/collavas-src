const fs = require('fs');
const winston = require('winston');
const path = require('path');

const logDir = 'logs';
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

const getLogFileName = () => {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.log`;
};

const createLogger = () => {
    const logFileName = path.join(logDir, getLogFileName());

    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] [${level.toUpperCase()}] ${message}`)
        ),
        transports: [
            new winston.transports.File({ filename: logFileName }),
            new winston.transports.Console()
        ],
        handleExceptions: true
    });
};

let logger = createLogger();

const rotateLogs = () => {
    const newLogFileName = getLogFileName();
    const currentLogFileName = logger.transports.find(t => t instanceof winston.transports.File).filename;

    if (newLogFileName !== path.basename(currentLogFileName)) {
        logger = createLogger();
    }
};

setInterval(rotateLogs, 24 * 60 * 60 * 1000);

console.log = (msg) => logger.info(msg);
console.error = (msg) => logger.error(msg);

const yaml = require('yaml');
let config = yaml.parse(fs.readFileSync('config.yaml', 'utf8'));

console.log(consoleInfo("info") + "Starting Collavas server v" + config.version);
console.log(consoleInfo("info") + "Loading Dependencies...");
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const readline = require('readline');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
let users = JSON.parse(fs.readFileSync("users.json", 'utf-8'));

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIO(server);

console.log(consoleInfo("info") + "Successfully started!");

const DRAWINGS_FILE = 'drawings.json';

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

let drawings = loadDrawings();
let messages = JSON.parse(fs.readFileSync("chat.json", 'utf-8'));;
let changesCounter = 0;
let count = 0;
let connectedClients = 0;
let enabled = true;
let consolelog = true;
let loadExistingDrawings = true;
let chat = [];

messages.forEach(message => {
    const messageUserIndex = users.findIndex(user => user.uuid == message.uuid);
    const messageUser = users[messageUserIndex];
                
    if (messageUser) {
        message.name = (messageUser.name.trim() != "" ? messageUser.name : "user_" + messageUserIndex);
        chat.push(message);
    }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', (input) => {
  const commandParts = input.trim().split(' ');
  const command = commandParts.shift();
  const colorIndex = commandParts.findIndex(part => ['blue', 'indigo', 'purple', 'pink', 'red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'white', 'gray', 'gray-dark', 'primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark'].includes(part));
  let message, color;
  if (colorIndex !== -1) {
    color = commandParts[colorIndex];
    message = commandParts.slice(0, colorIndex).join(' ');
  } else {
    message = commandParts.join(' ');
  }
  switch (command) {
	  case 'announce':
      announce(message, color);
      break;
	  case 'reload':
      reloadall();
      break;
	  case 'play':
      playaudio(message);
      break;
	  case 'save':
      saveDrawings();
	  drawings = loadDrawings();
      break;
	  case 'users':
	  console.log(JSON.stringify(users));
      break;
	  case 'remove':
	  users = users.filter(item => item !== message);
	  console.log(consoleInfo("info") + "Removed " + message);
      break;
	  case 'drawTog':
	  enabled = (enabled) ? false : true;
	  console.log(consoleInfo("info") + ((enabled) ? "Enabled drawing" : "Disabled drawing"));
      break;
	  case 'loadTog':
	  loadExistingDrawings = (loadExistingDrawings) ? false : true;
	  console.log(consoleInfo("info") + ((loadExistingDrawings) ? "Enabled loading existing drawings" : "Disabled loading existing drawings"));
      break;
	  case 'logTog':
	  consolelog = (consolelog) ? false : true;
	  console.log(consoleInfo("info") + ((consolelog) ? "Enabled console logging" : "Disabled console logging"));
      break;
	  case 'exit':
      exitServer();
      break;
    default:
      console.log(`${consoleInfo("info")} Unknown command: ${command}`);
  }
});

function announce(message, color = 'white') {
  console.log(`${consoleInfo("info")} Announcement: ${message} (Color: ${color})`);
  io.emit('announcement', { message, color });
}

function reloadall() {
  io.emit('reload');
}

function playaudio(link) {
  var id = uuidv4();
  var directory = "C:/nginx/web/www.collavas.com/public/static/audio/";
  
  if(link != "stop") {
	  if (!fs.existsSync(directory)) {
		fs.mkdirSync(directory, { recursive: true });
	  }
	  
	  console.log(consoleInfo("info") + "Downloading...");
	  axios({
		method: 'get',
		url: link,
		responseType: 'stream'
	  })
	  .then(response => {
		response.data.pipe(fs.createWriteStream(directory + id + ".mp3"));
		link = "/static/audio/" + id + ".mp3";
		
		setTimeout(() => {
			io.emit('play', { audio: link });
			console.log(consoleInfo("info") + "Done, now playing to clients");
		}, 5000);
	  })
	  .catch(error => {
		console.error(consoleInfo("info") + 'Error downloading the MP3 file:', error);
	  });
  } else {
	  io.emit('play', { audio: "stop" });
	  console.log(consoleInfo("info") + "Stopped");
  }
}

function exitServer() {
  console.log(consoleInfo("info") + "Server is shutting down...");
  saveDrawings();
  saveChat();
  setTimeout(() => {
	  process.exit(0);
  }, 500);
}

io.on('connection', (socket) => {
  connectedClients++;
  updateConsole();
  
  io.emit('dataSize', { size: (fs.statSync(DRAWINGS_FILE).size / (1024 * 1024)).toFixed(2) });
  io.emit('connectedClients', connectedClients);
  io.emit('version', config.version);
  
  let userFound = false;
  
  users.forEach(entry => {
    if(entry.ip == socket.handshake.headers['x-forwarded-for']) {
        const userIndex = users.findIndex(user => user.uuid == entry.uuid);
        const user = users[userIndex];

        if(user) {
            if(!entry.name) {
                users[userIndex].name = "";
                entry.name = "";
            }

            if(!entry.lastNameChange) {
                users[userIndex].lastNameChange = new Date();
            }

            if(!entry.lastChat) {
                users[userIndex].lastChat = new Date();
            }

            userFound = true;

            if(loadExistingDrawings) {
                socket.emit('draw', { type: 'existingDrawings', drawings: JSON.stringify(drawings), id: entry.uuid, name: entry.name, chat: JSON.stringify(chat) });
            }

            socket.emit('chat', { type: 'existingMessages', messages: JSON.stringify(chat) });
        }
    }
  });
  
  if(!userFound) {
	  const uuid = uuidv4();
	  users.push({ uuid: uuid, name: "", ip: socket.handshake.headers['x-forwarded-for'], lastdraw: new Date(), lastNameChange: new Date(), lastChat: new Date() });
	  
	  if(loadExistingDrawings) {
		socket.emit('draw', { type: 'existingDrawings', drawings: JSON.stringify(drawings), id: uuid, name: "", chat: JSON.stringify(chat) });
	  }
  }
  
  socket.on('changeName', (data) => {
	  const invalidChars = /[<>\s;:.\)\(*&^%$?/#\-+=\\|"@!~`]/;
	  
	  if(invalidChars.test(data.name)) {
		  socket.emit('changeName', { status: { message: "Invalid characters" } });
	  } else if(users.find(user => user.name == data.name) && data.name.trim() != "") {
		  socket.emit('changeName', { status: { message: "A user already exists with this name" } });
	  } else if(new Date().getTime() - new Date(users.find(user => user.uuid == data.uuid).lastNameChange).getTime() < 10000) {
		  socket.emit('changeName', { status: { message: "Wait before you change your name again" } });
	  } else {
		  users[users.findIndex(user => user.uuid == data.uuid)].name = data.name;
		  users[users.findIndex(user => user.uuid == data.uuid)].lastNameChange = new Date();
		  socket.emit('changeName', { status: { message: "Successfully changed name" } });
	  }
  });
  
  socket.on('message', (data) => {
	  if (data && typeof data.content === 'string' && data.content.trim() != "" && data.content.length < 150) {
		const user = users.find(user => user.uuid == data.uuid);
		if (user && new Date().getTime() - new Date(user.lastChat).getTime() > 1000) {
		  data.date = new Date();
		  messages.push(data);
		  users[users.findIndex(entry => entry.uuid == data.uuid)].lastChat = new Date();
		  io.emit('chat', { 
			type: 'message', 
			uuid: data.uuid, 
			name: (user.name.trim() != "" ? user.name : "user_" + users.findIndex(entry => entry.uuid == data.uuid)), 
			content: data.content 
		  });
		  saveChat();
		}
	  }
	});
  
  socket.on('draw', (data) => {
	const keysOrder = JSON.stringify(Object.keys(data));
    if (keysOrder == JSON.stringify(["type", "drawing", "valid"]) && data.type === 'draw' && data.drawing && data.drawing.length > 1 && data.valid /*&& data.drawing[1] && !(data.drawing[0].x < 100) && !(data.drawing[data.drawing.length - 1].x > 9000) */&& users.find(user => user.uuid == data.valid) && enabled) {
	  const entry = users.find(user => user.uuid == data.valid);
	  console.log(new Date().getTime() - entry.lastdraw + " " + new Date().getTime());
	  
	  if (new Date().getTime() - new Date(entry.lastdraw).getTime() < 2000) {
		if(consolelog) {
			console.error(consoleInfo("info") + 'Drawing data exceeds the maximum size. Seconds: ' + new Date().getTime() - new Date(entry.lastdraw).getTime() + ' Length: ' + data.drawing.length);
		}
		socket.emit('drawLimit');
		
		/*
		data.drawing = data.drawing.slice(0, 25);
		drawings.push(data.drawing);
		saveDrawings();
		drawings = loadDrawings();
		socket.emit('dataSize', { size: (fs.statSync(DRAWINGS_FILE).size / (1024 * 1024)).toFixed(2) });
		*/
      } else {
		socket.broadcast.emit('draw', { type: 'draw', drawing: data.drawing });
		drawings.push(data.drawing);
		users[users.findIndex(user => user.uuid == data.valid)].lastdraw = new Date();
		
		if(consolelog) {
			console.log(consoleInfo("info") + data.valid + " " + JSON.stringify(data));
		}
		
		if(count > 10) {
			saveDrawings();
			drawings = loadDrawings();
			socket.emit('dataSize', { size: (fs.statSync(DRAWINGS_FILE).size / (1024 * 1024)).toFixed(2) });
			count = 0;
		} else {
			count++;
		}
	  }
    } else {
		if(consolelog) {
			console.log(consoleInfo("info") + "Drawing not authenticated" + " " + data.valid);
		}
		socket.emit('drawLimit');
	}
  });

  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on('disconnect', () => {
    connectedClients--;
    updateConsole();
    io.emit('connectedClients', connectedClients);
  });
});

server.listen(config.port, () => {
  console.log(consoleInfo("info") + 'Server is running on port ' + config.port);
  updateConsole();
});

function removeDuplicates(arr) {
  if (!Array.isArray(arr)) {
    return [];
  }

  function isEqual(obj1, obj2) {
    return obj1.x === obj2.x && obj1.y === obj2.y && obj1.color === obj2.color;
  }

  const uniqueArrays = arr.map(innerArray =>
    innerArray.filter((elem, index) =>
      index === innerArray.findIndex((t) => isEqual(t, elem))
    )
  );

  return uniqueArrays;
}

function loadDrawings() {
  try {
    const data = fs.readFileSync(DRAWINGS_FILE, 'utf-8');
    return JSON.parse(data) || [];
  } catch (error) {
    console.error(consoleInfo("error") + 'Error loading drawings:', error.message);
    return [];
  }
}


function saveDrawings() {
  console.log(consoleInfo("info") + "Saving drawings");
  try {
    fs.writeFileSync(DRAWINGS_FILE, JSON.stringify(removeDuplicates(drawings)), 'utf-8');
	console.log(consoleInfo("info") + "Drawings saved");
  } catch (error) {
    console.error(consoleInfo("error") + 'Error saving drawings:', error.message);
  }
}

function saveChat() {
  console.log(consoleInfo("info") + "Saving chat");
  try {
    fs.writeFileSync("chat.json", JSON.stringify(messages), 'utf-8');
	console.log(consoleInfo("info") + "Chat saved");
  } catch (error) {
    console.error(consoleInfo("error") + 'Error saving chat:', error.message);
  }
}

function updateConsole() {
  if(consolelog) {
	console.log(`${consoleInfo("info")}Connected Clients: ${io.sockets.sockets.size}`);
  }
}

function consoleInfo(type) {
	const currentDate = new Date();
	return "";
	//return "[" + currentDate.getFullYear() + "-" + String(currentDate.getMonth() + 1).padStart(2, '0') + "-" + String(currentDate.getDate()).padStart(2, '0') + " " + String(currentDate.getHours()).padStart(2, '0') + ":" + String(currentDate.getMinutes()).padStart(2, '0') + ":" + String(currentDate.getSeconds()).padStart(2, '0') + "] [" + type.toUpperCase() + "] ";
}