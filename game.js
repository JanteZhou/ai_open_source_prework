// Game client for Mini MMORPG
class GameClient {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniMapCanvas = document.getElementById('miniMapCanvas');
        this.miniMapCtx = this.miniMapCanvas.getContext('2d');
        this.worldImage = null;
        this.worldWidth = 2048;
        this.worldHeight = 2048;
        
        // Game state
        this.myPlayerId = null;
        this.myPlayer = null;
        this.allPlayers = new Map();
        this.avatars = new Map();
        this.avatarImages = new Map(); // Cached avatar images
        
        // Camera/viewport
        this.cameraX = 0;
        this.cameraY = 0;
        
        // WebSocket
        this.ws = null;
        this.serverUrl = 'wss://codepath-mmorg.onrender.com';
        
        // Movement controls
        this.pressedKeys = new Set();
        this.isMoving = false;
        this.currentDirection = null;
        
        // Sound effects
        this.sounds = {
            footsteps: null,
            ambient: null
        };
        this.soundEnabled = true;
        this.lastFootstepTime = 0;
        this.footstepCooldown = 300; // 300ms between footsteps
        
        // Chat system
        this.chatMessages = new Map(); // playerId -> {message, timestamp}
        this.chatDuration = 3000; // 3 seconds
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupMiniMap();
        this.loadWorldMap();
        this.setupKeyboard();
        this.setupMouse();
        this.setupChatButtons();
        this.setupSounds();
        this.connectToServer();
    }
    
    setupCanvas() {
        // Set canvas size to fill the browser window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            this.draw();
        });
    }
    
    loadWorldMap() {
        this.worldImage = new Image();
        this.worldImage.onload = () => {
            this.draw();
        };
        this.worldImage.onerror = () => {
            console.error('Failed to load world map image');
        };
        this.worldImage.src = 'world.jpg';
    }
    
    setupMiniMap() {
        this.miniMapCanvas.width = 200;
        this.miniMapCanvas.height = 200;
    }
    
    setupChatButtons() {
        const chatButtons = document.querySelectorAll('.chat-btn');
        chatButtons.forEach(button => {
            button.addEventListener('click', () => {
                const message = button.getAttribute('data-message');
                this.sendChatMessage(message);
            });
        });
    }
    
    sendChatMessage(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        // Immediately show the message above our own character
        if (this.myPlayerId) {
            this.chatMessages.set(this.myPlayerId, {
                message: message,
                timestamp: Date.now()
            });
            this.draw(); // Redraw to show the message immediately
        }
        
        const chatMessage = {
            action: 'chat',
            message: message
        };
        
        this.ws.send(JSON.stringify(chatMessage));
    }
    
    drawMiniMap() {
        if (!this.worldImage) return;
        
        // Clear mini-map
        this.miniMapCtx.clearRect(0, 0, this.miniMapCanvas.width, this.miniMapCanvas.height);
        
        // Draw world map (scaled down)
        const scale = Math.min(this.miniMapCanvas.width / this.worldWidth, 
                              this.miniMapCanvas.height / this.worldHeight);
        const scaledWidth = this.worldWidth * scale;
        const scaledHeight = this.worldHeight * scale;
        
        this.miniMapCtx.drawImage(
            this.worldImage,
            0, 0, this.worldWidth, this.worldHeight,
            0, 0, scaledWidth, scaledHeight
        );
        
        // Draw player positions
        this.allPlayers.forEach((player) => {
            const miniMapX = (player.x / this.worldWidth) * scaledWidth;
            const miniMapY = (player.y / this.worldHeight) * scaledHeight;
            
            // Different colors for different players
            if (player.id === this.myPlayerId) {
                this.miniMapCtx.fillStyle = '#00ff00'; // Green for our player
                this.miniMapCtx.fillRect(miniMapX - 2, miniMapY - 2, 4, 4);
            } else {
                this.miniMapCtx.fillStyle = '#ff0000'; // Red for other players
                this.miniMapCtx.fillRect(miniMapX - 1, miniMapY - 1, 2, 2);
            }
        });
        
        // Draw camera viewport
        const viewportX = (this.cameraX / this.worldWidth) * scaledWidth;
        const viewportY = (this.cameraY / this.worldHeight) * scaledHeight;
        const viewportWidth = (this.canvas.width / this.worldWidth) * scaledWidth;
        const viewportHeight = (this.canvas.height / this.worldHeight) * scaledHeight;
        
        this.miniMapCtx.strokeStyle = '#ffff00';
        this.miniMapCtx.lineWidth = 2;
        this.miniMapCtx.strokeRect(viewportX, viewportY, viewportWidth, viewportHeight);
    }
    
    drawChatBubble(player) {
        const chatData = this.chatMessages.get(player.id);
        if (!chatData) return;
        
        // Check if message is still valid
        if (Date.now() - chatData.timestamp > this.chatDuration) {
            this.chatMessages.delete(player.id);
            return;
        }
        
        const screenX = player.x - this.cameraX;
        const screenY = player.y - this.cameraY;
        
        // Only draw if bubble is visible on screen
        if (screenX < -100 || screenX > this.canvas.width + 100 || 
            screenY < -100 || screenY > this.canvas.height + 100) {
            return;
        }
        
        // Draw chat bubble background
        const bubbleWidth = chatData.message.length * 8 + 20;
        const bubbleHeight = 30;
        const bubbleX = screenX - bubbleWidth / 2;
        const bubbleY = screenY - 60; // Above avatar
        
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
        
        // Draw chat bubble border
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bubbleX, bubbleY, bubbleWidth, bubbleHeight);
        
        // Draw chat message text
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(chatData.message, screenX, bubbleY + 20);
    }
    
    setupKeyboard() {
        document.addEventListener('keydown', (event) => {
            this.handleKeyDown(event);
        });
        
        document.addEventListener('keyup', (event) => {
            this.handleKeyUp(event);
        });
    }
    
    handleKeyDown(event) {
        const key = event.key;
        const direction = this.getDirectionFromKey(key);
        
        if (direction && !this.pressedKeys.has(key)) {
            this.pressedKeys.add(key);
            this.sendMoveCommand(direction);
            this.isMoving = true;
            this.currentDirection = direction;
        }
    }
    
    handleKeyUp(event) {
        const key = event.key;
        const direction = this.getDirectionFromKey(key);
        
        if (direction && this.pressedKeys.has(key)) {
            this.pressedKeys.delete(key);
            
            // If no keys are pressed, send stop command
            if (this.pressedKeys.size === 0) {
                this.sendStopCommand();
                this.isMoving = false;
                this.currentDirection = null;
            }
        }
    }
    
    getDirectionFromKey(key) {
        switch (key) {
            case 'ArrowUp':
                return 'up';
            case 'ArrowDown':
                return 'down';
            case 'ArrowLeft':
                return 'left';
            case 'ArrowRight':
                return 'right';
            default:
                return null;
        }
    }
    
    sendMoveCommand(direction) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const moveMessage = {
            action: 'move',
            direction: direction
        };
        
        this.ws.send(JSON.stringify(moveMessage));
    }
    
    sendStopCommand() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const stopMessage = {
            action: 'stop'
        };
        
        this.ws.send(JSON.stringify(stopMessage));
    }
    
    setupMouse() {
        this.canvas.addEventListener('click', (event) => {
            this.handleCanvasClick(event);
        });
    }
    
    handleCanvasClick(event) {
        // Get click position relative to canvas
        const rect = this.canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        
        // Convert screen coordinates to world coordinates
        const worldX = clickX + this.cameraX;
        const worldY = clickY + this.cameraY;
        
        // Send click-to-move command to server
        this.sendClickToMoveCommand(worldX, worldY);
    }
    
    sendClickToMoveCommand(x, y) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        
        const moveMessage = {
            action: 'move',
            x: Math.round(x),
            y: Math.round(y)
        };
        
        this.ws.send(JSON.stringify(moveMessage));
    }
    
    setupSounds() {
        // Create audio context for sound effects
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.createFootstepSound();
            this.createAmbientSound();
        } catch (error) {
            console.log('Audio not supported:', error);
            this.soundEnabled = false;
        }
    }
    
    createFootstepSound() {
        // Create a more realistic footstep sound using Web Audio API
        const bufferSize = this.audioContext.sampleRate * 0.15; // 0.15 second
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            const t = i / this.audioContext.sampleRate;
            
            // Create a more realistic footstep sound
            // Combination of low-frequency thud + high-frequency scrape
            const thud = Math.sin(2 * Math.PI * 80 * t) * Math.exp(-t * 8); // Low thud
            const scrape = (Math.random() * 2 - 1) * Math.exp(-t * 12) * 0.3; // High-frequency scrape
            const click = Math.sin(2 * Math.PI * 200 * t) * Math.exp(-t * 15) * 0.2; // Sharp click
            
            // Combine all elements
            data[i] = (thud + scrape + click) * 0.6;
        }
        
        this.sounds.footsteps = buffer;
    }
    
    createAmbientSound() {
        // Create a simple ambient tone
        const bufferSize = this.audioContext.sampleRate * 2; // 2 seconds
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            // Create a low-frequency ambient tone
            data[i] = Math.sin(2 * Math.PI * 60 * i / this.audioContext.sampleRate) * 0.1;
        }
        
        this.sounds.ambient = buffer;
    }
    
    playFootstepSound() {
        if (!this.soundEnabled || !this.sounds.footsteps) return;
        
        const now = Date.now();
        if (now - this.lastFootstepTime < this.footstepCooldown) {
            return; // Too soon, skip this footstep
        }
        
        this.lastFootstepTime = now;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds.footsteps;
        source.connect(this.audioContext.destination);
        source.start();
    }
    
    playAmbientSound() {
        if (!this.soundEnabled || !this.sounds.ambient) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds.ambient;
        source.loop = true;
        source.connect(this.audioContext.destination);
        source.start();
        
        // Store reference to stop it later
        this.ambientSource = source;
    }
    
    stopAmbientSound() {
        if (this.ambientSource) {
            this.ambientSource.stop();
            this.ambientSource = null;
        }
    }
    
    connectToServer() {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to game server');
            this.joinGame();
            this.playAmbientSound();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleServerMessage(message);
            } catch (error) {
                console.error('Failed to parse server message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from game server');
            this.stopAmbientSound();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    joinGame() {
        const joinMessage = {
            action: 'join_game',
            username: 'Tim'
        };
        
        this.ws.send(JSON.stringify(joinMessage));
    }
    
    handleServerMessage(message) {
        switch (message.action) {
            case 'join_game':
                if (message.success) {
                    this.myPlayerId = message.playerId;
                    this.allPlayers = new Map(Object.entries(message.players));
                    this.avatars = new Map(Object.entries(message.avatars));
                    this.myPlayer = this.allPlayers.get(this.myPlayerId);
                    this.loadAvatarImages();
                    this.updateCamera();
                    this.draw();
                } else {
                    console.error('Failed to join game:', message.error);
                }
                break;
                
            case 'players_moved':
                // Update player positions
                Object.entries(message.players).forEach(([playerId, playerData]) => {
                    this.allPlayers.set(playerId, playerData);
                    
                    // Play footstep sound for our player
                    if (playerId === this.myPlayerId && playerData.isMoving) {
                        this.playFootstepSound();
                    }
                });
                this.updateCamera();
                this.draw();
                break;
                
            case 'player_joined':
                this.allPlayers.set(message.player.id, message.player);
                this.avatars.set(message.avatar.name, message.avatar);
                this.loadAvatarImage(message.avatar);
                this.draw();
                break;
                
            case 'player_left':
                this.allPlayers.delete(message.playerId);
                this.draw();
                break;
                
            case 'chat':
                // Handle chat message from server
                if (message.playerId && message.message) {
                    this.chatMessages.set(message.playerId, {
                        message: message.message,
                        timestamp: Date.now()
                    });
                    this.draw();
                }
                break;
                
            default:
                console.log('Unknown message type:', message.action);
        }
    }
    
    loadAvatarImages() {
        this.avatars.forEach((avatar, name) => {
            this.loadAvatarImage(avatar);
        });
    }
    
    loadAvatarImage(avatar) {
        const avatarKey = avatar.name;
        if (this.avatarImages.has(avatarKey)) return;
        
        const avatarData = {
            name: avatar.name,
            frames: {}
        };
        
        // Load frames for each direction
        Object.entries(avatar.frames).forEach(([direction, frames]) => {
            avatarData.frames[direction] = frames.map(frameData => {
                const img = new Image();
                img.src = frameData;
                return img;
            });
        });
        
        this.avatarImages.set(avatarKey, avatarData);
    }
    
    updateCamera() {
        if (!this.myPlayer) return;
        
        // Center camera on our player
        this.cameraX = this.myPlayer.x - this.canvas.width / 2;
        this.cameraY = this.myPlayer.y - this.canvas.height / 2;
        
        // Clamp camera to world boundaries
        this.cameraX = Math.max(0, Math.min(this.cameraX, this.worldWidth - this.canvas.width));
        this.cameraY = Math.max(0, Math.min(this.cameraY, this.worldHeight - this.canvas.height));
    }
    
    drawAvatar(player) {
        const avatarData = this.avatarImages.get(player.avatar);
        if (!avatarData) return;
        
        const frames = avatarData.frames[player.facing];
        if (!frames || !frames[player.animationFrame]) return;
        
        const avatarImg = frames[player.animationFrame];
        
        // Calculate screen position (world position - camera offset)
        const screenX = player.x - this.cameraX;
        const screenY = player.y - this.cameraY;
        
        // Only draw if avatar is visible on screen
        if (screenX < -50 || screenX > this.canvas.width + 50 || 
            screenY < -50 || screenY > this.canvas.height + 50) {
            return;
        }
        
        // Draw avatar (assuming 32x32 size, adjust as needed)
        const avatarSize = 32;
        this.ctx.drawImage(avatarImg, screenX - avatarSize/2, screenY - avatarSize, avatarSize, avatarSize);
        
        // Draw username label
        this.ctx.fillStyle = 'white';
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 2;
        this.ctx.font = '12px Arial';
        this.ctx.textAlign = 'center';
        
        const textX = screenX;
        const textY = screenY - avatarSize - 5;
        
        // Draw text outline
        this.ctx.strokeText(player.username, textX, textY);
        // Draw text fill
        this.ctx.fillText(player.username, textX, textY);
    }
    
    draw() {
        if (!this.worldImage) return;
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw world map with camera offset
        this.ctx.drawImage(
            this.worldImage,
            this.cameraX, this.cameraY, this.canvas.width, this.canvas.height,
            0, 0, this.canvas.width, this.canvas.height
        );
        
        // Draw all players
        this.allPlayers.forEach((player) => {
            this.drawAvatar(player);
            this.drawChatBubble(player);
        });
        
        // Draw mini-map
        this.drawMiniMap();
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new GameClient();
});
