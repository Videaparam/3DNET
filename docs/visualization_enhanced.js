// Party colors configuration
const partyColors = {
    "AKP": new THREE.Color(0xFF8000), 
    "CHP": new THREE.Color(0xCC0000),
    "HDP": new THREE.Color(0x800080),
    "MHP": new THREE.Color(0x333333),
    "DEVA": new THREE.Color(0x007BA7),
    "GELECEK": new THREE.Color(0x228B22),
    "SAADET": new THREE.Color(0x808080),
    "DP": new THREE.Color(0xA9A9A9),
    "IYI": new THREE.Color(0xD3D3D3),
};

// Global variables
let scene, camera, renderer, controls;
let selectedNode = null;

let nodes = {}, edges = [];
let sampledNodes = new Set();
let useBundledEdges = true;
let edgeMaterials = new Map();
let boundingBox = { 
    minX: Infinity, maxX: -Infinity, 
    minY: Infinity, maxY: -Infinity, 
    minZ: Infinity, maxZ: -Infinity 
};

let selectedParties = new Set(Object.keys(partyColors));




// Interaction variables
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();


function makeShiny(color) {
    // Clone the original color and increase brightness slightly for the specular highlight.
    const shinyColor = color.clone();
    shinyColor.offsetHSL(0, 0, 1); // adjust brightness; experiment with the value
    return shinyColor;
  }

  

// Initialize application
function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color("#031430");
    scene.fog = new THREE.Fog(0x000000, 1000, 20000);

    // Renderer setup with WebGL preservation
    try {
        renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,              // enable alpha for transparency
            preserveDrawingBuffer: true // Essential for PDF export
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight);
       // Set the clear color with 0 alpha (transparent)
        renderer.setClearColor(0x111111, 0);
        document.body.appendChild(renderer.domElement);
    } catch (error) {
        alert("WebGL initialization failed: " + error);
        return;
    }
    

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000000);
    
    // Controls configuration
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 100000;

    // Lighting
    // scene.add(new THREE.AmbientLight(0x404040));

    // Add a directional light to your scene
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);

    // Optionally, add a point light for extra illumination
    // const pointLight = new THREE.PointLight(0xffffff, 0.8);
    // pointLight.position.set(-10, -10, 10);
    // scene.add(pointLight);



    // Event listeners
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasHover);
    window.addEventListener('resize', onWindowResize);

    // Create the party legend
    createLegend();

    // Initialize data loading
    loadData();
}



// Data loading functions
function loadData() {
    d3.csv("data/sampled_nodes_test_15.csv").then(data => {
        data.forEach(processNodeData);
        adjustCamera();
        loadEdges();
    }).catch(console.error);
    updateNetworkVisibility();

}

function processNodeData(d) {
    const id = d.id.trim();
    sampledNodes.add(id);
    
    const x = parseFloat(d.x), y = parseFloat(d.y), z = parseFloat(d.z);
    updateBoundingBox(x, y, z);

    const node = createNode(d, x, y, z);
    scene.add(node);
    nodes[id] = node;
}

function createNode(d, x, y, z) {
    const geometry = new THREE.SphereGeometry(parseFloat(d.size) / 0.5, 32, 32);
    const color = partyColors[d.party] || new THREE.Color(0xFFFFFF);
    
    const material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.1,  // lower metalness to let the base color show
        roughness: 0.4,  // adjust roughness for a balanced shiny look
        emissive: new THREE.Color(0x000000), // set emissive to black to avoid tinting the color
        transparent: true,
        opacity: 1.0
    });
    
    const node = new THREE.Mesh(geometry, material);
    node.position.set(x, y, z);
    node.userData = { 
        id: d.id, 
        title: d.title, 
        party: d.party, 
        connections: [] 
    };
    
    return node;
}




// Edge management
function loadEdges() {
    const edgeFile = useBundledEdges ? "bundled_edges_test_15.csv" : "data/sampled_edges_test_15.csv";
    
    d3.csv(edgeFile).then(data => {
        scene.children = scene.children.filter(obj => !(obj instanceof THREE.Line));
        edgeMaterials.clear();

        const edgeMaterial = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: useBundledEdges ? 0.3 : 0.8,
            linewidth: 0.1,
            depthTest: true
        });

        edgeMaterials.set(edgeMaterial.uuid, edgeMaterial);
        data.forEach(d => processEdge(d, edgeMaterial));
    }).catch(console.error);
}

function processEdge(d, material) {
    const source = d.source.trim(), target = d.target.trim();
    if (!sampledNodes.has(source) || !sampledNodes.has(target)) return;

    const points = parsePoints(d.points);
    if (points.length < 2) return;

    const sourceNode = nodes[source];
    const partyColor = partyColors[sourceNode.userData.party] || new THREE.Color(0xFFFFFF);

    const geometry = new THREE.BufferGeometry();
    const colors = createEdgeColors(points, partyColor);
    
    geometry.setFromPoints(points);
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Clone the material so each edge has its own instance
    const edgeMaterial = material.clone();
    const line = new THREE.Line(geometry, edgeMaterial);
    line.userData = { source, target };
    scene.add(line);
}


// Helper functions
function parsePoints(pointsString) {
    return pointsString?.split('|').map(p => {
        const coords = p.split(';').map(parseFloat);
        return coords.length === 3 ? new THREE.Vector3(...coords) : null;
    }).filter(p => p !== null) || [];
}

function createEdgeColors(points, baseColor) {
    const colors = [];
    const colorStart = baseColor.clone();
    const colorEnd = baseColor.clone().multiplyScalar(0.5);
    
    for (let i = 0; i < points.length; i++) {
        const color = colorStart.clone().lerp(colorEnd, i/points.length);
        colors.push(color.r, color.g, color.b);
    }
    return colors.flat();
}

// Interaction handlers
function onCanvasClick(event) {
    mouse.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);

    if (intersects.length > 0 && intersects[0].object instanceof THREE.Mesh) {
        // Set the selected node and update edge opacities accordingly
        selectedNode = intersects[0].object;
        onNodeClick(selectedNode);
    } else {
        // If clicked on empty space, clear selection and reset edge opacities
        selectedNode = null;
        resetEdgesOpacity();
        hideNodeTitle();
    }
}


function hideNodeTitle() {
    const titleDiv = document.getElementById('nodeTitle');
    titleDiv.style.display = 'none';
}


function onCanvasHover(event) {
    mouse.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    const node = intersects.find(i => i.object instanceof THREE.Mesh);
    if (node) {
        onNodeHover(node.object);
    } else {
        onNodeHoverEnd();
    }
}


function onNodeHover(node) {
    // Highlight the node
    if (node.material) node.material.emissive.setHex(0x333333);

    // Show and update the title overlay
    const titleDiv = document.getElementById('nodeTitle');
    titleDiv.textContent = node.userData.title;
    titleDiv.style.display = 'block';

    // Project the node's 3D position to 2D screen coordinates
    const pos = node.position.clone();
    pos.project(camera);
    const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

    // Position the title near the node (adjust offsets as needed)
    titleDiv.style.left = `${x}px`;
    titleDiv.style.top = `${y}px`;
}

function onNodeHoverEnd() {
    // Reset node highlights
    scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material) {
            child.material.emissive.setHex(0x000000);
        }
    });
    // Hide the title overlay
    hideNodeTitle();
}



////////////// on node click //////////////////
/////////simple version
// function onNodeClick(node) {
//     scene.children.forEach(child => {
//         if (child instanceof THREE.Line) {
//             const isConnected = [child.userData.source, child.userData.target].includes(node.userData.id);
//             child.material.opacity = isConnected ? 0.9 : 0.1;
//         }
//     });
// }


function resetEdgesOpacity() {
    const defaultOpacity = useBundledEdges ? 0.3 : 0.7;
    scene.children.forEach(child => {
        if (child instanceof THREE.Line) {
            child.material.opacity = defaultOpacity;
        }
    });
}

function hideNodeTitle() {
    const titleDiv = document.getElementById('nodeTitle');
    titleDiv.style.display = 'none';
}



function onNodeClick(node) {
    scene.children.forEach(child => {
        if (child instanceof THREE.Line) {
            const isConnected = [child.userData.source, child.userData.target].includes(node.userData.id);
            child.material.opacity = isConnected ? 1.0 : 0.1;
        }
    });
}




function createLegend() {
    const legendDiv = document.getElementById('legend');
    if (!legendDiv) return;
    
    // Add a title to the legend
    legendDiv.innerHTML = '<div style="font-weight: bold; margin-bottom: 5px;">Party Legend</div>';
    
    // Loop through each party and add a legend item
    for (const party in partyColors) {
        // Get the hex string of the color. THREE.Color's getHexString() returns a string like "ff8000".
        const colorHex = '#' + partyColors[party].getHexString();
        
        // Create a new div for this legend item
        const legendItem = document.createElement('div');
        legendItem.style.display = 'flex';
        legendItem.style.alignItems = 'center';
        legendItem.style.marginBottom = '3px';
        
        // Set the inner HTML: a colored box and the party name
        legendItem.innerHTML = `
            <div style="width: 12px; height: 12px; background: ${colorHex}; margin-right: 5px; border: 1px solid #000;"></div>
            <span>${party}</span>
        `;
        
        // Append the item to the legend container
        legendDiv.appendChild(legendItem);
    }
}






// System functions
function updateBoundingBox(x, y, z) {
    boundingBox.minX = Math.min(boundingBox.minX, x);
    boundingBox.maxX = Math.max(boundingBox.maxX, x);
    boundingBox.minY = Math.min(boundingBox.minY, y);
    boundingBox.maxY = Math.max(boundingBox.maxY, y);
    boundingBox.minZ = Math.min(boundingBox.minZ, z);
    boundingBox.maxZ = Math.max(boundingBox.maxZ, z);
}

function adjustCamera() {
    const center = new THREE.Vector3(
        (boundingBox.minX + boundingBox.maxX) / 2,
        (boundingBox.minY + boundingBox.maxY) / 2,
        (boundingBox.minZ + boundingBox.maxZ) / 2
    );
    
    const maxDim = Math.max(
        boundingBox.maxX - boundingBox.minX,
        boundingBox.maxY - boundingBox.minY,
        boundingBox.maxZ - boundingBox.minZ
    );
    
    camera.position.copy(center).add(new THREE.Vector3(0, 0, maxDim * 1.5));
    controls.target.copy(center);
    controls.update();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updatePartyFilter() {
    // Reset the selected parties set
    selectedParties.clear();
    document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
        if (checkbox.checked) {
            selectedParties.add(checkbox.value);
        }
    });
    updateNetworkVisibility();
}
function updateNetworkVisibility() {
    // Update nodes
    for (let id in nodes) {
        const node = nodes[id];
        if (selectedParties.has(node.userData.party)) {
            node.material.opacity = 1.0;
        } else {
            node.material.opacity = 0.1;
        }
    }
    
    // Update edges
    scene.children.forEach(child => {
        if (child instanceof THREE.Line) {
            // Get the parties of both endpoints
            const sourceParty = nodes[child.userData.source].userData.party;
            const targetParty = nodes[child.userData.target].userData.party;
            
            // Highlight edge if both endpoints are in selected parties
            if (selectedParties.has(sourceParty) && selectedParties.has(targetParty)) {
                child.material.opacity = 1.0;
            } else {
                child.material.opacity = 0.1;
            }
        }
    });
}


document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', updatePartyFilter);
  });

  
// PDF Export
document.getElementById('exportPDF').addEventListener('click', () => {
    // Save current scene background and remove it for transparent export.
    const originalSceneBackground = scene.background;
    scene.background = null;

    // Save the original renderer size.
    const originalSize = { 
        width: renderer.domElement.width, 
        height: renderer.domElement.height 
    };
    // Set a higher scale factor for high-resolution export.
    const scaleFactor = 4;  

    // Temporarily resize renderer for high-resolution capture.
    renderer.setSize(originalSize.width * scaleFactor, originalSize.height * scaleFactor, false);
    camera.aspect = (originalSize.width * scaleFactor) / (originalSize.height * scaleFactor);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // Capture the renderer's canvas with html2canvas, ensuring no background.
    html2canvas(renderer.domElement, {
        scale: scaleFactor,
        backgroundColor: null  // Ensures the canvas is captured with a transparent background.
    }).then(canvas => {
        // Restore the scene background and original renderer size.
        scene.background = originalSceneBackground;
        renderer.setSize(originalSize.width, originalSize.height, false);
        camera.aspect = originalSize.width / originalSize.height;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);

        // Get the high-resolution PNG data URL.
        const pngDataURL = canvas.toDataURL('image/png');

        // Create a PDF using the canvas dimensions.
        const pdf = new jspdf.jsPDF('landscape', 'pt', [canvas.width, canvas.height]);
        pdf.addImage(pngDataURL, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save('network-visualization.pdf');

        // Also, trigger a download for the high-resolution PNG.
        const a = document.createElement('a');
        a.href = pngDataURL;
        a.download = 'network-visualization.png';
        a.click();
    });
});



// Animation loop
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    edgeMaterials.forEach(mat => mat.opacity = Math.min(mat.opacity + 0.005, 0.7));
    renderer.render(scene, camera);
}

// Start application
init();
animate();