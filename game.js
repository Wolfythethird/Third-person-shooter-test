// ==================== GAME ENGINE ==================== 
class GameEngine {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameState = {
            running: false,
            paused: false,
            players: [],
            localPlayer: null,
            bullets: [],
            particles: [],
            map: null,
            gameTime: 0,
        };
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        this.setupInputHandlers();
        this.gameLoop();
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupInputHandlers() {
        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.key.toLowerCase()] = true);
        window.addEventListener('keyup', (e) => this.keys[e.key.toLowerCase()] = false);
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.gameState.localPlayer) {
                this.gameState.localPlayer.mouseX = e.clientX;
                this.gameState.localPlayer.mouseY = e.clientY;
            }
        });

        this.canvas.addEventListener('click', () => {
            if (this.gameState.localPlayer && this.gameState.running) {
                this.gameState.localPlayer.shoot();
            }
        });

        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.gameState.localPlayer && this.gameState.running) {
                this.gameState.localPlayer.reload();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                toggleGameMenu();
            }
            if (e.key === 'r' || e.key === 'R') {
                if (this.gameState.localPlayer && this.gameState.running) {
                    this.gameState.localPlayer.reload();
                }
            }
        });
    }

    update(deltaTime) {
        if (!this.gameState.running || this.gameState.paused) return;

        this.gameState.gameTime += deltaTime;

        // Update local player
        if (this.gameState.localPlayer) {
            this.gameState.localPlayer.update(deltaTime, this.keys);
            this.gameState.localPlayer.checkMapBounds(this.gameState.map);
        }

        // Update other players
        this.gameState.players.forEach(player => {
            if (player !== this.gameState.localPlayer) {
                player.update(deltaTime, {});
            }
        });

        // Update bullets
        this.gameState.bullets = this.gameState.bullets.filter(bullet => {
            bullet.update(deltaTime);
            
            // Check collisions with players
            this.gameState.players.forEach(player => {
                if (player !== bullet.owner && bullet.checkCollision(player)) {
                    player.takeDamage(bullet.damage);
                    bullet.active = false;
                    
                    // Create particle effect
                    this.createExplosion(bullet.x, bullet.y, 10);
                }
            });

            // Check map collision
            if (!this.gameState.map.isWithinBounds(bullet.x, bullet.y)) {
                bullet.active = false;
            }

            return bullet.active;
        });

        // Update particles
        this.gameState.particles = this.gameState.particles.filter(p => {
            p.update(deltaTime);
            return p.alive;
        });

        // Remove dead players
        this.gameState.players = this.gameState.players.filter(p => p.health > 0);
    }

    render() {
        this.ctx.fillStyle = '#1a1a2e';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (!this.gameState.running) return;

        // Save camera state
        this.ctx.save();

        // Apply camera follow
        if (this.gameState.localPlayer) {
            const cameraX = this.gameState.localPlayer.x - this.canvas.width / 2;
            const cameraY = this.gameState.localPlayer.y - this.canvas.height / 2;
            this.ctx.translate(-cameraX, -cameraY);
        }

        // Render map
        if (this.gameState.map) {
            this.gameState.map.render(this.ctx);
        }

        // Render players
        this.gameState.players.forEach(player => {
            player.render(this.ctx);
        });

        // Render bullets
        this.gameState.bullets.forEach(bullet => {
            bullet.render(this.ctx);
        });

        // Render particles
        this.gameState.particles.forEach(particle => {
            particle.render(this.ctx);
        });

        this.ctx.restore();

        // Render HUD
        this.renderHUD();
    }

    renderHUD() {
        if (this.gameState.localPlayer) {
            const health = this.gameState.localPlayer.health;
            const maxHealth = this.gameState.localPlayer.maxHealth;
            const healthPercent = (health / maxHealth) * 100;

            document.getElementById('healthValue').textContent = Math.max(0, Math.round(health));
            document.getElementById('healthFill').style.width = Math.max(0, healthPercent) + '%';
            document.getElementById('ammoCount').textContent = 
                `${this.gameState.localPlayer.ammo}/${this.gameState.localPlayer.maxAmmo}`;
            document.getElementById('playerName').textContent = 
                `${this.gameState.localPlayer.name} (${this.gameState.localPlayer.characterType})`;

            // Update reload indicator
            const reloadIndicator = document.getElementById('reloadIndicator');
            if (this.gameState.localPlayer.isReloading) {
                const reloadPercent = (this.gameState.localPlayer.reloadTime / 2) * 100;
                reloadIndicator.classList.add('active');
                reloadIndicator.style.width = reloadPercent + '%';
            } else {
                reloadIndicator.classList.remove('active');
                reloadIndicator.style.width = '0%';
            }
        }

        // Update player list
        this.updatePlayerList();
        this.updateMiniMap();
    }

    updatePlayerList() {
        const playerList = document.getElementById('playerList');
        let html = '';

        this.gameState.players.sort((a, b) => b.kills - a.kills);

        this.gameState.players.forEach(player => {
            const healthPercent = (player.health / player.maxHealth) * 100;
            const isLocal = player === this.gameState.localPlayer ? 'local' : '';
            const isDead = player.health <= 0 ? 'dead' : '';
            
            html += `
                <div class="player-list-item ${isLocal} ${isDead}">
                    <span>${player.name}</span>
                    <span>${player.kills}K / ${player.deaths}D</span>
                </div>
            `;
        });

        playerList.innerHTML = html;
    }

    updateMiniMap() {
        const miniMap = document.getElementById('miniMap');
        if (!miniMap) return;
        const miniCtx = miniMap.getContext('2d');

        miniCtx.fillStyle = 'rgba(26, 26, 46, 0.9)';
        miniCtx.fillRect(0, 0, miniMap.width, miniMap.height);

        if (!this.gameState.map) return;

        const mapScale = Math.min(
            miniMap.width / this.gameState.map.width,
            miniMap.height / this.gameState.map.height
        );

        // Draw map bounds
        miniCtx.strokeStyle = '#4ECDC4';
        miniCtx.lineWidth = 2;
        miniCtx.strokeRect(0, 0, this.gameState.map.width * mapScale, this.gameState.map.height * mapScale);

        // Draw players
        this.gameState.players.forEach(player => {
            if (player === this.gameState.localPlayer) {
                miniCtx.fillStyle = '#90EE90';
            } else {
                miniCtx.fillStyle = '#FF6B6B';
            }

            miniCtx.fillRect(
                player.x * mapScale - 2,
                player.y * mapScale - 2,
                4, 4
            );
        });
    }

    createExplosion(x, y, count) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count;
            const velocity = {
                x: Math.cos(angle) * 150,
                y: Math.sin(angle) * 150
            };

            this.gameState.particles.push(new Particle(x, y, velocity, 0.5));
        }
    }

    gameLoop = () => {
        const now = Date.now();
        const deltaTime = (now - (this.lastFrameTime || now)) / 1000;
        this.lastFrameTime = now;

        this.update(deltaTime);
        this.render();

        requestAnimationFrame(this.gameLoop);
    };

    startGame(characterType, mapType) {
        this.gameState.map = new GameMap(mapType);
        this.gameState.running = true;
        this.gameState.paused = false;
        
        // Create local player
        const spawn = this.gameState.map.getRandomSpawnPoint();
        this.gameState.localPlayer = new Player(
            spawn.x,
            spawn.y,
            characterType,
            localStorage.getItem('username') || 'Player'
        );

        this.gameState.players = [this.gameState.localPlayer];

        // Connect to multiplayer server
        if (window.networkManager) {
            window.networkManager.joinGame(characterType);
        }
    }

    pauseGame() {
        this.gameState.paused = true;
    }

    resumeGame() {
        this.gameState.paused = false;
    }

    endGame() {
        this.gameState.running = false;
        this.gameState.paused = false;
        this.gameState.players = [];
        this.gameState.bullets = [];
        this.gameState.particles = [];
    }
}

// ==================== PLAYER CLASS ==================== 
class Player {
    constructor(x, y, characterType, name) {
        this.x = x;
        this.y = y;
        this.characterType = characterType;
        this.name = name;
        this.radius = 20;
        this.speed = 200;
        this.angle = 0;
        this.mouseX = 0;
        this.mouseY = 0;

        // Character stats
        this.characterStats = {
            nigiri: { speed: 280, health: 80, damage: 12, fireRate: 0.1 },
            roll: { speed: 200, health: 100, damage: 15, fireRate: 0.12 },
            tempura: { speed: 120, health: 150, damage: 20, fireRate: 0.15 },
            maki: { speed: 240, health: 70, damage: 25, fireRate: 0.08 }
        };

        const stats = this.characterStats[characterType];
        this.speed = stats.speed;
        this.maxHealth = stats.health;
        this.health = stats.health;
        this.baseDamage = stats.damage;
        this.fireRate = stats.fireRate;
        this.lastShotTime = 0;

        // Weapon system
        this.ammo = 30;
        this.maxAmmo = 120;
        this.isReloading = false;
        this.reloadTime = 0;
        this.reloadDuration = 2;

        // Combat
        this.kills = 0;
        this.deaths = 0;
        this.invulnerabilityTime = 0;

        this.velocityX = 0;
        this.velocityY = 0;
    }

    update(deltaTime, keys) {
        // Movement
        let moveX = 0, moveY = 0;

        if (keys['w'] || keys['arrowup']) moveY -= 1;
        if (keys['s'] || keys['arrowdown']) moveY += 1;
        if (keys['a'] || keys['arrowleft']) moveX -= 1;
        if (keys['d'] || keys['arrowright']) moveX += 1;

        // Normalize diagonal movement
        if (moveX !== 0 || moveY !== 0) {
            const magnitude = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= magnitude;
            moveY /= magnitude;
        }

        this.velocityX = moveX * this.speed;
        this.velocityY = moveY * this.speed;

        this.x += this.velocityX * deltaTime;
        this.y += this.velocityY * deltaTime;

        // Update angle to face mouse
        this.angle = Math.atan2(this.mouseY - this.y, this.mouseX - this.x);

        // Update reload
        if (this.isReloading) {
            this.reloadTime += deltaTime;
            if (this.reloadTime >= this.reloadDuration) {
                this.ammo = this.maxAmmo;
                this.isReloading = false;
                this.reloadTime = 0;
            }
        }

        // Update invulnerability
        if (this.invulnerabilityTime > 0) {
            this.invulnerabilityTime -= deltaTime;
        }
    }

    shoot() {
        const currentTime = Date.now();
        if (currentTime - this.lastShotTime < (this.fireRate * 1000)) return;
        if (this.ammo <= 0 || this.isReloading) return;

        this.ammo--;
        this.lastShotTime = currentTime;

        const bullet = new Bullet(
            this.x,
            this.y,
            this.angle,
            this.baseDamage,
            this
        );

        window.gameEngine.gameState.bullets.push(bullet);

        // Send to server
        if (window.networkManager) {
            window.networkManager.sendShot(this.x, this.y, this.angle);
        }
    }

    reload() {
        if (this.isReloading || this.ammo === this.maxAmmo) return;
        this.isReloading = true;
        this.reloadTime = 0;

        if (window.networkManager) {
            window.networkManager.sendReload();
        }
    }

    takeDamage(damage) {
        if (this.invulnerabilityTime > 0) return;

        this.health -= damage;
        this.invulnerabilityTime = 0.2; // Invulnerability frames

        window.gameEngine.createExplosion(this.x, this.y, 5);

        if (this.health <= 0) {
            this.deaths++;
        }
    }

    checkMapBounds(map) {
        if (!map) return;

        if (this.x - this.radius < map.x) this.x = map.x + this.radius;
        if (this.x + this.radius > map.x + map.width) this.x = map.x + map.width - this.radius;
        if (this.y - this.radius < map.y) this.y = map.y + this.radius;
        if (this.y + this.radius > map.y + map.height) this.y = map.y + map.height - this.radius;
    }

    render(ctx) {
        // Draw invulnerability flash
        if (this.invulnerabilityTime > 0 && Math.floor(this.invulnerabilityTime * 10) % 2) {
            ctx.globalAlpha = 0.5;
        }

        // Character visual (sushi style)
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Sushi body
        const colors = {
            nigiri: ['#FFE66D', '#FFC93D'],
            roll: ['#FF6B6B', '#FF5555'],
            tempura: ['#FF9500', '#FF7700'],
            maki: ['#90EE90', '#76C776']
        };

        ctx.fillStyle = colors[this.characterType][0];
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius, this.radius * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(-8, -5, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(8, -5, 4, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(-8, -5, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(8, -5, 2, 0, Math.PI * 2);
        ctx.fill();

        // Gun barrel
        ctx.strokeStyle = colors[this.characterType][1];
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.radius + 10, 0);
        ctx.stroke();

        ctx.restore();

        // Name tag
        ctx.fillStyle = '#FFE66D';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(this.name, this.x, this.y + this.radius + 20);

        ctx.globalAlpha = 1;
    }
}

// ==================== BULLET CLASS ==================== 
class Bullet {
    constructor(x, y, angle, damage, owner) {
        this.x = x + Math.cos(angle) * 20;
        this.y = y + Math.sin(angle) * 20;
        this.angle = angle;
        this.speed = 500;
        this.damage = damage;
        this.owner = owner;
        this.radius = 5;
        this.active = true;
        this.lifetime = 5; // seconds
        this.age = 0;
    }

    update(deltaTime) {
        this.x += Math.cos(this.angle) * this.speed * deltaTime;
        this.y += Math.sin(this.angle) * this.speed * deltaTime;
        this.age += deltaTime;

        if (this.age > this.lifetime) {
            this.active = false;
        }
    }

    checkCollision(player) {
        const dx = this.x - player.x;
        const dy = this.y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < this.radius + player.radius;
    }

    render(ctx) {
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Bullet trail
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(
            this.x - Math.cos(this.angle) * 30,
            this.y - Math.sin(this.angle) * 30
        );
        ctx.stroke();
    }
}

// ==================== PARTICLE CLASS ==================== 
class Particle {
    constructor(x, y, velocity, lifetime = 1) {
        this.x = x;
        this.y = y;
        this.vx = velocity.x;
        this.vy = velocity.y;
        this.lifetime = lifetime;
        this.age = 0;
        this.alive = true;
        this.radius = Math.random() * 4 + 2;
    }

    update(deltaTime) {
        this.x += this.vx * deltaTime;
        this.y += this.vy * deltaTime;
        this.vy += 300 * deltaTime; // gravity

        this.age += deltaTime;
        if (this.age >= this.lifetime) {
            this.alive = false;
        }
    }

    render(ctx) {
        const alpha = 1 - (this.age / this.lifetime);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#FFD700';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// ==================== MAP CLASS ==================== 
class GameMap {
    constructor(type) {
        this.type = type;
        this.x = 0;
        this.y = 0;

        const mapData = {
            temple: { width: 1200, height: 800, theme: 'temple' },
            market: { width: 1600, height: 1200, theme: 'market' },
            mountain: { width: 1400, height: 1000, theme: 'mountain' },
            dojo: { width: 800, height: 600, theme: 'dojo' }
        };

        const data = mapData[type];
        this.width = data.width;
        this.height = data.height;
        this.theme = data.theme;

        this.generateSpawnPoints();
        this.generateObstacles();
    }

    generateSpawnPoints() {
        const padding = 100;
        this.spawnPoints = [
            { x: padding, y: padding },
            { x: this.width - padding, y: padding },
            { x: padding, y: this.height - padding },
            { x: this.width - padding, y: this.height - padding },
            { x: this.width / 2, y: padding },
            { x: this.width / 2, y: this.height - padding }
        ];
    }

    generateObstacles() {
        this.obstacles = [];
        const obstacleCount = Math.floor(Math.random() * 8) + 5;

        for (let i = 0; i < obstacleCount; i++) {
            this.obstacles.push({
                x: Math.random() * (this.width - 200) + 100,
                y: Math.random() * (this.height - 200) + 100,
                width: Math.random() * 100 + 50,
                height: Math.random() * 100 + 50
            });
        }
    }

    getRandomSpawnPoint() {
        return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    }

    isWithinBounds(x, y) {
        return x > this.x && x < this.x + this.width && y > this.y && y < this.y + this.height;
    }

    render(ctx) {
        // Background
        const bgColors = {
            temple: { light: '#D4A574', dark: '#8B6F47' },
            market: { light: '#FFB6C1', dark: '#FF69B4' },
            mountain: { light: '#A9A9A9', dark: '#708090' },
            dojo: { light: '#8B0000', dark: '#DC143C' }
        };

        const colors = bgColors[this.theme];
        ctx.fillStyle = colors.light;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Checkered pattern
        ctx.fillStyle = colors.dark;
        for (let i = 0; i < this.width; i += 40) {
            for (let j = 0; j < this.height; j += 40) {
                if ((i / 40 + j / 40) % 2 === 0) {
                    ctx.fillRect(i, j, 40, 40);
                }
            }
        }

        // Border
        ctx.strokeStyle = '#FFE66D';
        ctx.lineWidth = 3;
        ctx.strokeRect(this.x, this.y, this.width, this.height);

        // Obstacles
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.obstacles.forEach(obs => {
            ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
            ctx.strokeStyle = 'rgba(255, 230, 109, 0.5)';
            ctx.lineWidth = 2;
            ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);
        });
    }
}

// Initialize game engine
window.gameEngine = new GameEngine();
