class Game {
  constructor() {
    if (!Detector.webgl) Detector.addGetWebGLMessage();

    this.modes = Object.freeze({
      NONE: Symbol("none"),
      PRELOAD: Symbol("preload"),
      INITIALISING: Symbol("initialising"),
      CREATING_LEVEL: Symbol("creating_level"),
      ACTIVE: Symbol("active"),
      GAMEOVER: Symbol("gameover"),
    });
    this.mode = this.modes.NONE;

    this.container;
    this.stats;
    this.controls;
    this.camera;
    this.scene;
    this.renderer;
    this.interactive = false;
    this.levelIndex = 0;
    this._hints = 0;
    this.score = 0;
    this.debug = false;
    this.debugPhysics = false;
    this.fixedTimeStep = 1.0 / 60.0;
    this.js = { forward: 0, turn: 0 };
    this.assetsPath = "./assets/";

    this.messages = {
      text: ["Welcome to Skyblade."],
      index: 0,
    };

    if (localStorage && !this.debug) {
    }

    this.container = document.createElement("div");
    this.container.style.height = "100%";
    document.body.appendChild(this.container);

    const sfxExt = SFX.supportsAudioType("mp3") ? "mp3" : "ogg";
    const game = this;

    const options = {
      assets: [
        "./assets/rc_time_trial.fbx",
        "./assets/images/logo.png",
        "./assets/images/nx.jpg",
        "./assets/images/px.jpg",
        "./assets/images/ny.jpg",
        "./assets/images/py.jpg",
        "./assets/images/nz.jpg",
        "./assets/images/pz.jpg",
        `${this.assetsPath}sfx/bump.${sfxExt}`,
        `${this.assetsPath}sfx/click.${sfxExt}`,
        `${this.assetsPath}sfx/engine.${sfxExt}`,
        `${this.assetsPath}sfx/skid.${sfxExt}`,
      ],
      oncomplete: function () {
        //game.init();
        //game.animate();
      },
    };

    for (let i = 0; i <= 16; i++) {
      let path;
      if (i < 10) {
        path = `${this.assetsPath}images/carparts000${i}.png`;
      } else {
        path = `${this.assetsPath}images/carparts00${i}.png`;
      }
      options.assets.push(path);
    }

    this.mode = this.modes.PRELOAD;
    this.motion = { forward: 0, turn: 0 };
    this.clock = new THREE.Clock();

    this.initSfx();

    this.carGUI = [0, 0, 0, 0, 0];

    if ("ontouchstart" in window) {
      document
        .getElementById("reset-btn")
        .addEventListener("touchstart", function () {
          game.resetCar();
        });
    } else {
      document.getElementById("reset-btn").onclick = function () {
        game.resetCar();
      };
    }

    let index = 0;
    document.getElementById("part-select").childNodes.forEach(function (node) {
      if (node.nodeType == 1) {
        const i = index;
        node.onclick = function () {
          game.carGUIHandler(i);
        };
        index++;
      }
    });

    document.getElementById("play-btn").onclick = function () {
      game.startGame();
    };

    const preloader = new Preloader(options);

    window.onError = function (error) {
      console.error(JSON.stringify(error));
    };
  }

  carGUIHandler(part) {
    //0 - Body, 1 - Aerial, 2 - Engine, 3 - Exhaust, 4 - Wheels
    this.sfx.click.play();
    this.carGUI[part]++;
    if (this.carGUI[part] > 3) this.carGUI[part] = 0;
    const index = this.carGUI[part] == 0 ? 0 : this.carGUI[part] + part * 3 + 1;
    const layer =
      document.getElementById("car-parts").childNodes[(6 - part) * 2 - 1];
    if (index < 10) {
      layer.attributes.src.value = `${this.assetsPath}images/carparts000${index}.png`;
    } else {
      layer.attributes.src.value = `${this.assetsPath}images/carparts00${index}.png`;
    }
  }

  startGame() {
    this.sfx.click.play();
    const parts = [
      "a Body",
      "an Aerial",
      "an Engine",
      "an Exhaust",
      "some Wheels",
    ];
    let index = 0;
    let configured = true;
    this.carGUI.forEach(function (item) {
      if (item == 0) {
        showMessage(`Please select ${parts[index]}`);
        configured = false;
      }
      index++;
    });

    if (!configured) {
      this.sfx.skid.play();
      return;
    }

    //Hide the GUI
    const gui = ["part-select", "car-parts", "message", "play-btn"];
    gui.forEach(function (id) {
      document.getElementById(id).style.display = "none";
    });

    document.getElementById("reset-btn").style.display = "block";

    this.sfx.engine.play();
    this.init();
    this.animate();

    function showMessage(msg) {
      const elm = document.getElementById("message");
      elm.innerHTML = msg;
    }
  }

  makeWireframe(mode = true, model = this.assets) {
    const game = this;

    if (model.isMesh) {
      if (Array.isArray(model.material)) {
        model.material.forEach(function (material) {
          material.wireframe = mode;
        });
      } else {
        model.material.wireframe = mode;
      }
    }

    model.children.forEach(function (child) {
      if (child.children.length > 0) {
        game.makeWireframe(mode, child);
      } else if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(function (material) {
            material.wireframe = mode;
          });
        } else {
          child.material.wireframe = mode;
        }
      }
    });
  }

  resetCar() {
    this.sfx.skid.play();
    let checkpoint;
    let distance = 10000000000;
    const carPos = this.vehicle.chassisBody.position;
    this.checkpoints.forEach(function (obj) {
      const pos = obj.position.clone();
      pos.y = carPos.y;
      const dist = pos.distanceTo(carPos);
      if (dist < distance) {
        checkpoint = obj;
        distance = dist;
      }
    });
    this.vehicle.chassisBody.position.copy(checkpoint.position);
    this.vehicle.chassisBody.quaternion.copy(checkpoint.quaternion);
    this.vehicle.chassisBody.velocity.set(0, 0, 0);
    this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
  }

  initSfx() {
    this.sfx = {};
    this.sfx.context = new (window.AudioContext || window.webkitAudioContext)();
    this.sfx.bump = new SFX({
      context: this.sfx.context,
      src: {
        mp3: `${this.assetsPath}sfx/bump.mp3`,
        ogg: `${this.assetsPath}sfx/bump.ogg`,
      },
      loop: false,
      volume: 0.3,
    });
    this.sfx.click = new SFX({
      context: this.sfx.context,
      src: {
        mp3: `${this.assetsPath}sfx/click.mp3`,
        ogg: `${this.assetsPath}sfx/click.ogg`,
      },
      loop: false,
      volume: 0.3,
    });
    this.sfx.engine = new SFX({
      context: this.sfx.context,
      src: {
        mp3: `${this.assetsPath}sfx/engine.mp3`,
        ogg: `${this.assetsPath}sfx/engine.ogg`,
      },
      loop: true,
      volume: 0.1,
    });
    this.sfx.skid = new SFX({
      context: this.sfx.context,
      src: {
        mp3: `${this.assetsPath}sfx/skid.mp3`,
        ogg: `${this.assetsPath}sfx/skid.ogg`,
      },
      loop: false,
      volume: 0.3,
    });
  }

  init() {
    this.mode = this.modes.INITIALISING;

    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      1,
      500
    );
    this.camera.position.set(0, 6, -15);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    //this.scene.fog = new THREE.Fog( 0xa0a0a0, 20, 100 );

    // LIGHTS
    const ambient = new THREE.AmbientLight(0xaaaaaa);
    this.scene.add(ambient);

    const light = new THREE.DirectionalLight(0xaaaaaa);
    light.position.set(30, 100, 40);
    light.target.position.set(0, 0, 0);

    light.castShadow = true;

    const lightSize = 30;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 500;
    light.shadow.camera.left = light.shadow.camera.bottom = -lightSize;
    light.shadow.camera.right = light.shadow.camera.top = lightSize;

    light.shadow.bias = 0.0039;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;

    this.sun = light;
    this.scene.add(light);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);

    if ("ontouchstart" in window) {
      //this.renderer.domElement.addEventListener('touchstart', function(evt){ game.tap(evt); });
    } else {
      //this.renderer.domElement.addEventListener('mousedown', function(evt){ game.tap(evt); });
    }

    this.loadAssets();

    window.addEventListener(
      "resize",
      function () {
        game.onWindowResize();
      },
      false
    );

    // stats
    if (this.debug) {
      this.stats = new Stats();
      this.container.appendChild(this.stats.dom);
    }

    this.joystick = new JoyStick({
      game: this,
      onMove: this.joystickCallback,
    });
  }

  loadAssets() {
    const game = this;
    const loader = new THREE.FBXLoader();

    loader.load(
      "./assets/rc_time_trial.fbx",
      function (object) {
        let material, map, index, maps;
        const euler = new THREE.Euler();
        game.proxies = {};
        game.checkpoints = [];

        object.traverse(function (child) {
          let receiveShadow = true;
          if (child.isMesh) {
            if (child.name.includes("SkyBox")) {
              child.visible = false;
            } else if (child.name == "Chassis") {
              game.car = {
                chassis: child,
                bonnet: [],
                engine: [],
                wheel: [],
                seat: [],
                xtra: [],
                selected: {},
              };
              game.followCam = new THREE.Object3D();
              game.followCam.position.copy(game.camera.position);
              game.scene.add(game.followCam);
              game.followCam.parent = child;
              game.sun.target = child;
              child.castShadow = true;
              receiveShadow = false;
            } else if (child.name.includes("Bonnet")) {
              game.car.bonnet.push(child);
              child.visible = false;
              child.castShadow = true;
              receiveShadow = false;
            } else if (child.name.includes("Engine")) {
              game.car.engine.push(child);
              child.visible = false;
              child.castShadow = true;
              receiveShadow = false;
            } else if (child.name.includes("Seat")) {
              game.car.seat.push(child);
              child.visible = false;
              receiveShadow = false;
            } else if (
              child.name.includes("Wheel") &&
              child.children.length > 0
            ) {
              game.car.wheel.push(child);
              child.parent = game.scene;
              child.visible = false;
              child.castShadow = true;
              receiveShadow = false;
            } else if (child.name.includes("Xtra")) {
              game.car.xtra.push(child);
              child.visible = false;
              child.castShadow = true;
              receiveShadow = false;
            } else if (child.name.includes("ProxyKitchen")) {
              game.proxies.main = child;
              child.visible = false;
            } else if (child.name == "CarProxyB") {
              game.proxies.car = child;
              child.visible = false;
            } else if (child.name == "ConeProxy") {
              game.proxies.cone = child;
              child.visible = false;
            } else if (child.name == "ShadowBounds") {
              child.visible = false;
            } else if (child.name == "CarShadow") {
              child.visible = false;
            }

            //child.castShadow = true;
            child.receiveShadow = receiveShadow;
          } else {
            if (child.name.includes("Checkpoint")) {
              game.checkpoints.push(child);
              child.position.y += 1;
            }
          }
        });

        game.customiseCar();

        game.assets = object;
        game.scene.add(object);

        const tloader = new THREE.CubeTextureLoader();
        tloader.setPath("./assets/images/");

        var textureCube = tloader.load([
          "px.jpg",
          "nx.jpg",
          "py.jpg",
          "ny.jpg",
          "pz.jpg",
          "nz.jpg",
        ]);

        game.scene.background = textureCube;

        game.initPhysics();
      },
      null,
      function (error) {
        console.error(error);
      }
    );
  }

  reset() {}

  customiseCar() {
    const bonnet = this.carGUI[0] - 1;
    const engine = this.carGUI[2] - 1;
    const exhaust = this.carGUI[3] - 1;
    const wheel = this.carGUI[4] - 1;
    const aerial = this.carGUI[1] - 1;
    this.car.bonnet[bonnet].visible = true;
    this.car.engine[engine].visible = true;
    this.car.seat[exhaust].visible = true;
    this.car.wheel[wheel].visible = true;
    this.car.xtra[aerial].visible = true;
    this.car.selected.bonnet = this.car.bonnet[bonnet];
    this.car.selected.engine = this.car.engine[engine];
    this.car.selected.seat = this.car.seat[exhaust];
    this.car.selected.wheel = this.car.wheel[wheel];
    this.car.selected.xtra = this.car.xtra[aerial];
  }

  updatePhysics() {
    if (this.physics.debugRenderer !== undefined)
      this.physics.debugRenderer.scene.visible = true;
  }

  initPhysics() {
    this.physics = {};

    const game = this;
    const mass = 150;
    const world = new CANNON.World();
    this.world = world;

    world.broadphase = new CANNON.SAPBroadphase(world);
    world.gravity.set(0, -10, 0);
    world.defaultContactMaterial.friction = 0;

    const groundMaterial = new CANNON.Material("groundMaterial");
    const wheelMaterial = new CANNON.Material("wheelMaterial");
    const wheelGroundContactMaterial = new CANNON.ContactMaterial(
      wheelMaterial,
      groundMaterial,
      {
        friction: 0.3,
        restitution: 0,
        contactEquationStiffness: 1000,
      }
    );

    // We must add the contact materials to the world
    world.addContactMaterial(wheelGroundContactMaterial);

    //const chassisShape = this.createCannonConvex(this.proxies.car.geometry);
    const chassisShape = new CANNON.Box(new CANNON.Vec3(1, 0.3, 2));
    const chassisBody = new CANNON.Body({ mass: mass });
    const pos = this.car.chassis.position.clone();
    pos.y += 1;
    chassisBody.addShape(chassisShape);
    chassisBody.position.copy(pos);
    chassisBody.angularVelocity.set(0, 0, 0);
    chassisBody.threemesh = this.car.chassis;

    this.followCam = new THREE.Object3D();
    this.followCam.position.copy(this.camera.position);
    this.scene.add(this.followCam);
    this.followCam.parent = chassisBody.threemesh;

    const options = {
      radius: 0.3,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 45,
      suspensionRestLength: 0.4,
      frictionSlip: 5,
      dampingRelaxation: 2.3,
      dampingCompression: 4.5,
      maxSuspensionForce: 200000,
      rollInfluence: 0.01,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
      maxSuspensionTravel: 0.25,
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
    };

    // Create the vehicle
    const vehicle = new CANNON.RaycastVehicle({
      chassisBody: chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    });

    const axlewidth = 0.8;
    options.chassisConnectionPointLocal.set(axlewidth, 0, -1);
    vehicle.addWheel(options);

    options.chassisConnectionPointLocal.set(-axlewidth, 0, -1);
    vehicle.addWheel(options);

    options.chassisConnectionPointLocal.set(axlewidth, 0, 1);
    vehicle.addWheel(options);

    options.chassisConnectionPointLocal.set(-axlewidth, 0, 1);
    vehicle.addWheel(options);

    vehicle.addToWorld(world);

    const wheelBodies = [];
    let index = 0;
    const wheels = [this.car.selected.wheel];
    this.car.selected.wheel.children[0].visible = true;
    this.car.selected.wheel.children[0].castShadow = true;
    for (let i = 0; i < 3; i++) {
      let wheel = this.car.selected.wheel.clone();
      this.scene.add(wheel);
      wheels.push(wheel);
    }

    vehicle.wheelInfos.forEach(function (wheel) {
      const cylinderShape = new CANNON.Cylinder(
        wheel.radius,
        wheel.radius,
        wheel.radius / 2,
        20
      );
      const wheelBody = new CANNON.Body({ mass: 1 });
      const q = new CANNON.Quaternion();
      q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
      wheelBody.addShape(cylinderShape, new CANNON.Vec3(), q);
      wheelBodies.push(wheelBody);
      wheelBody.threemesh = wheels[index++];
    });
    game.car.wheels = wheelBodies;
    // Update wheels
    world.addEventListener("postStep", function () {
      let index = 0;
      game.vehicle.wheelInfos.forEach(function (wheel) {
        game.vehicle.updateWheelTransform(index);
        const t = wheel.worldTransform;
        wheelBodies[index].threemesh.position.copy(t.position);
        wheelBodies[index].threemesh.quaternion.copy(t.quaternion);
        index++;
      });
    });

    this.vehicle = vehicle;

    /*const mainProxy = this.createCannonTrimesh(this.proxies.main.geometry);
		const mainBody = new CANNON.Body({mass:0});
		mainBody.position.copy(this.proxies.main.position);
		mainBody.quaternion.copy(this.proxies.main.quaternion);
		mainBody.addShape(mainProxy);
		world.add(mainBody);*/

    this.createColliders();

    if (this.debugPhysics)
      this.debugRenderer = new THREE.CannonDebugRenderer(
        this.scene,
        this.world
      );
  }

  createColliders() {
    const world = this.world;
    const scaleAdjust = 0.9;
    const divisor = 2 / scaleAdjust;
    this.assets.children.forEach(function (child) {
      if (child.isMesh && child.name.includes("Collider")) {
        child.visible = false;
        const halfExtents = new CANNON.Vec3(
          child.scale.x / divisor,
          child.scale.y / divisor,
          child.scale.z / divisor
        );
        const box = new CANNON.Box(halfExtents);
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(box);
        body.position.copy(child.position);
        body.quaternion.copy(child.quaternion);
        world.add(body);
      }
    });
  }

  joystickCallback(forward, turn) {
    this.js.forward = -forward;
    this.js.turn = -turn;
  }

  updateDrive(forward = this.js.forward, turn = this.js.turn) {
    this.sfx.engine.volume = Math.abs(forward) * 0.1;

    const maxSteerVal = 0.6;
    const maxForce = 500;
    const brakeForce = 10;

    const force = maxForce * forward;
    const steer = maxSteerVal * turn;

    if (forward != 0) {
      this.vehicle.setBrake(0, 0);
      this.vehicle.setBrake(0, 1);
      this.vehicle.setBrake(0, 2);
      this.vehicle.setBrake(0, 3);

      this.vehicle.applyEngineForce(force, 0);
      this.vehicle.applyEngineForce(force, 1);
    } else {
      this.vehicle.setBrake(brakeForce, 0);
      this.vehicle.setBrake(brakeForce, 1);
      this.vehicle.setBrake(brakeForce, 2);
      this.vehicle.setBrake(brakeForce, 3);
    }

    this.vehicle.setSteeringValue(steer, 2);
    this.vehicle.setSteeringValue(steer, 3);
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  updateCamera() {
    if (this.followCam === undefined) return;
    const pos = this.car.chassis.position.clone();
    pos.y += 0.3;
    if (this.controls !== undefined) {
      this.controls.target.copy(pos);
      this.controls.update();
    } else {
      this.camera.position.lerp(
        this.followCam.getWorldPosition(new THREE.Vector3()),
        0.05
      );
      this.camera.lookAt(pos);
    }

    if (this.sun != undefined) {
      this.sun.position.copy(this.camera.position);
      this.sun.position.y += 10;
    }
  }

  getAssetsByName(name) {
    if (this.assets == undefined) return;

    const names = name.split(".");
    let assets = this.assets;

    names.forEach(function (name) {
      if (assets !== undefined) {
        assets = assets.children.find(function (child) {
          return child.name == name;
        });
      }
    });

    return assets;
  }

  animate() {
    const game = this;

    requestAnimationFrame(function () {
      game.animate();
    });

    const now = Date.now();
    if (this.lastTime === undefined) this.lastTime = now;
    const dt = (Date.now() - this.lastTime) / 1000.0;
    this.FPSFactor = dt;
    this.lastTime = now;

    if (this.world !== undefined) {
      this.updateDrive();

      this.world.step(this.fixedTimeStep, dt, 10);

      this.world.bodies.forEach(function (body) {
        if (body.threemesh != undefined) {
          body.threemesh.position.copy(body.position);
          body.threemesh.quaternion.copy(body.quaternion);
          if (body == game.vehicle.chassisBody) {
            const elements = body.threemesh.matrix.elements;
            const yAxis = new THREE.Vector3(
              elements[4],
              elements[5],
              elements[6]
            );
            body.threemesh.position.sub(yAxis.multiplyScalar(0.6));
          }
        }
      });
    }

    this.updateCamera();

    if (this.debugRenderer !== undefined) this.debugRenderer.update();

    this.renderer.render(this.scene, this.camera);

    if (this.stats != undefined) this.stats.update();
  }
}

class SFX {
  constructor(options) {
    this.context = options.context;
    const volume = options.volume != undefined ? options.volume : 1.0;
    this.gainNode = this.context.createGain();
    this.gainNode.gain.setValueAtTime(volume, this.context.currentTime);
    this.gainNode.connect(this.context.destination);
    this._loop = options.loop == undefined ? false : options.loop;
    this.fadeDuration =
      options.fadeDuration == undefined ? 0.5 : options.fadeDuration;
    this.autoplay = options.autoplay == undefined ? false : options.autoplay;
    this.buffer = null;

    let codec;
    for (let prop in options.src) {
      if (SFX.supportsAudioType(prop)) {
        codec = prop;
        break;
      }
    }

    if (codec != undefined) {
      this.url = options.src[codec];
      this.load(this.url);
    } else {
      console.warn("Browser does not support any of the supplied audio files");
    }
  }

  static supportsAudioType(type) {
    let audio;

    // Allow user to create shortcuts, i.e. just "mp3"
    let formats = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      aif: "audio/x-aiff",
      ogg: "audio/ogg",
    };

    if (!audio) audio = document.createElement("audio");

    return audio.canPlayType(formats[type] || type);
  }

  load(url) {
    // Load buffer asynchronously
    const request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";

    const sfx = this;

    request.onload = function () {
      // Asynchronously decode the audio file data in request.response
      sfx.context.decodeAudioData(
        request.response,
        function (buffer) {
          if (!buffer) {
            console.error("error decoding file data: " + sfx.url);
            return;
          }
          sfx.buffer = buffer;
          if (sfx.autoplay) sfx.play();
        },
        function (error) {
          console.error("decodeAudioData error", error);
        }
      );
    };

    request.onerror = function () {
      console.error("SFX Loader: XHR error");
    };

    request.send();
  }

  set loop(value) {
    this._loop = value;
    if (this.source != undefined) this.source.loop = value;
  }

  play() {
    if (this.buffer == null) return;
    if (this.source != undefined) this.source.stop();
    this.source = this.context.createBufferSource();
    this.source.loop = this._loop;
    this.source.buffer = this.buffer;
    this.source.connect(this.gainNode);
    this.source.start(0);
  }

  set volume(value) {
    this._volume = value;
    this.gainNode.gain.setTargetAtTime(
      value,
      this.context.currentTime + this.fadeDuration,
      0
    );
  }

  pause() {
    if (this.source == undefined) return;
    this.source.stop();
  }

  stop() {
    if (this.source == undefined) return;
    this.source.stop();
    delete this.source;
  }
}

class JoyStick {
  constructor(options) {
    const circle = document.createElement("div");
    circle.style.cssText =
      "position:absolute; bottom:35px; width:80px; height:80px; background:rgba(126, 126, 126, 0.5); border:#444 solid medium; border-radius:50%; left:50%; transform:translateX(-50%);";
    const thumb = document.createElement("div");
    thumb.style.cssText =
      "position: absolute; left: 20px; top: 20px; width: 40px; height: 40px; border-radius: 50%; background: #fff;";
    circle.appendChild(thumb);
    document.body.appendChild(circle);
    this.domElement = thumb;
    this.maxRadius = options.maxRadius || 40;
    this.maxRadiusSquared = this.maxRadius * this.maxRadius;
    this.onMove = options.onMove;
    this.game = options.game;
    this.origin = {
      left: this.domElement.offsetLeft,
      top: this.domElement.offsetTop,
    };
    this.rotationDamping = options.rotationDamping || 0.06;
    this.moveDamping = options.moveDamping || 0.01;
    if (this.domElement != undefined) {
      const joystick = this;
      if ("ontouchstart" in window) {
        this.domElement.addEventListener("touchstart", function (evt) {
          evt.preventDefault();
          joystick.tap(evt);
        });
      } else {
        this.domElement.addEventListener("mousedown", function (evt) {
          evt.preventDefault();
          joystick.tap(evt);
        });
      }
    }
  }

  getMousePosition(evt) {
    let clientX = evt.targetTouches ? evt.targetTouches[0].pageX : evt.clientX;
    let clientY = evt.targetTouches ? evt.targetTouches[0].pageY : evt.clientY;
    return { x: clientX, y: clientY };
  }

  tap(evt) {
    evt = evt || window.event;
    // get the mouse cursor position at startup:
    this.offset = this.getMousePosition(evt);
    const joystick = this;
    if ("ontouchstart" in window) {
      document.ontouchmove = function (evt) {
        evt.preventDefault();
        joystick.move(evt);
      };
      document.ontouchend = function (evt) {
        evt.preventDefault();
        joystick.up(evt);
      };
    } else {
      document.onmousemove = function (evt) {
        evt.preventDefault();
        joystick.move(evt);
      };
      document.onmouseup = function (evt) {
        evt.preventDefault();
        joystick.up(evt);
      };
    }
  }

  move(evt) {
    evt = evt || window.event;
    const mouse = this.getMousePosition(evt);
    // calculate the new cursor position:
    let left = mouse.x - this.offset.x;
    let top = mouse.y - this.offset.y;
    //this.offset = mouse;

    const sqMag = left * left + top * top;
    if (sqMag > this.maxRadiusSquared) {
      //Only use sqrt if essential
      const magnitude = Math.sqrt(sqMag);
      left /= magnitude;
      top /= magnitude;
      left *= this.maxRadius;
      top *= this.maxRadius;
    }
    // set the element's new position:
    this.domElement.style.top = `${top + this.domElement.clientHeight / 2}px`;
    this.domElement.style.left = `${left + this.domElement.clientWidth / 2}px`;

    const forward =
      -(top - this.origin.top + this.domElement.clientHeight / 2) /
      this.maxRadius;
    const turn =
      (left - this.origin.left + this.domElement.clientWidth / 2) /
      this.maxRadius;

    if (this.onMove != undefined) this.onMove.call(this.game, forward, turn);
  }

  up(evt) {
    if ("ontouchstart" in window) {
      document.ontouchmove = null;
      document.touchend = null;
    } else {
      document.onmousemove = null;
      document.onmouseup = null;
    }
    this.domElement.style.top = `${this.origin.top}px`;
    this.domElement.style.left = `${this.origin.left}px`;

    this.onMove.call(this.game, 0, 0);
  }
}

class Preloader {
  constructor(options) {
    this.assets = {};
    for (let asset of options.assets) {
      this.assets[asset] = { loaded: 0, complete: false };
      this.load(asset);
    }
    this.container = options.container;

    if (options.onprogress == undefined) {
      this.onprogress = onprogress;
      this.domElement = document.createElement("div");
      this.domElement.style.position = "absolute";
      this.domElement.style.top = "0";
      this.domElement.style.left = "0";
      this.domElement.style.width = "100%";
      this.domElement.style.height = "100%";
      this.domElement.style.background = "#000";
      this.domElement.style.opacity = "0.7";
      this.domElement.style.display = "flex";
      this.domElement.style.alignItems = "center";
      this.domElement.style.justifyContent = "center";
      this.domElement.style.zIndex = "1111";
      const barBase = document.createElement("div");
      barBase.style.background = "#aaa";
      barBase.style.width = "50%";
      barBase.style.minWidth = "250px";
      barBase.style.borderRadius = "10px";
      barBase.style.height = "15px";
      this.domElement.appendChild(barBase);
      const bar = document.createElement("div");
      bar.style.background = "#22a";
      bar.style.width = "50%";
      bar.style.borderRadius = "10px";
      bar.style.height = "100%";
      bar.style.width = "0";
      barBase.appendChild(bar);
      this.progressBar = bar;
      if (this.container != undefined) {
        this.container.appendChild(this.domElement);
      } else {
        document.body.appendChild(this.domElement);
      }
    } else {
      this.onprogress = options.onprogress;
    }

    this.oncomplete = options.oncomplete;

    const loader = this;
    function onprogress(delta) {
      const progress = delta * 100;
      loader.progressBar.style.width = `${progress}%`;
    }
  }

  checkCompleted() {
    for (let prop in this.assets) {
      const asset = this.assets[prop];
      if (!asset.complete) return false;
    }
    return true;
  }

  get progress() {
    let total = 0;
    let loaded = 0;

    for (let prop in this.assets) {
      const asset = this.assets[prop];
      if (asset.total == undefined) {
        loaded = 0;
        break;
      }
      loaded += asset.loaded;
      total += asset.total;
    }

    return loaded / total;
  }

  load(url) {
    const loader = this;
    var xobj = new XMLHttpRequest();
    xobj.overrideMimeType("application/json");
    xobj.open("GET", url, true);
    xobj.onreadystatechange = function () {
      if (xobj.readyState == 4 && xobj.status == "200") {
        loader.assets[url].complete = true;
        if (loader.checkCompleted()) {
          if (loader.domElement != undefined) {
            if (loader.container != undefined) {
              loader.container.removeChild(loader.domElement);
            } else {
              document.body.removeChild(loader.domElement);
            }
          }
          loader.oncomplete();
        }
      }
    };
    xobj.onprogress = function (e) {
      const asset = loader.assets[url];
      asset.loaded = e.loaded;
      asset.total = e.total;
      loader.onprogress(loader.progress);
    };
    xobj.send(null);
  }
}
