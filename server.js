const http = require('http');
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const socketio = require('socket.io');

const nanoid = require('nanoid').nanoid;
const helmet = require('helmet');
// Importing utils and modules
const { playerJoin, getPlayers, playerLeave, setPlayerState } = require('./utils/players');
import Collectible from './public/Collectible.mjs';
import gameConfig from './public/gameConfig.mjs';
import generateStartPos from './public/utils/generateStartPos.mjs';
const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();
const server = http.createServer(app);
const io = socketio(server);
// Serving static files
app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

 // Prevent MIME type sniffing
  app.use(helmet.noSniff());

  // Prevent XSS attacks using the X-XSS-Protection header (as per Helmet 3.21.3)
  app.use(helmet.xssFilter());

  // Set cache-control headers manually to prevent caching
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    next();
  });

  // Spoof the X-Powered-By header to say "PHP 7.4.3"
  app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' }));

  console.log("Helmet security headers set up successfully.");


// Index page (static HTML)
app.route('/').get(function (req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

// For FCC testing purposes
fccTestingRoutes(app);

// 404 Not Found Middleware
app.use(function (req, res, next) {
  res.status(404).type('text').send('Not Found');
});

// Randomly generate collectible item's position
const playField = gameConfig.playField;
const collectibleSprite = gameConfig.collectibleSprite;
const collectiblePos = generateStartPos(playField, collectibleSprite);
// Instantiate a collectible item object
const collectible = new Collectible({
  x: collectiblePos.x,
  y: collectiblePos.y,
  id: nanoid(),
  // Randomly select a collectible item sprite
  spriteSrcIndex: Math.floor(Math.random() * collectibleSprite.srcs.length),
});

// Run when client connects
io.on('connection', (socket) => {
  socket.on('joinGame', (player) => {
    const currentPlayers = getPlayers();
    // Send opponents to the client
    socket.emit('currentOpponents', currentPlayers);
    // Send the collectible item to the client
    socket.emit('collectible', collectible);

    const currentPlayer = playerJoin(player);
    // Broadcast the new player
    socket.broadcast.emit('newOpponent', currentPlayer);
  });

  socket.on('playerStateChange', (player) => {
    const updatedPlayer = setPlayerState(player);
    // Broadcast the updated player info
    socket.broadcast.emit('opponentStateChange', updatedPlayer);
  });

  socket.on('playerCollideWithCollectible', (player) => {
    // Update player's score
    player.score += collectible.value;
    // Send the updated score to the client
    socket.emit('scored', player.score);

    const updatedPlayer = setPlayerState(player);
    // Broadcast the updated player
    socket.broadcast.emit('opponentStateChange', updatedPlayer);

    // Generate new position for the collectible item
    let newCollectiblePos = generateStartPos(playField, collectibleSprite);
    // Regenerate the new position if it is the same with the previous
    // position
    while (
      newCollectiblePos.x === collectible.x &&
      newCollectiblePos.y === collectible.y
    ) {
      newCollectiblePos = generateStartPos(playField, collectibleSprite);
    }

    const newCollectibleId = nanoid();
    // Select the next collectible item sprite
    const newCollectibleSpriteSrcIndex =
      collectible.spriteSrcIndex === collectibleSprite.srcs.length - 1
        ? 0
        : collectible.spriteSrcIndex + 1;
    // Update collectible item's state
    collectible.setState({
      x: newCollectiblePos.x,
      y: newCollectiblePos.y,
      id: newCollectibleId,
      spriteSrcIndex: newCollectibleSpriteSrcIndex,
    });
    // Send the new(updated) collectible item to all clients
    io.sockets.emit('collectible', collectible);
  });

  // Run when player disconnects
  socket.on('disconnect', () => {
    const player = playerLeave(socket.id);
    socket.broadcast.emit('opponentLeave', player.id);
  });
});

const portNum = process.env.PORT || 3000;

// Set up server and tests
server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    },5000);
  }
});

module.exports = server; // For testing
