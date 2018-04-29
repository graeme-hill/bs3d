(() => {

const CELL_SPACING = 0.0;
const SNAKE_SPACING = 0.0;
const SNAKE_MOVE_MILLIS = 200;
const TILE_HEIGHT = 1;
const GROUND_SIZE = 10000;
const SNAKE_INOUT_MILLIS = 100;
const TILE_INOUT_MILLIS = 200;
const SNAKE_START_DELAY = 200;
const SNAKE_FLOAT_HEIGHT = 2.5;

const time = {
    now: performance.now(),
    delta: 0
};

class World {
    constructor() {
        this.init();
        this.tick();
    }

    init() {
        this.camera = new THREE.PerspectiveCamera(
            70, window.innerWidth / window.innerHeight, 1, 1000
        );
        this.scene = new THREE.Scene();

        // Tiles
        const halfCellSpacing = CELL_SPACING / 2;
        this.tileGeometry = new THREE.BoxBufferGeometry(
            1 - halfCellSpacing, TILE_HEIGHT, 1 - halfCellSpacing
        );
        this.tileMaterial = new THREE.MeshLambertMaterial({
            color: 0xdddddd
        });
        this.tileMaterialDark = new THREE.MeshLambertMaterial({
            color: 0xbbbbbb
        });

        // Snakes
        const halfSnakeSpacing = SNAKE_SPACING / 2;
        const snakePartShortGeom = new THREE.BoxBufferGeometry(
            1 - halfSnakeSpacing, 1 - halfSnakeSpacing, 1 - halfSnakeSpacing
        );
        snakePartShortGeom.doubleSided = true;
        const snakePartLongGeom = new THREE.BoxBufferGeometry(
            1, 1 - halfSnakeSpacing, 1 - halfSnakeSpacing
        );
        snakePartLongGeom.doubleSided = true;
        this.snakeGeometry = new SnakeGeometry(
            snakePartShortGeom, snakePartLongGeom
        );

        // Food
        this.foodGeom = new THREE.SphereGeometry(0.3, 16, 16);
        this.foodMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000
        });
        this.foods = [];

        // Ground
        this.groundGeom = new THREE.PlaneBufferGeometry(
            GROUND_SIZE, GROUND_SIZE);
        this.groundMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0xffffff, 1);
        //this.renderer.shadowMap.enabled = true;

        document.body.appendChild(this.renderer.domElement);
        window.addEventListener('resize', () => this.onWindowResize(), false);

        this.animations = new AnimController();
    }

    setupLighting(board) {
        // Directional (sun) light that casts shadows
        this.light = new THREE.DirectionalLight(0xffffff, 1);
        this.light.color.setHSL(1, 1, 1);
        this.light.position.set(-1, 3, -2.5);
        this.light.position.multiplyScalar(30);
        this.scene.add(this.light);

        this.light.castShadow = true;
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        
        const d = Math.max(board.width, board.height) / 4;
        this.light.shadow.camera.left = -d;
        this.light.shadow.camera.right = d;
        this.light.shadow.camera.top = d;
        this.light.shadow.camera.bottom = -d;

        this.light.shadow.camera.far = 3500;
        this.light.shadow.bias = 0;

        // Ambient light that stops unlit surfaces from being too dark
        const ambient = new THREE.AmbientLight(0x808080);
        this.scene.add(ambient);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    tick() {
        this.update();
        requestAnimationFrame(() => this.tick());
        this.renderer.render(this.scene, this.camera);
    }

    update() {
        updateFrameTime();
        this.animations.update();
    }

    clearScene() {
        while (this.scene.children.length) {
            this.scene.remove(this.scene.children[0]);
        }
    }

    placeCamera(board) {
        this.camera.position.x = board.width / 2;
        this.camera.position.y = Math.max(board.width, board.height) * .7;
        this.camera.position.z = board.height * 1.0;
        this.camera.far = board.height * 10;
        this.camera.lookAt(new THREE.Vector3(
            this.camera.position.x, board.height * -1, 0));
    }

    placeSnake(snake) {
        const snakeMesh = new SnakeMesh(snake, this.snakeGeometry);
        for (const mesh of snakeMesh.partMeshes) {
            this.scene.add(mesh);
        }
        return snakeMesh;
    }

    placeGround(board) {
        const groundMesh = new THREE.Mesh(
            this.groundGeom, this.groundMaterial);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.y = -3;
        this.scene.add(groundMesh);
    }

    tileStartHeight() {
        return -TILE_HEIGHT * 5;
    }

    resetBoard(board) {
        this.tileMeshes = [];

        for (let row = 0; row < board.height; row++) {
            for (let col = 0; col < board.width; col++) {
                const mat = (col + 1) % 2 === 0 ^ (row + 1) % 2 === 0 ?
                    this.tileMaterialDark :
                    this.tileMaterial;
                const tileMesh = new THREE.Mesh(this.tileGeometry, mat);
                tileMesh.position.x = col;
                tileMesh.position.y = this.tileStartHeight();
                tileMesh.position.z = row;
                tileMesh.receiveShadow = true;
                tileMesh.castShadow = false;
                this.scene.add(tileMesh);
                this.tileMeshes.push(tileMesh);
            }
        }
    }

    resetSnakes(snakes) {
        this.snakeMeshes = snakes.map(s => this.placeSnake(s));
    }

    reset(board, snakes) {
        return this.tearDown().then(() => {
            return this.setup(board, snakes);
        });
    }

    tearDown() {
        return this.board ? this.animateOut() : Promise.resolve();
    }

    setup(board, snakes) {
        this.board = board;

        this.clearScene();
        this.setupLighting(board);
        this.placeCamera(board);

        this.resetBoard(board);
        this.resetSnakes(snakes);
        this.placeGround(board);

        this.ready = this.animateIn().then(() => {
            this.startSnakes();
        });

        return this.ready;
    }

    startSnakes() {
        this.snakeMeshes.forEach(s => s.start());
    }

    nextFrame(frame) {
        this.updateSnakes(frame.snakes);
        this.updateFood(frame.food);
    }

    updateSnakes(snakes) {
        for (let i = 0; i < snakes.length; i++) {
            this.snakeMeshes[i].next(
                snakes[i], this.scene, this.animations);
        }
    }

    animateIn() {
        return this.tilesAnimateIn().then(() => {
            const promises = this.snakeMeshes.map(
                s => s.animateIn(this.animations));
            return Promise.all(promises);
        });
    }

    tilesAnimateIn() {
        const promises = [];
        const origin = new THREE.Vector3(
            0, 0, 0);
        const boardSize = Math.max(this.board.width, this.board.height);
        for (const tile of this.tileMeshes) {
            const d = Math.abs(origin.distanceTo(tile.position)) / boardSize;
            const delay = d * 500;
            const anim = this.animations.create(
                tile.position.y, -TILE_HEIGHT, TILE_INOUT_MILLIS, delay);
            promises.push(anim.promise);
            anim.tick(y => tile.position.y = y);
        }
        return Promise.all(promises);
    }

    animateOut() {
        const promises = this.snakeMeshes.map(
            s => s.animateOut(this.animations));
        promises.push(this.tilesAnimateOut());
        return Promise.all(promises);
    }

    tilesAnimateOut() {
        const promises = [];
        const origin = new THREE.Vector3(
            0, 0, 0);
        const boardSize = Math.max(this.board.width, this.board.height);
        for (const tile of this.tileMeshes) {
            const d = Math.abs(origin.distanceTo(tile.position)) / boardSize;
            const delay = d * 500;
            const anim = this.animations.create(
                tile.position.y,
                this.tileStartHeight(),
                TILE_INOUT_MILLIS,
                delay);
            promises.push(anim.promise);
            anim.tick(y => tile.position.y = y);
        }
        return Promise.all(promises);
    }

    removeEatenFood(food) {
        this.scene.remove(food.mesh);
        const index = this.foods.indexOf(food);
        this.foods.splice(index, 1);
    }

    spawnFood(pos) {
        const f = new FoodMesh(
            this.scene, pos, this.foodGeom, this.foodMaterial);
        return f.animateIn();
    }

    updateFood(newFoods) {
        const toAdd = [];
        const toRemove = [];

        // N^2 WCGW
        for (const newFood of newFoods) {
            const existing = this.foods.find(
                f => f.x === newFood.x && f.y === newFood.y);
            if (!existing) {
                toAdd.push(newFood);
            }
        }

        for (const existing of this.foods) {
            const newFood = newFoods.find(
                f => f.x === existing.x && f.y === existing.y);
            if (!newFood) {
                toRemove.push(existing);
            }
        }

        for (const addition of toAdd) {
            this.spawnFood(addition);
        }

        for (const removal of toRemove) {
            this.removeEatenFood(removal);
        }
    }
}

class AnimController {
    constructor() {
        this.animations = [];
    }

    create(a, b, duration, delay) {
        delay = delay || 0;
        const start = time.now + delay;
        let resolve = null;
        const promise = new Promise((res, reject) => {
            resolve = res;
        });
        const handle = new AnimHandle(promise);
        this.animations.push({
            a, b, start, duration, handle, resolve, promise
        });
        return handle;
    }

    update() {
        for (const anim of this.animations) {
            this.updateAnim(anim);
        }
    }

    updateAnim(anim) {
        if (anim.stopped) {
            this.clearAnim(anim);
            return;
        }

        if (time.now < anim.start) {
            // This animation is still waiting to start at some time in future
            return;
        }

        const current = interpolate(anim.a, anim.b, anim.start, anim.duration);
        if (anim.handle.tickCallback) {
            anim.handle.tickCallback(current);
        }

        if (current === anim.b) {
            anim.resolve();
            this.clearAnim(anim);
        }
    }

    clearAnim(anim) {
        const index = this.animations.indexOf(anim);
        if (index >= 0) {
            this.animations.splice(index, 1);
        }
    }
}

class AnimHandle {
    constructor(promise) {
        this.promise = promise;
    }

    tick(callback) {
        this.tickCallback = callback;
        return this;
    }

    done(callback) {
        return this.promise.then(callback);
    }

    stop() {
        this.stopped = true;
    }
}

class Board {
    constructor(w, h) {
        this.width = w;
        this.height = h;
    }
}

class Snake {
    constructor(color, body) {
        this.color = color;
        this.body = body;
    }
}

class SnakeGeometry{
    constructor(end, link) {
        this.end = end;
        this.link = link;
    }
}

class FoodMesh {
    constructor(scene, pos, geom, material) {
        this.pos = pos;
        this.mesh = new THREE.Mesh(geom, material);
        this.mesh.position.set(pos.x, 0, pos.y);
        scene.add(this.mesh);
    }

    animateIn() {
        return Promise.resolve();
    }

    animateOut() {
        return Promise.resolve();
    }
}

class SnakeMesh {
    constructor(snake, geometry) {
        this.material = new THREE.MeshLambertMaterial({
            color: snake.color,
            transparent: true,
            opacity: 0.0
        });
        this.geometry = geometry;
        this.snake = snake;
        this.movePromise = Promise.resolve();
        this.init();
    }

    init() {
        //this.moveQueue = [];
        //this.moving = false;
        //this.gameStarted = false;
        this.readyPromise = new Promise((resolve, reject) => {
            this.setReady = resolve;
        });

        this.partMeshes = this.snake.body.map((part, i) => {
            const geo = i === (this.snake.body.length - 1) ?
                this.geometry.end :
                this.geometry.link;
            const mesh = new THREE.Mesh(geo, this.material);
            mesh.position.set(part.x, SNAKE_FLOAT_HEIGHT, part.y);
            mesh.castShadow = true;
            return mesh;
        });
    }

    start() {
        this.setReady();
        //this.gameStarted = true;
        //this.popMove();
    }

    tailIsBunched(body) {
        if (body.length < 2) {
            return false;
        }

        const tail = body[body.length - 1];
        const next = body[body.length - 2];

        return tail.x === next.x && tail.y === next.y;
    }

    next(snakeFrame, scene, anim) {
        const wait = Promise.all([this.readyPromise, this.movePromise]);
        console.log("next()...");
        this.movePromise = wait.then(() => {
            console.log("proceeding with next()");
            const head = this.snake.body[0];
            const newHead = snakeFrame.body[0];
            const direction = getDirection(head, newHead);
    
            console.log(head.x, head.y, newHead.x, newHead.y);
            console.log("should go " + direction);
    
            if (!direction) {
                return;
            }
    
            const advanceTail =
                this.snake.body.length === snakeFrame.body.length;
            // const newTail = snakeFrame.body[snakeFrame.body.length - 1];
            // const sameSpot = tail.x === newTail.x && tail.y === newTail.y;
    
            // const oldBunched = this.tailIsBunched(this.snake.body);
            // const newBunched = this.tailIsBunched(snakeFrame.body);
            // const advanceTail = ~oldBunched && 
    
            return this.doMove(direction, advanceTail, scene, anim, newHead);

            // this.moveQueue.unshift({
            //     direction, advanceTail, scene, anim, newHead
            // });
            // this.popMove();
        });

        return this.movePromise;
    }

    doMove(direction, advanceTail, scene, anim, newHead) {
        console.log("going " + direction);
        //this.moving = true;

        // Add new head block in same spot
        const delta = directionToCoordDelta(direction);
        const newHeadMesh = new THREE.Mesh(this.geometry.end, this.material);
        newHeadMesh.castShadow = true;
        const prevHead = this.partMeshes[0];
        newHeadMesh.position.set(
            prevHead.position.x, 0, prevHead.position.z);
        this.partMeshes.unshift(newHeadMesh);
        console.log('nh', newHead.x, newHead.y);
        this.snake.body.unshift(newHead);
        scene.add(newHeadMesh);

        // Animate the new head forward
        const xAnim = anim.create(
            newHeadMesh.position.x,
            newHeadMesh.position.x + delta.x,
            SNAKE_MOVE_MILLIS);
        xAnim.tick(x => newHeadMesh.position.x = x);
        const zAnim = anim.create(
            newHeadMesh.position.z,
            newHeadMesh.position.z + delta.z,
            SNAKE_MOVE_MILLIS);
        zAnim.tick(z => newHeadMesh.position.z = z);

        const promises = [xAnim.promise, zAnim.promise];

        // Animate tail forward and then remove it after anim
        if (advanceTail) {
            promises.push(this.moveTailForward(scene, anim));
        }

        return Promise.all(promises);
    }

    moveTailForward(scene, anim) {
        const tail = this.partMeshes[this.partMeshes.length - 1];
        const next = this.partMeshes[this.partMeshes.length - 2];
        const horizontal = tail.position.z === next.position.z;
        const tailAnim = horizontal ?
            anim.create(tail.position.x, next.position.x, SNAKE_MOVE_MILLIS) :
            anim.create(tail.position.z, next.position.z, SNAKE_MOVE_MILLIS);
        if (horizontal) {
            tailAnim.tick(x => tail.position.x = x);
        } else {
            tailAnim.tick(z => tail.position.z = z);
        }

        return tailAnim.promise.then(() => {
            //this.moving = false;
            scene.remove(tail);
            this.partMeshes.splice(-1, 1);
            this.snake.body.splice(-1, 1);
        });
    }

    animateIn(anim) {
        const promises = [];
        const opacityAnim = anim.create(0, 1, SNAKE_INOUT_MILLIS);
        opacityAnim.tick(o => this.material.opacity = o);
        promises.push(opacityAnim.promise);
        for (const m of this.partMeshes) {
            const yAnim = anim.create(
                m.position.y, 0, SNAKE_INOUT_MILLIS);
            yAnim.tick(y => m.position.y = y);
            promises.push(yAnim.promise);
        }
        return Promise.all(promises);
    }

    animateOut(anim) {
        const promises = [];
        const opacityAnim = anim.create(1, 0, SNAKE_INOUT_MILLIS);
        opacityAnim.tick(o => this.material.opacity = o);
        promises.push(opacityAnim.promise);
        for (const m of this.partMeshes) {
            const yAnim = anim.create(
                m.position.y, SNAKE_FLOAT_HEIGHT, SNAKE_INOUT_MILLIS);
            yAnim.tick(y => m.position.y = y);
            promises.push(yAnim.promise);
        }
        return Promise.all(promises);
    }
}

function interpolate(a, b, start, duration) {
    // just hard code to linear for now
    const progress = (time.now - start) / duration;
    if (progress >= 1) {
        return b;
    }
    return a + ((b - a) * progress);
}

function updateFrameTime() {
    const now = performance.now();
    time.delta = now - time.now;
    time.now = now;
}

function directionToCoordDelta(direction) {
    switch (direction) {
        case "left": return { x: -1, z: 0 };
        case "right": return { x: 1, z: 0 };
        case "up": return { x: 0, z: -1 };
        default: return { x: 0, z: 1 };
    }
}

function setupDragDrop(acceptLines) {
    window.addEventListener("dragover",function(e){
        e = e || event;
        e.preventDefault();
    },false);

    window.addEventListener("drop",function(e){
        e = e || event;
        e.preventDefault();
        readFile(e, content => {
            lines = content.split('\n');
            acceptLines(lines);
        });
        removeDragData(e);
    },false);

    function readContent(file, cb) {
        const reader = new FileReader();
        reader.readAsText(file);
        reader.onloadend = () => {
            cb(reader.result);
        };
    }

    function readFile(e, cb) {
        if (e.dataTransfer.items) {
            for (let i = 0; i < e.dataTransfer.items.length; i++) {
                if (e.dataTransfer.items[i].kind === 'file') {
                    const file = e.dataTransfer.items[i].getAsFile();
                    return readContent(file, cb);
                }
            }
        } else {
            for (let i = 0; i < e.dataTransfer.files.length; i++) {
                return readContent(e.dataTransfer.files[i], cb);
            }
        }
    }

    function removeDragData(e) {
        if (e.dataTransfer.items) {
            e.dataTransfer.items.clear();
        } else {
            e.dataTransfer.clearData();
        }
    }
}

function getDirection(a, b) {
    const xDiff = a.x - b.x;
    if (xDiff < 0) {
        return "right";
    } else if (xDiff > 0) {
        return "left";
    }

    const yDiff = a.y - b.y;
    if (yDiff < 0) {
        return "down";
    } else if (yDiff > 0) {
        return "up";
    }

    return null;
}

function parseHeader(line) {
    return JSON.parse(line);
}

function parseFrames(lines) {
    return lines.map(l => {
        try {
            return JSON.parse(l);
        } catch (e) {
            return null;
        }
    }).filter(f => !!f);
}

function createGame(header, frames) {
    const board = new Board(header.width, header.height);
    const snakes = header.snakes.map(
        (s, i) => new Snake(s.color, frames[0].snakes[i].body));
    return { board, snakes, frames };
}

function parse(lines) {
    if (lines.length < 2) {
        return;
    }

    const header = parseHeader(lines[0]);
    if (!header) {
        return;
    }

    const frames = parseFrames(lines.slice(1));
    if (!frames) {
        return;
    }

    return createGame(header, frames);
}

function playFrames(world, frames) {
    for (const frame of frames) {
        world.nextFrame(frame);
    }
}

(() => {
    const world = new World();

    setupDragDrop(lines => {
        const game = parse(lines);
        if (!game) {
            console.error("can't parse game :(");
        }
        world.reset(game.board, game.snakes).then(() => {
            playFrames(world, game.frames);
        });
    });
})();

})();