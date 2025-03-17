/* GLOBAL CONSTANTS AND VARIABLES */

/* assignment specific globals */
const INPUT_URL = "https://ncsucg4games.github.io/prog2/"; // location of input files
const INPUT_TRIANGLES_URL = INPUT_URL + "triangles.json"; // triangles file loc
const INPUT_SPHERES_URL = INPUT_URL + "spheres.json"; // spheres file loc
const INPUT_ROOMS_URL = INPUT_URL + "rooms.json";
const CELL_SIZE = 1.0;
const CELL_HEIGHT = 1.0;
const FPS_UPDATE_INTERVAL = 500; // Update FPS every 500ms
const MAX_FPS = 240; // Cap FPS display at 240
const ROOM_TYPES = {
    SOLID: "s",
    PORTAL: "p",
    ROOM: "room"
};
const CULLING_MODES = {
    NONE: { id: 0, name: "No Culling" },
    FRUSTUM: { id: 1, name: "Frustum Culling" },
    PORTAL: { id: 2, name: "Portal Culling" }
};
const perfStats = {
    frameTime: 0,
    lastFrameTime: performance.now(),
    fps: 0,
    trianglesRendered: 0,
    roomsVisible: 0,
    spheresVisible: 0,
    triangleSetsVisible: 0,
    frameCount: 0,
    // Add these for 10-frame averaging
    frameStartTimes: new Array(10).fill(0),
    frameEndTimes: new Array(10).fill(0),
    frameIndex: 0
};

const ROOM_TEXTURES = {
    WALL: "rocktile.jpg",
    FLOOR: "floor.jpg",
    CEILING: "sky.jpg"
};

const ROOM_MATERIAL = {
    ambient: [0.3, 0.3, 0.3],
    diffuse: [0.7, 0.7, 0.7],
    specular: [0.1, 0.1, 0.1],
    n: 10,
    texture: true
};

var defaultEye = vec3.fromValues(1.5,0.5,1.5); // default eye position in world space
var defaultCenter = vec3.fromValues(2.5,0.5,1.5); // default view direction in world space
var defaultUp = vec3.fromValues(0,1,0); // default view up vector
var lightPosition = vec3.fromValues(2,4,-0.5); // default light position
var lightAmbient = vec3.fromValues(1,1,1); // default light ambient emission
var lightDiffuse = vec3.fromValues(1,1,1); // default light diffuse emission
var lightSpecular = vec3.fromValues(1,1,1); // default light specular emission
//var lightPosition = vec3.fromValues(2,4,-0.5); // default light position
var rotateTheta = Math.PI/25; // how much to rotate models by with each key press
var canvas = null;

/* input model data */
var gl = null; // the all powerful gl object. It's all here folks!
var inputTriangles = []; // the triangle data as loaded from input files
var numTriangleSets = 0; // how many triangle sets in input scene
var triSetSizes = []; // this contains the size of each triangle set
var inputSpheres = []; // the sphere data as loaded from input files
var numSpheres = 0; // how many spheres in the input scene
var inputRooms = [];
var currentRoom = null;

/* model data prepared for webgl */
var vertexBuffers = []; // vertex coordinate lists by set, in triples
var normalBuffers = []; // normal component lists by set, in triples
var uvBuffers = []; // uv coord lists by set, in duples
var triangleBuffers = []; // indices into vertexBuffers by set, in triples
var textures = []; // texture imagery by set

/* shader parameter locations */
var vPosAttribLoc; // where to put position for vertex shader
var vNormAttribLoc; // where to put normal for vertex shader
var vUVAttribLoc; // where to put UV for vertex shader
var mMatrixULoc; // where to put model matrix for vertex shader
var pvmMatrixULoc; // where to put project model view matrix for vertex shader
var ambientULoc; // where to put ambient reflecivity for fragment shader
var diffuseULoc; // where to put diffuse reflecivity for fragment shader
var specularULoc; // where to put specular reflecivity for fragment shader
var shininessULoc; // where to put specular exponent for fragment shader
var usingTextureULoc; // where to put using texture boolean for fragment shader
var textureULoc; // where to put texture for fragment shader

/* interaction variables */
var Eye = vec3.clone(defaultEye); // eye position in world space
var Center = vec3.clone(defaultCenter); // view direction in world space
var Up = vec3.clone(defaultUp); // view up vector in world space
var viewDelta = 0; // how much to displace view with each key press
let currentCullingMode = CULLING_MODES.NONE.id;
// ASSIGNMENT HELPER FUNCTIONS

// get the JSON file from the passed URL
function getJSONFile(url,descr) {
    try {
        if ((typeof(url) !== "string") || (typeof(descr) !== "string"))
            throw "getJSONFile: parameter not a string";
        else {
            var httpReq = new XMLHttpRequest(); // a new http request
            httpReq.open("GET",url,false); // init the request
            httpReq.send(null); // send the request
            var startTime = Date.now();
            while ((httpReq.status !== 200) && (httpReq.readyState !== XMLHttpRequest.DONE)) {
                if ((Date.now()-startTime) > 3000)
                    break;
            } // until its loaded or we time out after three seconds
            if ((httpReq.status !== 200) || (httpReq.readyState !== XMLHttpRequest.DONE))
                throw "Unable to open "+descr+" file!";
            else
                return JSON.parse(httpReq.response); 
        } // end if good params
    } // end try    
    
    catch(e) {
        console.log(e);
        return(String.null);
    }
} // end get input spheres

function logRoomState() {
    console.log("Current Room:", currentRoom ? currentRoom.id : "none");
    console.log("Eye Position:", Eye);
    console.log("Visible Rooms:", inputRooms.filter(r => r.type === ROOM_TYPES.ROOM && r.visible)
        .map(r => r.id));
}

function loadRoomData() {
    // Load models first
    inputTriangles = getJSONFile(INPUT_TRIANGLES_URL, "triangles");
    inputSpheres = getJSONFile(INPUT_SPHERES_URL, "spheres");
    if (!inputTriangles || !inputSpheres) throw "Unable to load input files!";

    // Initialize model properties
    inputTriangles.forEach(triangle => {
        triangle.center = vec3.fromValues(0, 0, 0);
        triangle.translation = vec3.fromValues(0, 0, 0);
        triangle.xAxis = vec3.fromValues(1, 0, 0);
        triangle.yAxis = vec3.fromValues(0, 1, 0);
        triangle.on = false;
    });

    inputSpheres.forEach(sphere => {
        sphere.center = vec3.fromValues(0, 0, 0);
        sphere.translation = vec3.fromValues(0, 0, 0);
        sphere.xAxis = vec3.fromValues(1, 0, 0);
        sphere.yAxis = vec3.fromValues(0, 1, 0);
        sphere.on = false;
    });

    // Load room data
    const roomData = getJSONFile(INPUT_ROOMS_URL, "rooms");
    if (!roomData) throw "Unable to load rooms file!";

    const layout = roomData.rooms;
    const furniture = roomData.furniture;

    // Create room lookup table
    let roomLookup = new Map();

    // Process room layout
    // In loadRoomData(), modify the room creation section:
    for(let z = 0; z < layout.length; z++) {
        for(let x = 0; x < layout[z].length; x++) {
            const cell = layout[z][x];
            // Position each cell at exact unit coordinates (no multiplication)
            const worldX = x;
            const worldZ = z;
            
            if(typeof cell === 'number') {
                // Room cell
                const room = {
                    id: cell,
                    type: ROOM_TYPES.ROOM,
                    position: vec3.fromValues(worldX, 0, worldZ),
                    bounds: {
                        min: vec3.fromValues(worldX, 0, worldZ),
                        max: vec3.fromValues(worldX + 1, CELL_HEIGHT, worldZ + 1) // Use 1 instead of CELL_SIZE
                    },
                    visible: true,
                    portals: [],
                    furniture: []
                };
                inputRooms.push(room);
                roomLookup.set(cell, room);
            }
            else if(cell === ROOM_TYPES.PORTAL) {
                // Portal cell
                let isHorizontal = true;
                if (z > 0 && z < layout.length - 1) {
                    const north = layout[z-1][x];
                    const south = layout[z+1][x];
                    if (typeof north === 'number' && typeof south === 'number') {
                        isHorizontal = false;
                    }
                }

                const connects = isHorizontal 
                    ? [layout[z][x-1], layout[z][x+1]]  // East-west
                    : [layout[z-1][x], layout[z+1][x]]; // North-south

                const portal = {
                    type: ROOM_TYPES.PORTAL,
                    position: vec3.fromValues(worldX, 0, worldZ),
                    bounds: {
                        min: vec3.fromValues(worldX, 0, worldZ),
                        max: vec3.fromValues(worldX + 1, CELL_HEIGHT, worldZ + 1)
                    },
                    connects: connects,
                    orientation: isHorizontal ? 'horizontal' : 'vertical',
                    width: 1.0,
                    height: CELL_HEIGHT
                };
                inputRooms.push(portal);
                
                // Add portal reference to connected rooms
                const leftRoom = roomLookup.get(layout[z][x-1]);
                const rightRoom = roomLookup.get(layout[z][x+1]);
                if(leftRoom) leftRoom.portals.push(portal);
                if(rightRoom) rightRoom.portals.push(portal);
            }
            else if(cell === ROOM_TYPES.SOLID) {
                // Solid wall
                inputRooms.push({
                    type: ROOM_TYPES.SOLID,
                    position: vec3.fromValues(worldX, 0, worldZ),
                    bounds: {
                        min: vec3.fromValues(worldX, 0, worldZ),
                        max: vec3.fromValues(worldX + 1, CELL_HEIGHT, worldZ + 1)
                    }
                });
            }
        }
    }

    // Process furniture after rooms are created
    furniture.forEach(([roomId, x, z, type, modelId]) => {
        const room = roomLookup.get(roomId);
        if(room) {
            if(type === "sphere" && inputSpheres[modelId]) {
                inputSpheres[modelId].roomId = roomId;
                // Convert local coordinates to world coordinates
                inputSpheres[modelId].x = room.position[0] + x;
                inputSpheres[modelId].y = 0.5;
                inputSpheres[modelId].z = room.position[2] + z;
                room.furniture.push({type: "sphere", modelId: modelId});
            } else if(type === "triangleset" && inputTriangles[modelId]) {
                inputTriangles[modelId].roomId = roomId;
                vec3.set(inputTriangles[modelId].translation,
                    room.position[0] + x,
                    0,
                    room.position[2] + z
                );
                room.furniture.push({type: "triangleset", modelId: modelId});
            }
        }
    });

    // Generate room geometry
    // In loadRoomData(), replace the room generation section:
    inputRooms.forEach((room, index) => {
        // Generate geometry for both room and portal cells
        if(room.type === ROOM_TYPES.ROOM || room.type === ROOM_TYPES.PORTAL) {
            const geometry = generateRoomGeometry(room, layout);
            
            // Create WebGL buffers for the room/portal
            room.vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, room.vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
    
            room.normalBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, room.normalBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.normals, gl.STATIC_DRAW);
    
            room.uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, room.uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, geometry.uvs, gl.STATIC_DRAW);
    
            room.triangleBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, room.triangleBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.triangles, gl.STATIC_DRAW);
    
            room.triangleCount = geometry.triangles.length;
    
            // Load room textures
            const textureIndex = numTriangleSets + numSpheres + index;
            loadTexture(textureIndex, room, ROOM_TEXTURES.WALL);
            room.textureIndex = textureIndex;
        }
    });

    // Set view delta
    viewDelta = CELL_SIZE / 5;
    const room0 = inputRooms.find(r => r.type === ROOM_TYPES.ROOM && r.id === 0);
if(room0) {
    console.log("Room 0 bounds:", room0.bounds);
    console.log("Room 0 position:", room0.position);
}

    return true;
}

function updateFrustumVisibility(planes) {
    if (!planes) return;
    
    let visibleRooms = 0;
    let visibleTriangles = 0;

    // Reset visibility of all rooms
    inputRooms.forEach(room => {
        if(room.type === ROOM_TYPES.ROOM) {
            room.visible = isBoxInFrustum(room.bounds, planes);
            if(room.visible) {
                visibleRooms++;
                visibleTriangles += room.triangleCount / 3;
                console.log(`Room ${room.id} visible with ${room.triangleCount/3} triangles`);
            }
        }
    });

    console.log(`Total visible triangles: ${visibleTriangles}`);
    perfStats.roomsVisible = visibleRooms;
    perfStats.trianglesRendered = visibleTriangles;
}

function extractFrustumPlanes(pvMatrix) {
    const m = pvMatrix;
    const normalizePlane = (plane) => {
        const mag = Math.sqrt(plane[0]**2 + plane[1]**2 + plane[2]**2);
        return [plane[0]/mag, plane[1]/mag, plane[2]/mag, plane[3]/mag];
    };

    const planes = {
        left:   normalizePlane([m[3] + m[0], m[7] + m[4], m[11] + m[8],  m[15] + m[12]]),
        right:  normalizePlane([m[3] - m[0], m[7] - m[4], m[11] - m[8],  m[15] - m[12]]),
        bottom: normalizePlane([m[3] + m[1], m[7] + m[5], m[11] + m[9],  m[15] + m[13]]),
        top:    normalizePlane([m[3] - m[1], m[7] - m[5], m[11] - m[9],  m[15] - m[13]]),
        near:   normalizePlane([m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]]),
        far:    normalizePlane([m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]])
    };
    return planes;
}

function isBoxInFrustum(bounds, planes) {
    // Pre-calculate corners once
    const corners = [
        bounds.min,
        bounds.max,
        [bounds.min[0], bounds.min[1], bounds.max[2]],
        [bounds.min[0], bounds.max[1], bounds.min[2]],
        [bounds.min[0], bounds.max[1], bounds.max[2]],
        [bounds.max[0], bounds.min[1], bounds.min[2]],
        [bounds.max[0], bounds.min[1], bounds.max[2]],
        [bounds.max[0], bounds.max[1], bounds.min[2]]
    ];

    // Test each plane
    for(let plane of Object.values(planes)) {
        // Fast rejection test - if all corners are outside any plane, box is outside
        let inside = false;
        for(let i = 0; i < 8 && !inside; i++) {
            if(plane[0] * corners[i][0] + 
               plane[1] * corners[i][1] + 
               plane[2] * corners[i][2] + plane[3] >= 0) {
                inside = true;
            }
        }
        if(!inside) return false;
    }
    return true;
}

function updatePortalVisibility() {
    // Reset visibility
    inputRooms.forEach(room => {
        if(room.type === ROOM_TYPES.ROOM) {
            room.visible = false;
        }
    });

    // Find current room
    const currentRoom = inputRooms.find(room => 
        room.type === ROOM_TYPES.ROOM && 
        Eye[0] >= room.bounds.min[0] && Eye[0] <= room.bounds.max[0] &&
        Eye[2] >= room.bounds.min[2] && Eye[2] <= room.bounds.max[2]
    );

    if(!currentRoom) {
        console.log("No current room found at position:", Eye);
        return;
    }

    // First mark current room and all its directly connected cells visible
    const connectedRooms = new Set([currentRoom.id]);
    const roomsToProcess = [currentRoom];

    while(roomsToProcess.length > 0) {
        const room = roomsToProcess.shift();
        room.visible = true;

        // Check adjacent cells for connected spaces
        const roomX = Math.floor(room.position[0]);
        const roomZ = Math.floor(room.position[2]);
        
        [[-1,0], [1,0], [0,-1], [0,1]].forEach(([dx, dz]) => {
            const adjacentRoom = inputRooms.find(r => 
                r.type === ROOM_TYPES.ROOM &&
                Math.floor(r.position[0]) === roomX + dx &&
                Math.floor(r.position[2]) === roomZ + dz
            );

            if(adjacentRoom && !connectedRooms.has(adjacentRoom.id)) {
                // Check if there's a solid wall between rooms
                const wallX = roomX + dx/2;
                const wallZ = roomZ + dz/2;
                
                const hasWall = inputRooms.some(r => 
                    r.type === ROOM_TYPES.SOLID &&
                    Math.abs(r.position[0] - wallX) < 0.1 &&
                    Math.abs(r.position[2] - wallZ) < 0.1
                );

                if(!hasWall) {
                    connectedRooms.add(adjacentRoom.id);
                    roomsToProcess.push(adjacentRoom);
                    adjacentRoom.visible = true;
                }
            }
        });
    }

    // Then handle portal visibility
    const portalsToProcess = inputRooms.filter(r => 
        r.type === ROOM_TYPES.PORTAL && 
        r.connects.some(id => connectedRooms.has(id))
    );

    portalsToProcess.forEach(portal => {
        // Check if camera is near portal
        const portalBox = {
            min: vec3.fromValues(
                portal.bounds.min[0] - 0.2,
                portal.bounds.min[1] - 0.2,
                portal.bounds.min[2] - 0.2
            ),
            max: vec3.fromValues(
                portal.bounds.max[0] + 0.2,
                portal.bounds.max[1] + 0.2,
                portal.bounds.max[2] + 0.2
            )
        };

        const isNearPortal = (
            Eye[0] >= portalBox.min[0] && Eye[0] <= portalBox.max[0] &&
            Eye[1] >= portalBox.min[1] && Eye[1] <= portalBox.max[1] &&
            Eye[2] >= portalBox.min[2] && Eye[2] <= portalBox.max[2]
        );

        if(isNearPortal) {
            // If near portal, make rooms on both sides visible
            portal.connects.forEach(roomId => {
                const connectedRoom = inputRooms.find(r => 
                    r.type === ROOM_TYPES.ROOM && r.id === roomId
                );
                if(connectedRoom) {
                    connectedRoom.visible = true;
                    connectedRooms.add(roomId);
                }
            });
        } else {
            // Check if portal is in view
            const portalCenter = vec3.fromValues(
                (portal.bounds.min[0] + portal.bounds.max[0]) / 2,
                (portal.bounds.min[1] + portal.bounds.max[1]) / 2,
                (portal.bounds.min[2] + portal.bounds.max[2]) / 2
            );

            const viewDir = vec3.subtract(vec3.create(), Center, Eye);
            const toPortal = vec3.subtract(vec3.create(), portalCenter, Eye);
            vec3.normalize(viewDir, viewDir);
            vec3.normalize(toPortal, toPortal);

            if(vec3.dot(viewDir, toPortal) > 0) {
                // Process rooms visible through portal
                portal.connects.forEach(roomId => {
                    if(!connectedRooms.has(roomId)) {
                        const targetRoom = inputRooms.find(r => 
                            r.type === ROOM_TYPES.ROOM && r.id === roomId
                        );
                        if(targetRoom) {
                            targetRoom.visible = true;
                            connectedRooms.add(roomId);
                        }
                    }
                });
            }
        }
    });

    if(window.debugCulling) {
        console.log("Current room:", currentRoom.id);
        console.log("Connected rooms:", Array.from(connectedRooms));
    }
}

function createPortalFrustum(portal, eyePosition) {
    // Get portal corners based on orientation
    const corners = portal.orientation === 'horizontal' 
        ? [ // East-west portal
            [portal.bounds.min[0], portal.bounds.min[1], portal.bounds.min[2]],
            [portal.bounds.max[0], portal.bounds.min[1], portal.bounds.min[2]],
            [portal.bounds.max[0], portal.bounds.max[1], portal.bounds.min[2]],
            [portal.bounds.min[0], portal.bounds.max[1], portal.bounds.min[2]]
        ] 
        : [ // North-south portal
            [portal.bounds.min[0], portal.bounds.min[1], portal.bounds.min[2]],
            [portal.bounds.min[0], portal.bounds.min[1], portal.bounds.max[2]],
            [portal.bounds.min[0], portal.bounds.max[1], portal.bounds.max[2]],
            [portal.bounds.min[0], portal.bounds.max[1], portal.bounds.min[2]]
        ];

    const planes = {};

    // Create side planes from eye through portal edges
    for(let i = 0; i < corners.length; i++) {
        const p1 = corners[i];
        const p2 = corners[(i + 1) % corners.length];
        
        // Calculate vectors for plane
        const v1 = vec3.subtract(vec3.create(), p1, eyePosition);
        const v2 = vec3.subtract(vec3.create(), p2, eyePosition);
        const normal = vec3.cross(vec3.create(), v1, v2);
        vec3.normalize(normal, normal);

        // Create plane equation
        planes[`side${i}`] = [
            normal[0], normal[1], normal[2],
            -(normal[0] * eyePosition[0] + 
              normal[1] * eyePosition[1] + 
              normal[2] * eyePosition[2])
        ];
    }

    // Add near plane (portal plane)
    const portalNormal = portal.orientation === 'horizontal' 
        ? [0, 0, -1] 
        : [-1, 0, 0];
    
    const portalCenter = vec3.fromValues(
        (portal.bounds.min[0] + portal.bounds.max[0]) / 2,
        (portal.bounds.min[1] + portal.bounds.max[1]) / 2,
        (portal.bounds.min[2] + portal.bounds.max[2]) / 2
    );

    // Ensure normal points away from viewer
    const toViewer = vec3.subtract(vec3.create(), eyePosition, portalCenter);
    if (vec3.dot(portalNormal, toViewer) < 0) {
        vec3.scale(portalNormal, portalNormal, -1);
    }

    planes.near = [
        portalNormal[0], portalNormal[1], portalNormal[2],
        -(portalNormal[0] * portal.bounds.min[0] + 
          portalNormal[1] * portal.bounds.min[1] + 
          portalNormal[2] * portal.bounds.min[2])
    ];

    // Add far plane at some reasonable distance
    planes.far = [
        -portalNormal[0], -portalNormal[1], -portalNormal[2],
        portalNormal[0] * (portal.bounds.min[0] + 20) + 
        portalNormal[1] * portal.bounds.min[1] + 
        portalNormal[2] * portal.bounds.min[2]
    ];

    return planes;
}

// Add after loadRoomData
function updateRoomVisibility(planes) {
    let visibleRooms = 0;
    let visibleTriangles = 0;

    // Reset all visibility first
    inputRooms.forEach(room => {
        if(room.type === ROOM_TYPES.ROOM) {
            room.visible = false;
        }
    });

    switch(currentCullingMode) {
        case CULLING_MODES.FRUSTUM.id:
            // Frustum culling
            inputRooms.forEach(room => {
                if(room.type === ROOM_TYPES.ROOM) {
                    room.visible = isBoxInFrustum(room.bounds, planes);
                    if(room.visible) {
                        visibleRooms++;
                        visibleTriangles += room.triangleCount / 3;
                    }
                }
            });
            break;

        case CULLING_MODES.PORTAL.id:
            updatePortalVisibility();
            // Update performance stats
            inputRooms.forEach(room => {
                if(room.type === ROOM_TYPES.ROOM && room.visible) {
                    visibleRooms++;
                    visibleTriangles += room.triangleCount / 3;
                }
            });
            break;

        case CULLING_MODES.NONE.id:
        default:
            // No culling - show everything
            inputRooms.forEach(room => {
                if(room.type === ROOM_TYPES.ROOM) {
                    room.visible = true;
                    visibleRooms++;
                    visibleTriangles += room.triangleCount / 3;
                }
            });
            break;
    }
    
    perfStats.roomsVisible = visibleRooms;
    perfStats.trianglesRendered = visibleTriangles;
}

function generateRoomGeometry(room, layout) {
    const vertices = [];
    const normals = [];
    const uvs = [];
    const triangles = [];
    let vertexCount = 0;

    // Helper functions
    function addQuad(v1, v2, v3, v4, normal, isWall) {
        vertices.push(...v1, ...v2, ...v3, ...v4);
        for(let i = 0; i < 4; i++) normals.push(...normal);
        
        if(isWall) {
            // Calculate UV based on wall dimensions
            const width = Math.sqrt(
                Math.pow(v2[0] - v1[0], 2) + 
                Math.pow(v2[2] - v1[2], 2)
            );
            const height = v3[1] - v2[1];
            uvs.push(
                0, 0,           // bottom left
                width, 0,       // bottom right
                width, height,  // top right
                0, height       // top left
            );
        } else {
            // Floor/ceiling UV mapping
            const scaleU = Math.abs(v2[0] - v1[0]);
            const scaleV = Math.abs(v4[2] - v1[2]);
            uvs.push(0,0, scaleU,0, scaleU,scaleV, 0,scaleV);
        }
        
        triangles.push(
            vertexCount, vertexCount + 1, vertexCount + 2,
            vertexCount, vertexCount + 2, vertexCount + 3
        );
        vertexCount += 4;
    }

    const roomX = Math.floor(room.position[0]);
    const roomZ = Math.floor(room.position[2]);

    // Always add floor and ceiling
    addQuad(
        [room.bounds.min[0], room.bounds.min[1], room.bounds.min[2]],
        [room.bounds.max[0], room.bounds.min[1], room.bounds.min[2]],
        [room.bounds.max[0], room.bounds.min[1], room.bounds.max[2]],
        [room.bounds.min[0], room.bounds.min[1], room.bounds.max[2]],
        [0, 1, 0],
        false
    );

    addQuad(
        [room.bounds.min[0], room.bounds.max[1], room.bounds.min[2]],
        [room.bounds.max[0], room.bounds.max[1], room.bounds.min[2]],
        [room.bounds.max[0], room.bounds.max[1], room.bounds.max[2]],
        [room.bounds.min[0], room.bounds.max[1], room.bounds.max[2]],
        [0, -1, 0],
        false
    );

    // Check each direction for walls
    const directions = [
        { dx: 0, dz: -1, normal: [0, 0, -1], type: 'NORTH' }, // North
        { dx: 0, dz: 1, normal: [0, 0, 1], type: 'SOUTH' },   // South
        { dx: -1, dz: 0, normal: [-1, 0, 0], type: 'WEST' },  // West
        { dx: 1, dz: 0, normal: [1, 0, 0], type: 'EAST' }     // East
    ];

    directions.forEach(dir => {
        const nextX = roomX + dir.dx;
        const nextZ = roomZ + dir.dz;
        const isPortalCell = room.type === ROOM_TYPES.PORTAL;
        
        // For portal cells, only add side walls based on orientation
        if (isPortalCell) {
            const isHorizontalPortal = room.orientation === 'horizontal';
            // Only add walls for sides perpendicular to the portal direction
            if ((isHorizontalPortal && (dir.type === 'NORTH' || dir.type === 'SOUTH')) ||
                (!isHorizontalPortal && (dir.type === 'EAST' || dir.type === 'WEST'))) {
                    
                const isVertical = dir.dx !== 0;
                const wallX = dir.dx > 0 ? room.bounds.max[0] : room.bounds.min[0];
                const wallZ = dir.dz > 0 ? room.bounds.max[2] : room.bounds.min[2];

                addQuad(
                    [isVertical ? wallX : room.bounds.min[0], room.bounds.min[1], isVertical ? room.bounds.min[2] : wallZ],
                    [isVertical ? wallX : room.bounds.max[0], room.bounds.min[1], isVertical ? room.bounds.max[2] : wallZ],
                    [isVertical ? wallX : room.bounds.max[0], room.bounds.max[1], isVertical ? room.bounds.max[2] : wallZ],
                    [isVertical ? wallX : room.bounds.min[0], room.bounds.max[1], isVertical ? room.bounds.min[2] : wallZ],
                    dir.normal,
                    true
                );
            }
        } else {
            // Regular room wall generation logic
            if (nextX < 0 || nextX >= layout[0].length ||
                nextZ < 0 || nextZ >= layout.length ||
                layout[nextZ][nextX] === ROOM_TYPES.SOLID ||
                (!isPortalCell && layout[nextZ][nextX] !== ROOM_TYPES.PORTAL && 
                 typeof layout[nextZ][nextX] !== 'number')) {
                
                const isVertical = dir.dx !== 0;
                const wallX = dir.dx > 0 ? room.bounds.max[0] : room.bounds.min[0];
                const wallZ = dir.dz > 0 ? room.bounds.max[2] : room.bounds.min[2];

                addQuad(
                    [isVertical ? wallX : room.bounds.min[0], room.bounds.min[1], isVertical ? room.bounds.min[2] : wallZ],
                    [isVertical ? wallX : room.bounds.max[0], room.bounds.min[1], isVertical ? room.bounds.max[2] : wallZ],
                    [isVertical ? wallX : room.bounds.max[0], room.bounds.max[1], isVertical ? room.bounds.max[2] : wallZ],
                    [isVertical ? wallX : room.bounds.min[0], room.bounds.max[1], isVertical ? room.bounds.min[2] : wallZ],
                    dir.normal,
                    true
                );
            }
        }
    });

    return {
        vertices: new Float32Array(vertices),
        normals: new Float32Array(normals),
        uvs: new Float32Array(uvs),
        triangles: new Uint16Array(triangles)
    };
}

// does stuff when keys are pressed
function handleKeyDown(event) {
    
    const modelEnum = {TRIANGLES: "triangles", SPHERE: "sphere"}; // enumerated model type
    const dirEnum = {NEGATIVE: -1, POSITIVE: 1}; // enumerated rotation direction
    
    function highlightModel(modelType,whichModel) {
        if (handleKeyDown.modelOn != null)
            handleKeyDown.modelOn.on = false;
        handleKeyDown.whichOn = whichModel;
        if (modelType == modelEnum.TRIANGLES)
            handleKeyDown.modelOn = inputTriangles[whichModel]; 
        else
            handleKeyDown.modelOn = inputSpheres[whichModel]; 
        handleKeyDown.modelOn.on = true; 
    } // end highlight model
    
    function translateModel(offset) {
        if (handleKeyDown.modelOn != null)
            vec3.add(handleKeyDown.modelOn.translation,handleKeyDown.modelOn.translation,offset);
    } // end translate model

    function rotateModel(axis,direction) {
        if (handleKeyDown.modelOn != null) {
            var newRotation = mat4.create();

            mat4.fromRotation(newRotation,direction*rotateTheta,axis); // get a rotation matrix around passed axis
            vec3.transformMat4(handleKeyDown.modelOn.xAxis,handleKeyDown.modelOn.xAxis,newRotation); // rotate model x axis tip
            vec3.transformMat4(handleKeyDown.modelOn.yAxis,handleKeyDown.modelOn.yAxis,newRotation); // rotate model y axis tip
        } // end if there is a highlighted model
    } // end rotate model
    
    // set up needed view params
    var lookAt = vec3.create(), viewRight = vec3.create(), temp = vec3.create(); // lookat, right & temp vectors
    lookAt = vec3.normalize(lookAt,vec3.subtract(temp,Center,Eye)); // get lookat vector
    viewRight = vec3.normalize(viewRight,vec3.cross(temp,lookAt,Up)); // get view right vector
    
    // highlight static variables
    handleKeyDown.whichOn = handleKeyDown.whichOn == undefined ? -1 : handleKeyDown.whichOn; // nothing selected initially
    handleKeyDown.modelOn = handleKeyDown.modelOn == undefined ? null : handleKeyDown.modelOn; // nothing selected initially

    switch (event.code) {
        
        // model selection
        case "Space": 
            if (handleKeyDown.modelOn != null)
                handleKeyDown.modelOn.on = false; // turn off highlighted model
            handleKeyDown.modelOn = null; // no highlighted model
            handleKeyDown.whichOn = -1; // nothing highlighted
            break;
        case "ArrowRight": // select next triangle set
            highlightModel(modelEnum.TRIANGLES,(handleKeyDown.whichOn+1) % numTriangleSets);
            break;
        case "ArrowLeft": // select previous triangle set
            highlightModel(modelEnum.TRIANGLES,(handleKeyDown.whichOn > 0) ? handleKeyDown.whichOn-1 : numTriangleSets-1);
            break;
        case "ArrowUp": // select next sphere
            highlightModel(modelEnum.SPHERE,(handleKeyDown.whichOn+1) % numSpheres);
            break;
        case "ArrowDown": // select previous sphere
            highlightModel(modelEnum.SPHERE,(handleKeyDown.whichOn > 0) ? handleKeyDown.whichOn-1 : numSpheres-1);
            break;
            
        // view change
        case "KeyA": // translate view left, rotate left with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,viewDelta));
            break;
        case "KeyD": // translate view right, rotate right with shift
            Center = vec3.add(Center,Center,vec3.scale(temp,viewRight,-viewDelta));
            if (!event.getModifierState("Shift"))
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyS": // translate view backward, rotate up with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,-viewDelta));
            } // end if shift not pressed
            break;
        case "KeyW": // translate view forward, rotate down with shift
            if (event.getModifierState("Shift")) {
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
                Up = vec3.cross(Up,viewRight,vec3.subtract(lookAt,Center,Eye)); /* global side effect */
            } else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,lookAt,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,lookAt,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyQ": // translate view up, rotate counterclockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,-viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,viewDelta));
            } // end if shift not pressed
            break;
        case "KeyE": // translate view down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                Up = vec3.normalize(Up,vec3.add(Up,Up,vec3.scale(temp,viewRight,viewDelta)));
            else {
                Eye = vec3.add(Eye,Eye,vec3.scale(temp,Up,-viewDelta));
                Center = vec3.add(Center,Center,vec3.scale(temp,Up,-viewDelta));
            } // end if shift not pressed
            break;
        case "Escape": // reset view to default
            Eye = vec3.copy(Eye,defaultEye);
            Center = vec3.copy(Center,defaultCenter);
            Up = vec3.copy(Up,defaultUp);
            break;
            
        // model transformation
        case "KeyK": // translate left, rotate left with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,viewRight,viewDelta));
            break;
        case "Semicolon": // translate right, rotate right with shift
            if (event.getModifierState("Shift"))
                rotateModel(Up,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,viewRight,-viewDelta));
            break;
        case "KeyL": // translate backward, rotate up with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,lookAt,-viewDelta));
            break;
        case "KeyO": // translate forward, rotate down with shift
            if (event.getModifierState("Shift"))
                rotateModel(viewRight,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,lookAt,viewDelta));
            break;
        case "KeyI": // translate up, rotate counterclockwise with shift 
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.POSITIVE);
            else
                translateModel(vec3.scale(temp,Up,viewDelta));
            break;
        case "KeyP": // translate down, rotate clockwise with shift
            if (event.getModifierState("Shift"))
                rotateModel(lookAt,dirEnum.NEGATIVE);
            else
                translateModel(vec3.scale(temp,Up,-viewDelta));
            break;
        case "KeyB": // Toggle debug visualization
            window.debugCulling = !window.debugCulling;
            break;
        case "Digit1":
            currentCullingMode = CULLING_MODES.NONE.id;
            break;
        case "Digit2": 
            currentCullingMode = CULLING_MODES.FRUSTUM.id;
            break;
        case "Digit3":
            currentCullingMode = CULLING_MODES.PORTAL.id;
            break;
        case "Backspace": // reset model transforms to default
            for (var whichTriSet=0; whichTriSet<numTriangleSets; whichTriSet++) {
                vec3.set(inputTriangles[whichTriSet].translation,0,0,0);
                vec3.set(inputTriangles[whichTriSet].xAxis,1,0,0);
                vec3.set(inputTriangles[whichTriSet].yAxis,0,1,0);
            } // end for all triangle sets
            for (var whichSphere=0; whichSphere<numSpheres; whichSphere++) {
                vec3.set(inputSpheres[whichSphere].translation,0,0,0);
                vec3.set(inputSpheres[whichSphere].xAxis,1,0,0);
                vec3.set(inputSpheres[whichSphere].yAxis,0,1,0);
            } // end for all spheres
            break;
    } // end switch
} // end handleKeyDown

function drawBoundingBox(bounds, color) {
    // Create line vertices for box edges
    const vertices = new Float32Array([
        // Front face
        bounds.min[0], bounds.min[1], bounds.min[2],
        bounds.max[0], bounds.min[1], bounds.min[2],
        bounds.max[0], bounds.min[1], bounds.min[2],
        bounds.max[0], bounds.max[1], bounds.min[2],
        bounds.max[0], bounds.max[1], bounds.min[2],
        bounds.min[0], bounds.max[1], bounds.min[2],
        bounds.min[0], bounds.max[1], bounds.min[2],
        bounds.min[0], bounds.min[1], bounds.min[2],

        // Back face
        bounds.min[0], bounds.min[1], bounds.max[2],
        bounds.max[0], bounds.min[1], bounds.max[2],
        bounds.max[0], bounds.min[1], bounds.max[2],
        bounds.max[0], bounds.max[1], bounds.max[2],
        bounds.max[0], bounds.max[1], bounds.max[2],
        bounds.min[0], bounds.max[1], bounds.max[2],
        bounds.min[0], bounds.max[1], bounds.max[2],
        bounds.min[0], bounds.min[1], bounds.max[2],

        // Connecting edges
        bounds.min[0], bounds.min[1], bounds.min[2],
        bounds.min[0], bounds.min[1], bounds.max[2],
        bounds.max[0], bounds.min[1], bounds.min[2],
        bounds.max[0], bounds.min[1], bounds.max[2],
        bounds.max[0], bounds.max[1], bounds.min[2],
        bounds.max[0], bounds.max[1], bounds.max[2],
        bounds.min[0], bounds.max[1], bounds.min[2],
        bounds.min[0], bounds.max[1], bounds.max[2]
    ]);

    // Create and bind vertex buffer
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    // Set up debug shader program if not already created
    if (!window.debugShaderProgram) {
        const vShaderCode = `
            attribute vec3 aPosition;
            uniform mat4 uPVMMatrix;
            void main() {
                gl_Position = uPVMMatrix * vec4(aPosition, 1.0);
            }
        `;

        const fShaderCode = `
            precision mediump float;
            uniform vec4 uColor;
            void main() {
                gl_FragColor = uColor;
            }
        `;

        const vShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vShader, vShaderCode);
        gl.compileShader(vShader);

        const fShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fShader, fShaderCode);
        gl.compileShader(fShader);

        const debugProgram = gl.createProgram();
        gl.attachShader(debugProgram, vShader);
        gl.attachShader(debugProgram, fShader);
        gl.linkProgram(debugProgram);

        window.debugShaderProgram = debugProgram;
        window.debugPositionLoc = gl.getAttribLocation(debugProgram, 'aPosition');
        window.debugPVMMatrixLoc = gl.getUniformLocation(debugProgram, 'uPVMMatrix');
        window.debugColorLoc = gl.getUniformLocation(debugProgram, 'uColor');
    }

    // Use debug shader program
    gl.useProgram(window.debugShaderProgram);

    // Set up attributes and uniforms
    gl.enableVertexAttribArray(window.debugPositionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(window.debugPositionLoc, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(window.debugPVMMatrixLoc, false, hpvmMatrix);
    gl.uniform4fv(window.debugColorLoc, color);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Draw the bounding box lines
    gl.drawArrays(gl.LINES, 0, 24);

    // Cleanup
    gl.disable(gl.BLEND);
    gl.deleteBuffer(vertexBuffer);

    // Switch back to main shader program
    gl.useProgram(shaderProgram);
}

function displayPerfStats() {
    const stats = document.getElementById('perfStats') || createStatsElement();
    const modeName = Object.entries(CULLING_MODES)
        .find(([_, mode]) => mode.id === currentCullingMode)?.[1].name;
    
    stats.innerHTML = `
        Mode: ${modeName}
        Frame Time: ${perfStats.frameTime.toFixed(2)}ms (${perfStats.frameCount < 10 ? 'warming up' : 'avg'})
        Triangles: ${perfStats.trianglesRendered}
        Rooms: ${perfStats.roomsVisible}
        Spheres: ${perfStats.spheresVisible}
        Sets: ${perfStats.triangleSetsVisible}
    `;
}

function createStatsElement() {
    const stats = document.createElement('div');
    stats.id = 'perfStats';
    stats.style.cssText = `
        position: fixed;
        top: 10px;
        left: 10px;
        background: rgba(0,0,0,0.7);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        white-space: pre;
        pointer-events: none;
    `;
    document.body.appendChild(stats);
    return stats;
}


function renderDebugCulling() {
    if (!window.debugCulling) return;

    const colors = {
        visible: [0, 1, 0, 0.2],      // Green for visible
        culled: [1, 0, 0, 0.2],       // Red for culled
        frustum: [1, 1, 0, 0.1]       // Yellow for frustum
    };

    // Draw room bounds
    inputRooms.forEach(room => {
        if(room.type === ROOM_TYPES.ROOM) {
            const color = room.visible ? colors.visible : colors.culled;
            drawBoundingBox(room.bounds, color);
        }
    });

    // Draw frustum bounds
    if(currentCullingMode === CULLING_MODES.FRUSTUM.id) {
        // Calculate frustum corners and draw them
        const corners = calculateFrustumCorners(pMatrix, vMatrix);
        drawFrustumLines(corners, colors.frustum);
    }
}

// set up the webGL environment
function setupWebGL() {
    
    // Set up keys
    document.onkeydown = handleKeyDown; // call this when key pressed

    // create a webgl canvas and set it up
    canvas = document.getElementById("myWebGLCanvas"); // create a webgl canvas
    gl = canvas.getContext("webgl"); // get a webgl object from it
    try {
      if (gl == null) {
        throw "unable to create gl context -- is your browser gl ready?";
      } else {
        gl.clearColor(0.0, 0.0, 0.0, 1.0); // use black when we clear the frame buffer
        gl.clearDepth(1.0); // use max when we clear the depth buffer
        gl.enable(gl.DEPTH_TEST); // use hidden surface removal (with zbuffering)
      }
    } // end try
    
    catch(e) {
      console.log(e);
    } // end catch
 
} // end setupWebGL
// Add this function before loadModels()
function loadTexture(whichModel, currModel, textureFile) {
    // load a 1x1 gray image into texture for use when no texture, and until texture loads
    textures[whichModel] = gl.createTexture(); // new texture struct for model
    var currTexture = textures[whichModel]; // shorthand
    gl.bindTexture(gl.TEXTURE_2D, currTexture); // activate model's texture
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); // invert vertical texcoord v, load gray 1x1
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([64, 64, 64, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, null);

    // if there is a texture to load, asynchronously load it
    if (textureFile != false) {
        currTexture.image = new Image();
        currTexture.image.onload = function() {
            gl.bindTexture(gl.TEXTURE_2D, currTexture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, currTexture.image);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        currTexture.image.onerror = function() {
            console.log("Unable to load texture " + textureFile);
        }
        currTexture.image.crossOrigin = "Anonymous";
        currTexture.image.src = INPUT_URL + textureFile;
    }
}
// read models in, load them into webgl buffers
function loadModels() {

    
    // make a sphere with radius 1 at the origin, with numLongSteps longitudes. 
    // Returns verts, tris and normals.
    function makeSphere(numLongSteps) {
        
        try {
            if (numLongSteps % 2 != 0)
                throw "in makeSphere: uneven number of longitude steps!";
            else if (numLongSteps < 4)
                throw "in makeSphere: number of longitude steps too small!";
            else { // good number longitude steps
            
                // make vertices, normals and uvs -- repeat longitude seam
                const INVPI = 1/Math.PI, TWOPI = Math.PI+Math.PI, INV2PI = 1/TWOPI, epsilon=0.001*Math.PI;
                var sphereVertices = [0,-1,0]; // vertices to return, init to south pole
                var sphereUvs = [0.5,0]; // uvs to return, bottom texture row collapsed to one texel
                var angleIncr = TWOPI / numLongSteps; // angular increment 
                var latLimitAngle = angleIncr * (Math.floor(numLongSteps*0.25)-1); // start/end lat angle
                var latRadius, latY, latV; // radius, Y and texture V at current latitude
                for (var latAngle=-latLimitAngle; latAngle<=latLimitAngle+epsilon; latAngle+=angleIncr) {
                    latRadius = Math.cos(latAngle); // radius of current latitude
                    latY = Math.sin(latAngle); // height at current latitude
                    latV = latAngle*INVPI + 0.5; // texture v = (latAngle + 0.5*PI) / PI
                    for (var longAngle=0; longAngle<=TWOPI+epsilon; longAngle+=angleIncr) { // for each long
                        sphereVertices.push(-latRadius*Math.sin(longAngle),latY,latRadius*Math.cos(longAngle));
                        sphereUvs.push(longAngle*INV2PI,latV); // texture u = (longAngle/2PI)
                    } // end for each longitude
                } // end for each latitude
                sphereVertices.push(0,1,0); // add north pole
                sphereUvs.push(0.5,1); // top texture row collapsed to one texel
                var sphereNormals = sphereVertices.slice(); // for this sphere, vertices = normals; return these

                // make triangles, first poles then middle latitudes
                var sphereTriangles = []; // triangles to return
                var numVertices = Math.floor(sphereVertices.length/3); // number of vertices in sphere
                for (var whichLong=1; whichLong<=numLongSteps; whichLong++) { // poles
                    sphereTriangles.push(0,whichLong,whichLong+1);
                    sphereTriangles.push(numVertices-1,numVertices-whichLong-1,numVertices-whichLong-2);
                } // end for each long
                var llVertex; // lower left vertex in the current quad
                for (var whichLat=0; whichLat<(numLongSteps/2 - 2); whichLat++) { // middle lats
                    for (var whichLong=0; whichLong<numLongSteps; whichLong++) {
                        llVertex = whichLat*(numLongSteps+1) + whichLong + 1;
                        sphereTriangles.push(llVertex,llVertex+numLongSteps+1,llVertex+numLongSteps+2);
                        sphereTriangles.push(llVertex,llVertex+numLongSteps+2,llVertex+1);
                    } // end for each longitude
                } // end for each latitude
            } // end if good number longitude steps
            return({vertices:sphereVertices, normals:sphereNormals, uvs:sphereUvs, triangles:sphereTriangles});
        } // end try
        
        catch(e) {
            console.log(e);
        } // end catch
    } // end make sphere
    
    inputTriangles = getJSONFile(INPUT_TRIANGLES_URL,"triangles"); // read in the triangle data

    try {
        if (inputTriangles == String.null)
            throw "Unable to load triangles file!";
        else {
            var currSet; // the current triangle set
            var whichSetVert; // index of vertex in current triangle set
            var whichSetTri; // index of triangle in current triangle set
            var vtxToAdd; // vtx coords to add to the vertices array
            var normToAdd; // vtx normal to add to the normal array
            var uvToAdd; // uv coords to add to the uv arry
            var triToAdd; // tri indices to add to the index array
            var maxCorner = vec3.fromValues(Number.MIN_VALUE,Number.MIN_VALUE,Number.MIN_VALUE); // bbox corner
            var minCorner = vec3.fromValues(Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE); // other corner
        
            // process each triangle set to load webgl vertex and triangle buffers
            numTriangleSets = inputTriangles.length; // remember how many tri sets
            for (var whichSet=0; whichSet<numTriangleSets; whichSet++) { // for each tri set
                currSet = inputTriangles[whichSet];
                
                // set up hilighting, modeling translation and rotation
                currSet.center = vec3.fromValues(0,0,0);  // center point of tri set
                currSet.on = false; // not highlighted
                currSet.translation = vec3.fromValues(0,0,0); // no translation
                currSet.xAxis = vec3.fromValues(1,0,0); // model X axis
                currSet.yAxis = vec3.fromValues(0,1,0); // model Y axis 

                // set up the vertex, normal and uv arrays, define model center and axes
                currSet.glVertices = []; // flat coord list for webgl
                currSet.glNormals = []; // flat normal list for webgl
                currSet.glUvs = []; // flat texture coord list for webgl
                var numVerts = currSet.vertices.length; // num vertices in tri set
                for (whichSetVert=0; whichSetVert<numVerts; whichSetVert++) { // verts in set
                    vtxToAdd = currSet.vertices[whichSetVert]; // get vertex to add
                    normToAdd = currSet.normals[whichSetVert]; // get normal to add
                    uvToAdd = currSet.uvs[whichSetVert]; // get uv to add
                    currSet.glVertices.push(vtxToAdd[0],vtxToAdd[1],vtxToAdd[2]); // put coords in set vertex list
                    currSet.glNormals.push(normToAdd[0],normToAdd[1],normToAdd[2]); // put normal in set normal list
                    currSet.glUvs.push(uvToAdd[0],uvToAdd[1]); // put uv in set uv list
                    vec3.max(maxCorner,maxCorner,vtxToAdd); // update world bounding box corner maxima
                    vec3.min(minCorner,minCorner,vtxToAdd); // update world bounding box corner minima
                    vec3.add(currSet.center,currSet.center,vtxToAdd); // add to ctr sum
                } // end for vertices in set
                vec3.scale(currSet.center,currSet.center,1/numVerts); // avg ctr sum

                // send the vertex coords, normals and uvs to webGL; load texture
                vertexBuffers[whichSet] = gl.createBuffer(); // init empty webgl set vertex coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glVertices),gl.STATIC_DRAW); // data in
                normalBuffers[whichSet] = gl.createBuffer(); // init empty webgl set normal component buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glNormals),gl.STATIC_DRAW); // data in
                uvBuffers[whichSet] = gl.createBuffer(); // init empty webgl set uv coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(currSet.glUvs),gl.STATIC_DRAW); // data in
                loadTexture(whichSet,currSet,currSet.material.texture); // load tri set's texture

                // set up the triangle index array, adjusting indices across sets
                currSet.glTriangles = []; // flat index list for webgl
                triSetSizes[whichSet] = currSet.triangles.length; // number of tris in this set
                for (whichSetTri=0; whichSetTri<triSetSizes[whichSet]; whichSetTri++) {
                    triToAdd = currSet.triangles[whichSetTri]; // get tri to add
                    currSet.glTriangles.push(triToAdd[0],triToAdd[1],triToAdd[2]); // put indices in set list
                } // end for triangles in set

                // send the triangle indices to webGL
                triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[whichSet]); // activate that buffer
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(currSet.glTriangles),gl.STATIC_DRAW); // data in

            } // end for each triangle set 
        
            inputSpheres = getJSONFile(INPUT_SPHERES_URL,"spheres"); // read in the sphere data

            if (inputSpheres == String.null)
                throw "Unable to load spheres file!";
            else {
                
                // init sphere highlighting, translation and rotation; update bbox
                var sphere; // current sphere
                var temp = vec3.create(); // an intermediate vec3
                var minXYZ = vec3.create(), maxXYZ = vec3.create();  // min/max xyz from sphere
                numSpheres = inputSpheres.length; // remember how many spheres
                for (var whichSphere=0; whichSphere<numSpheres; whichSphere++) {
                    sphere = inputSpheres[whichSphere];
                    sphere.on = false; // spheres begin without highlight
                    sphere.translation = vec3.fromValues(0,0,0); // spheres begin without translation
                    sphere.xAxis = vec3.fromValues(1,0,0); // sphere X axis
                    sphere.yAxis = vec3.fromValues(0,1,0); // sphere Y axis 
                    sphere.center = vec3.fromValues(0,0,0); // sphere instance is at origin
                    vec3.set(minXYZ,sphere.x-sphere.r,sphere.y-sphere.r,sphere.z-sphere.r); 
                    vec3.set(maxXYZ,sphere.x+sphere.r,sphere.y+sphere.r,sphere.z+sphere.r); 
                    vec3.min(minCorner,minCorner,minXYZ); // update world bbox min corner
                    vec3.max(maxCorner,maxCorner,maxXYZ); // update world bbox max corner
                    loadTexture(numTriangleSets+whichSphere,sphere,sphere.texture); // load the sphere's texture
                } // end for each sphere
                viewDelta = vec3.length(vec3.subtract(temp,maxCorner,minCorner)) / 100; // set global

                // make one sphere instance that will be reused, with 32 longitude steps
                var oneSphere = makeSphere(32);

                // send the sphere vertex coords and normals to webGL
                vertexBuffers.push(gl.createBuffer()); // init empty webgl sphere vertex coord buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(oneSphere.vertices),gl.STATIC_DRAW); // data in
                normalBuffers.push(gl.createBuffer()); // init empty webgl sphere vertex normal buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(oneSphere.normals),gl.STATIC_DRAW); // data in
                uvBuffers.push(gl.createBuffer()); // init empty webgl sphere vertex uv buffer
                gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[uvBuffers.length-1]); // activate that buffer
                gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(oneSphere.uvs),gl.STATIC_DRAW); // data in
        
                triSetSizes.push(oneSphere.triangles.length);

                // send the triangle indices to webGL
                triangleBuffers.push(gl.createBuffer()); // init empty triangle index buffer
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, triangleBuffers[triangleBuffers.length-1]); // activate that buffer
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(oneSphere.triangles),gl.STATIC_DRAW); // data in
            } // end if sphere file loaded
        } // end if triangle file loaded
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end load models

// setup the webGL shaders
function setupShaders() {
    
    // define vertex shader in essl using es6 template strings
    var vShaderCode = `
        attribute vec3 aVertexPosition; // vertex position
        attribute vec3 aVertexNormal; // vertex normal
        attribute vec2 aVertexUV; // vertex texture uv
        
        uniform mat4 umMatrix; // the model matrix
        uniform mat4 upvmMatrix; // the project view model matrix
        
        varying vec3 vWorldPos; // interpolated world position of vertex
        varying vec3 vVertexNormal; // interpolated normal for frag shader
        varying vec2 vVertexUV; // interpolated uv for frag shader

        void main(void) {
            
            // vertex position
            vec4 vWorldPos4 = umMatrix * vec4(aVertexPosition, 1.0);
            vWorldPos = vec3(vWorldPos4.x,vWorldPos4.y,vWorldPos4.z);
            gl_Position = upvmMatrix * vec4(aVertexPosition, 1.0);

            // vertex normal (assume no non-uniform scale)
            vec4 vWorldNormal4 = umMatrix * vec4(aVertexNormal, 0.0);
            vVertexNormal = normalize(vec3(vWorldNormal4.x,vWorldNormal4.y,vWorldNormal4.z)); 
            
            // vertex uv
            vVertexUV = aVertexUV;
        }
    `;
    
    // define fragment shader in essl using es6 template strings
    var fShaderCode = `
        precision mediump float; // set float to medium precision

        // eye location
        uniform vec3 uEyePosition; // the eye's position in world
        
        // light properties
        uniform vec3 uLightAmbient; // the light's ambient color
        uniform vec3 uLightDiffuse; // the light's diffuse color
        uniform vec3 uLightSpecular; // the light's specular color
        uniform vec3 uLightPosition; // the light's position
        
        // material properties
        uniform vec3 uAmbient; // the ambient reflectivity
        uniform vec3 uDiffuse; // the diffuse reflectivity
        uniform vec3 uSpecular; // the specular reflectivity
        uniform float uShininess; // the specular exponent
        
        // texture properties
        uniform bool uUsingTexture; // if we are using a texture
        uniform sampler2D uTexture; // the texture for the fragment
        varying vec2 vVertexUV; // texture uv of fragment
            
        // geometry properties
        varying vec3 vWorldPos; // world xyz of fragment
        varying vec3 vVertexNormal; // normal of fragment
        
        void main(void) {
        
            // ambient term
            vec3 ambient = uAmbient*uLightAmbient; 
            
            // diffuse term
            vec3 normal = normalize(vVertexNormal); 
            vec3 light = normalize(uLightPosition - vWorldPos);
            float lambert = max(0.0,dot(normal,light));
            vec3 diffuse = uDiffuse*uLightDiffuse*lambert; // diffuse term
            
            // specular term
            vec3 eye = normalize(uEyePosition - vWorldPos);
            vec3 halfVec = normalize(light+eye);
            float highlight = pow(max(0.0,dot(normal,halfVec)),uShininess);
            vec3 specular = uSpecular*uLightSpecular*highlight; // specular term
            
            // combine to find lit color
            vec3 litColor = ambient + diffuse + specular; 
            
            if (!uUsingTexture) {
                gl_FragColor = vec4(litColor, 1.0);
            } else {
                vec4 texColor = texture2D(uTexture, vec2(vVertexUV.s, vVertexUV.t));
            
                // gl_FragColor = vec4(texColor.rgb * litColor, texColor.a);
                gl_FragColor = vec4(texColor.rgb * litColor, 1.0);
            } // end if using texture
        } // end main
    `;
    
    try {
        var fShader = gl.createShader(gl.FRAGMENT_SHADER); // create frag shader
        gl.shaderSource(fShader,fShaderCode); // attach code to shader
        gl.compileShader(fShader); // compile the code for gpu execution

        var vShader = gl.createShader(gl.VERTEX_SHADER); // create vertex shader
        gl.shaderSource(vShader,vShaderCode); // attach code to shader
        gl.compileShader(vShader); // compile the code for gpu execution
            
        if (!gl.getShaderParameter(fShader, gl.COMPILE_STATUS)) { // bad frag shader compile
            throw "error during fragment shader compile: " + gl.getShaderInfoLog(fShader);  
            gl.deleteShader(fShader);
        } else if (!gl.getShaderParameter(vShader, gl.COMPILE_STATUS)) { // bad vertex shader compile
            throw "error during vertex shader compile: " + gl.getShaderInfoLog(vShader);  
            gl.deleteShader(vShader);
        } else { // no compile errors
            var shaderProgram = gl.createProgram(); // create the single shader program
            gl.attachShader(shaderProgram, fShader); // put frag shader in program
            gl.attachShader(shaderProgram, vShader); // put vertex shader in program
            gl.linkProgram(shaderProgram); // link program into gl context

            if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) { // bad program link
                throw "error during shader program linking: " + gl.getProgramInfoLog(shaderProgram);
            } else { // no shader program link errors
                gl.useProgram(shaderProgram); // activate shader program (frag and vert)
                
                // locate and enable vertex attributes
                vPosAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexPosition"); // ptr to vertex pos attrib
                gl.enableVertexAttribArray(vPosAttribLoc); // connect attrib to array
                vNormAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexNormal"); // ptr to vertex normal attrib
                gl.enableVertexAttribArray(vNormAttribLoc); // connect attrib to array
                vUVAttribLoc = gl.getAttribLocation(shaderProgram, "aVertexUV"); // ptr to vertex UV attrib
                gl.enableVertexAttribArray(vUVAttribLoc); // connect attrib to array
                
                // locate vertex uniforms
                mMatrixULoc = gl.getUniformLocation(shaderProgram, "umMatrix"); // ptr to mmat
                pvmMatrixULoc = gl.getUniformLocation(shaderProgram, "upvmMatrix"); // ptr to pvmmat
                
                // locate fragment uniforms
                var eyePositionULoc = gl.getUniformLocation(shaderProgram, "uEyePosition"); // ptr to eye position
                var lightAmbientULoc = gl.getUniformLocation(shaderProgram, "uLightAmbient"); // ptr to light ambient
                var lightDiffuseULoc = gl.getUniformLocation(shaderProgram, "uLightDiffuse"); // ptr to light diffuse
                var lightSpecularULoc = gl.getUniformLocation(shaderProgram, "uLightSpecular"); // ptr to light specular
                var lightPositionULoc = gl.getUniformLocation(shaderProgram, "uLightPosition"); // ptr to light position
                ambientULoc = gl.getUniformLocation(shaderProgram, "uAmbient"); // ptr to ambient
                diffuseULoc = gl.getUniformLocation(shaderProgram, "uDiffuse"); // ptr to diffuse
                specularULoc = gl.getUniformLocation(shaderProgram, "uSpecular"); // ptr to specular
                shininessULoc = gl.getUniformLocation(shaderProgram, "uShininess"); // ptr to shininess
                usingTextureULoc = gl.getUniformLocation(shaderProgram, "uUsingTexture"); // ptr to using texture
                textureULoc = gl.getUniformLocation(shaderProgram, "uTexture"); // ptr to texture
                
                // pass global (not per model) constants into fragment uniforms
                gl.uniform3fv(eyePositionULoc,Eye); // pass in the eye's position
                gl.uniform3fv(lightAmbientULoc,lightAmbient); // pass in the light's ambient emission
                gl.uniform3fv(lightDiffuseULoc,lightDiffuse); // pass in the light's diffuse emission
                gl.uniform3fv(lightSpecularULoc,lightSpecular); // pass in the light's specular emission
                gl.uniform3fv(lightPositionULoc,lightPosition); // pass in the light's position
            } // end if no shader program link errors
        } // end if no compile errors
    } // end try 
    
    catch(e) {
        console.log(e);
    } // end catch
} // end setup shaders

const keys = {
    w: false,
    a: false,
    s: false,
    d: false
};

const movement = {
    speed: 0.01,         // Base movement speed
    mouseSensitivity: 0.002  // Mouse look sensitivity
};

function setupControls() {
    // Key listeners
    document.addEventListener('keydown', (e) => {
        switch(e.code) {
            case 'KeyW': keys.w = true; break;
            case 'KeyA': keys.a = true; break;
            case 'KeyS': keys.s = true; break;
            case 'KeyD': keys.d = true; break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': keys.w = false; break;
            case 'KeyA': keys.a = false; break;
            case 'KeyS': keys.s = false; break;
            case 'KeyD': keys.d = false; break;
        }
    });

    // Mouse look controls
    document.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === canvas) {
            const dx = e.movementX * movement.mouseSensitivity;
            const dy = e.movementY * movement.mouseSensitivity;
            
            // Rotate camera left/right
            const rotationMatrix = mat4.create();
            mat4.rotateY(rotationMatrix, rotationMatrix, dx);
            
            // Update look direction
            const lookDir = vec3.subtract(vec3.create(), Center, Eye);
            vec3.transformMat4(lookDir, lookDir, rotationMatrix);
            vec3.add(Center, Eye, lookDir);
            
            // Rotate camera up/down
            const right = vec3.cross(vec3.create(), lookDir, Up);
            vec3.normalize(right, right);
            
            // Limit vertical rotation to avoid flipping
            const currentPitch = Math.asin(lookDir[1] / vec3.length(lookDir));
            const newPitch = currentPitch - dy;
            if (newPitch < Math.PI/2 && newPitch > -Math.PI/2) {
                const pitchMatrix = mat4.create();
                mat4.rotate(pitchMatrix, pitchMatrix, -dy, right);
                vec3.transformMat4(lookDir, lookDir, pitchMatrix);
                vec3.add(Center, Eye, lookDir);
            }
        }
    });

    // Lock pointer on canvas click
    canvas.addEventListener('click', () => {
        canvas.requestPointerLock();
    });
}

// Add this function to handle movement
function updateMovement() {
    const lookDir = vec3.subtract(vec3.create(), Center, Eye);
    vec3.normalize(lookDir, lookDir);
    
    const right = vec3.cross(vec3.create(), lookDir, Up);
    vec3.normalize(right, right);
    
    const movement_vector = vec3.create();
    
    if(keys.w) vec3.add(movement_vector, movement_vector, lookDir);
    if(keys.s) vec3.subtract(movement_vector, movement_vector, lookDir);
    if(keys.a) vec3.add(movement_vector, movement_vector, right);
    if(keys.d) vec3.subtract(movement_vector, movement_vector, right);
    
    if(vec3.length(movement_vector) > 0) {
        vec3.normalize(movement_vector, movement_vector);
        vec3.scale(movement_vector, movement_vector, movement.speed);
        
        // Update both Eye and Center to maintain the same look direction
        vec3.add(Eye, Eye, movement_vector);
        vec3.add(Center, Center, movement_vector);
    }
}

// render the loaded model
function renderModels() {
    const frameStartTime = performance.now();
    updateMovement();
    // Reset performance counters at start of frame
    perfStats.trianglesRendered = 0;
    perfStats.roomsVisible = 0;
    perfStats.spheresVisible = 0;
    perfStats.triangleSetsVisible = 0;

    // Track frame time using 10-frame rolling average
    if (perfStats.frameStartTimes[perfStats.frameIndex]) {
        const lastFrameTime = frameStartTime - perfStats.frameStartTimes[perfStats.frameIndex];
        perfStats.frameTimeAccumulator += lastFrameTime;
    }
    perfStats.frameStartTimes[perfStats.frameIndex] = frameStartTime;
    perfStats.frameIndex = (perfStats.frameIndex + 1) % 10;

    // Calculate average frame time every 10 frames
    if (perfStats.frameCount % 10 === 0) {
        perfStats.frameTime = perfStats.frameTimeAccumulator / 10;
        perfStats.frameTimeAccumulator = 0;
    }
    perfStats.frameCount++;

    // construct the model transform matrix, based on model state
    function makeModelTransform(currModel) {
        var zAxis = vec3.create(), sumRotation = mat4.create(), temp = mat4.create(), negCenter = vec3.create();

        vec3.normalize(zAxis,vec3.cross(zAxis,currModel.xAxis,currModel.yAxis)); // get the new model z axis
        mat4.set(sumRotation, // get the composite rotation
            currModel.xAxis[0], currModel.yAxis[0], zAxis[0], 0,
            currModel.xAxis[1], currModel.yAxis[1], zAxis[1], 0,
            currModel.xAxis[2], currModel.yAxis[2], zAxis[2], 0,
            0, 0,  0, 1);
        vec3.negate(negCenter,currModel.center);
        mat4.multiply(sumRotation,sumRotation,mat4.fromTranslation(temp,negCenter)); // rotate * -translate
        mat4.multiply(sumRotation,mat4.fromTranslation(temp,currModel.center),sumRotation); // translate * rotate * -translate
        mat4.fromTranslation(mMatrix,currModel.translation); // translate in model matrix
        mat4.multiply(mMatrix,mMatrix,sumRotation); // rotate in model matrix
    } // end make model transform
    
    var hMatrix = mat4.create(); // handedness matrix
    var pMatrix = mat4.create(); // projection matrix
    var vMatrix = mat4.create(); // view matrix
    var mMatrix = mat4.create(); // model matrix
    var hpvMatrix = mat4.create(); // hand * proj * view matrices
    var hpvmMatrix = mat4.create(); // hand * proj * view * model matrices
    const HIGHLIGHTMATERIAL = 
        {ambient:[0.5,0.5,0], diffuse:[0.5,0.5,0], specular:[0,0,0], n:1, alpha:1, texture:false}; // hlht mat
    
    gl.clear(/*gl.COLOR_BUFFER_BIT |*/ gl.DEPTH_BUFFER_BIT); // clear frame/depth buffers
    
    
    // set up handedness, projection and view
    mat4.fromScaling(hMatrix,vec3.fromValues(-1,1,1)); // create handedness matrix
    mat4.perspective(pMatrix, 
        Math.PI/3,  // 60 degree FOV
        gl.canvas.width/gl.canvas.height,  // Proper aspect ratio
        0.1,  // Near plane
        30.0  // Far plane - adjust based on your scene size
    );
    mat4.lookAt(vMatrix,Eye,Center,Up); // create view matrix
    mat4.multiply(hpvMatrix,hMatrix,pMatrix); // handedness * projection
    mat4.multiply(hpvMatrix,hpvMatrix,vMatrix); // handedness * projection * view

    const planes = extractFrustumPlanes(hpvMatrix);
    updateRoomVisibility(planes);
    
    inputRooms.forEach(room => {
        if(room.type === ROOM_TYPES.ROOM && room.visible) {
            // Set up matrices for room
            perfStats.roomsVisible++;
            //perfStats.trianglesRendered += room.triangleCount/3;

            mat4.identity(mMatrix);
            mat4.multiply(hpvmMatrix, hpvMatrix, mMatrix);
            gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix);
            gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix);

            gl.uniform3fv(ambientULoc, ROOM_MATERIAL.ambient);
            gl.uniform3fv(diffuseULoc, ROOM_MATERIAL.diffuse);
            gl.uniform3fv(specularULoc, ROOM_MATERIAL.specular);
            gl.uniform1f(shininessULoc, ROOM_MATERIAL.n);

            gl.uniform1i(usingTextureULoc, true);

            // Bind room buffers
            gl.bindBuffer(gl.ARRAY_BUFFER, room.vertexBuffer);
            gl.vertexAttribPointer(vPosAttribLoc, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, room.normalBuffer);
            gl.vertexAttribPointer(vNormAttribLoc, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, room.uvBuffer);
            gl.vertexAttribPointer(vUVAttribLoc, 2, gl.FLOAT, false, 0, 0);

            // Draw room
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, room.triangleBuffer);
            gl.drawElements(gl.TRIANGLES, room.triangleCount, gl.UNSIGNED_SHORT, 0);

            gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, textures[room.textureIndex]);
gl.uniform1i(textureULoc, 0);
        }
    });

    // render each triangle set
    var currSet, setMaterial; // the tri set and its material properties
    for (var whichTriSet=0; whichTriSet<numTriangleSets; whichTriSet++) {
        currSet = inputTriangles[whichTriSet];
        

        if(currSet.roomId === undefined) continue;

        const room = inputRooms.find(r => r.type === ROOM_TYPES.ROOM && r.id === currSet.roomId);
        if(!room || !room.visible) continue;

        if(currSet.roomId !== undefined) {
            const room = inputRooms.find(r => r.type === ROOM_TYPES.ROOM && r.id === currSet.roomId);
            if(!room || !room.visible) continue;
        }
        perfStats.triangleSetsVisible++;
        //perfStats.trianglesRendered += triSetSizes[whichTriSet] * 3;

        // make model transform, add to view project
        makeModelTransform(currSet);
        mat4.multiply(hpvmMatrix,hpvMatrix,mMatrix); // handedness * project * view * model
        gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in the m matrix
        gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix); // pass in the hpvm matrix
        
        // reflectivity: feed to the fragment shader
        if (inputTriangles[whichTriSet].on)
            setMaterial = HIGHLIGHTMATERIAL; // highlight material
        else
            setMaterial = currSet.material; // normal material
        gl.uniform3fv(ambientULoc,setMaterial.ambient); // pass in the ambient reflectivity
        gl.uniform3fv(diffuseULoc,setMaterial.diffuse); // pass in the diffuse reflectivity
        gl.uniform3fv(specularULoc,setMaterial.specular); // pass in the specular reflectivity
        gl.uniform1f(shininessULoc,setMaterial.n); // pass in the specular exponent
        gl.uniform1i(usingTextureULoc,(currSet.material.texture != false)); // whether the set uses texture
        gl.activeTexture(gl.TEXTURE0); // bind to active texture 0 (the first)
        gl.bindTexture(gl.TEXTURE_2D, textures[whichTriSet]); // bind the set's texture
        gl.uniform1i(textureULoc, 0); // pass in the texture and active texture 0
        
        // position, normal and uv buffers: activate and feed into vertex shader
        gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[whichTriSet]); // activate position
        gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[whichTriSet]); // activate normal
        gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed
        gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[whichTriSet]); // activate uv
        gl.vertexAttribPointer(vUVAttribLoc,2,gl.FLOAT,false,0,0); // feed

        // triangle buffer: activate and render
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[whichTriSet]); // activate
        gl.drawElements(gl.TRIANGLES,3*triSetSizes[whichTriSet],gl.UNSIGNED_SHORT,0); // render
        
    } // end for each triangle set
    
    // render each sphere
    var sphere, currentMaterial, instanceTransform = mat4.create(); // the current sphere and material
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffers[vertexBuffers.length-1]); // activate vertex buffer
    gl.vertexAttribPointer(vPosAttribLoc,3,gl.FLOAT,false,0,0); // feed vertex buffer to shader
    gl.bindBuffer(gl.ARRAY_BUFFER,normalBuffers[normalBuffers.length-1]); // activate normal buffer
    gl.vertexAttribPointer(vNormAttribLoc,3,gl.FLOAT,false,0,0); // feed normal buffer to shader
    gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffers[uvBuffers.length-1]); // activate uv
    gl.vertexAttribPointer(vUVAttribLoc,2,gl.FLOAT,false,0,0); // feed
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,triangleBuffers[triangleBuffers.length-1]); // activate tri buffer
    
    for (var whichSphere=0; whichSphere<numSpheres; whichSphere++) {
        sphere = inputSpheres[whichSphere];

        if(currSet.roomId === undefined) continue;

        const room = inputRooms.find(r => r.type === ROOM_TYPES.ROOM && r.id === currSet.roomId);
        if(!room || !room.visible) continue;
        
    
        if(sphere.roomId !== undefined) {
            const room = inputRooms.find(r => r.type === ROOM_TYPES.ROOM && r.id === sphere.roomId);
            if(!room || !room.visible) continue;
        }


        
        perfStats.triangleSetsVisible++;
        perfStats.trianglesRendered += triSetSizes[whichTriSet] * 3;

        // define model transform, premult with pvmMatrix, feed to shader
        makeModelTransform(sphere);
        mat4.fromTranslation(instanceTransform,vec3.fromValues(sphere.x,sphere.y,sphere.z)); // recenter sphere
        mat4.scale(mMatrix,mMatrix,vec3.fromValues(sphere.r,sphere.r,sphere.r)); // change size
        mat4.multiply(mMatrix,instanceTransform,mMatrix); // apply recenter sphere
        hpvmMatrix = mat4.multiply(hpvmMatrix,hpvMatrix,mMatrix); // premultiply with hpv matrix
        gl.uniformMatrix4fv(mMatrixULoc, false, mMatrix); // pass in model matrix
        gl.uniformMatrix4fv(pvmMatrixULoc, false, hpvmMatrix); // pass in handed project view model matrix

        // reflectivity: feed to the fragment shader
        if (sphere.on)
            currentMaterial = HIGHLIGHTMATERIAL;
        else
            currentMaterial = sphere;
        gl.uniform3fv(ambientULoc,currentMaterial.ambient); // pass in the ambient reflectivity
        gl.uniform3fv(diffuseULoc,currentMaterial.diffuse); // pass in the diffuse reflectivity
        gl.uniform3fv(specularULoc,currentMaterial.specular); // pass in the specular reflectivity
        gl.uniform1f(shininessULoc,currentMaterial.n); // pass in the specular exponent
        gl.uniform1i(usingTextureULoc,(sphere.texture != false)); // whether the sphere uses texture
        gl.activeTexture(gl.TEXTURE0); // bind to active texture 0 (the first)
        gl.bindTexture(gl.TEXTURE_2D, textures[numTriangleSets+whichSphere]); // bind the set's texture
        gl.uniform1i(textureULoc, 0); // pass in the texture and active texture 0

        // draw a transformed instance of the sphere
        gl.drawElements(gl.TRIANGLES,triSetSizes[triSetSizes.length-1],gl.UNSIGNED_SHORT,0); // render
    } // end for each sphere


    
    displayPerfStats();
    window.requestAnimationFrame(renderModels);

} // end render model


/* MAIN -- HERE is where execution begins after window load */

function main() {
  
  setupWebGL(); // set up the webGL environment
  setupControls(); // Add this line
  loadRoomData(); //loading up the room environment
  loadModels(); // load in the models from tri file
  setupShaders(); // setup the webGL shaders
  renderModels(); // draw the triangles using webGL
}