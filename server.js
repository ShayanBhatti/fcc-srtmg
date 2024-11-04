const http = require('http');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const socketio = require('socket.io');
const nanoid = require('nanoid').nanoid;
const helmet = require('helmet');
const { playerJoin, getPlayers, playerLeave, setPlayerState } = require('./utils/players');
import Collectible from './public/Collectible.mjs';
import gameConfig from './public/gameConfig.mjs';
import generateStartPos from './public/utils/generateStartPos.mjs';
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');
const punycode = require('punycode');


const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Setting security headers with Helmet
app.use(helmet()); // Use Helmet to set some default security headers

// Custom middleware to set specific security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); // Prevent MIME type sniffing
  res.setHeader('X-XSS-Protection', '1; mode=block'); // Enable XSS protection
  res.setHeader('X-Powered-By', 'PHP 7.4.3'); // Spoof X-Powered-By header
  next();
});

// Disable caching
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Serve static files
app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

// Body parser setup
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

console.log("Helmet security headers set up successfully.");

// Serve main index page
app.route('/').get((req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

// FreeCodeCamp testing routes
fccTestingRoutes(app);

// 404 Not Found middleware
app.use((req, res) => {
  res.status(404).type('text').send('Not Found');
});

// Game setup
const playField = gameConfig.playField;
const collectibleSprite = gameConfig.collectibleSprite;
const collectiblePos = generateStartPos(playField, collectibleSprite);
const collectible = new Collectible({
  x: collectiblePos.x,
  y: collectiblePos.y,
  id: nanoid(),
  spriteSrcIndex: Math.floor(Math.random() * collectibleSprite.srcs.length),
});

// Socket.io connections
io.on('connection', (socket) => {
  socket.on('joinGame', (player) => {
    socket.emit('currentOpponents', getPlayers());
    socket.emit('collectible', collectible);

    const currentPlayer = playerJoin(player);
    socket.broadcast.emit('newOpponent', currentPlayer);
  });

  socket.on('playerStateChange', (player) => {
    const updatedPlayer = setPlayerState(player);
    socket.broadcast.emit('opponentStateChange', updatedPlayer);
  });

  socket.on('playerCollideWithCollectible', (player) => {
    player.score += collectible.value;
    socket.emit('scored', player.score);

    const updatedPlayer = setPlayerState(player);
    socket.broadcast.emit('opponentStateChange', updatedPlayer);

    let newCollectiblePos = generateStartPos(playField, collectibleSprite);
    while (newCollectiblePos.x === collectible.x && newCollectiblePos.y === collectible.y) {
      newCollectiblePos = generateStartPos(playField, collectibleSprite);
    }

    const newCollectibleId = nanoid();
    const newCollectibleSpriteSrcIndex = 
      collectible.spriteSrcIndex === collectibleSprite.srcs.length - 1 ? 0 : collectible.spriteSrcIndex + 1;

    collectible.setState({
      x: newCollectiblePos.x,
      y: newCollectiblePos.y,
      id: newCollectibleId,
      spriteSrcIndex: newCollectibleSpriteSrcIndex,
    });
    io.sockets.emit('collectible', collectible);
  });

  socket.on('disconnect', () => {
    const player = playerLeave(socket.id);
    if (player) socket.broadcast.emit('opponentLeave', player.id);
  });
});

const portNum = parseInt(process.env.PORT, 10) || 3000;
server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(() => {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:', error);
      }
    }, 1500);
  }
});

module.exports = server; // For testing
