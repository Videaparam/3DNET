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
  "IYI": new THREE.Color(0xD3D3A9),
  "TİP": new THREE.Color(0xFFD700),
};

// Global variables
let scene, camera, renderer, controls;
let selectedNode = null;
let nodes = {}, edges = [];
let sampledNodes = new Set();
let useBundledEdges = true;
let boundingBox = { 
  minX: Infinity, maxX: -Infinity, 
  minY: Infinity, maxY: -Infinity, 
  minZ: Infinity, maxZ: -Infinity 
};

let selectedParties = new Set(Object.keys(partyColors));

// Interaction variables
let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();

// For the node title toggle
let showAllTitles = false;
let nodeLabels = {};

// Globals for optimized edges using LineSegments
let edgeSegments;       // Combined THREE.LineSegments for all edges
let edgeMeta = [];      // Array storing metadata for each segment (source, target, parties)

// Utility function to create a shiny variant of a color.
function makeShiny(color) {
  const shinyColor = color.clone();
  shinyColor.offsetHSL(0, 0, 1);
  return shinyColor;
}

// -----------------
// Define onWindowResize (must be defined before use)
// -----------------
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// -----------------
// Create Legend Function (restores legacy legend functionality)
// -----------------
function createLegend() {
  const legendDiv = document.getElementById('legend');
  if (!legendDiv) return;
  
  legendDiv.innerHTML = '<div style="font-weight: bold; margin-bottom: 5px;">Party Legend</div>';
  
  for (const party in partyColors) {
    const colorHex = '#' + partyColors[party].getHexString();
    const legendItem = document.createElement('div');
    legendItem.style.display = 'flex';
    legendItem.style.alignItems = 'center';
    legendItem.style.marginBottom = '3px';
    legendItem.innerHTML = `
      <div style="width: 8px; height: 8px; background: ${colorHex}; margin-right: 5px; border: 1px solid #000;"></div>
      <span>${party}</span>
    `;
    legendDiv.appendChild(legendItem);
  }
}

// -----------------
// Initialize application
// -----------------
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#031430");
  scene.fog = new THREE.Fog(0x000000, 1000, 20000);

  try {
    renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true
    });
    // renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.2)); // Lower for low-end GPUs
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x111111, 0);
    document.body.appendChild(renderer.domElement);
  } catch (error) {
    alert("WebGL initialization failed: " + error);
    return;
  }
  
  camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000000);
  
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.5;
  controls.minDistance = 50;
  controls.maxDistance = 1000000;
  controls.rotateSpeed = 0.9;    // Smoother
  controls.zoomSpeed = 1;      // Smoother
  controls.panSpeed = 0.5;     // Smoother
  controls.enablePan = true;

  scene.add(new THREE.AmbientLight("#ffffff"));

  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(10, 10, 10);
  scene.add(directionalLight);

  const pointLight = new THREE.PointLight(0xffffff, 1);
  pointLight.position.set(-10, -10, 10);
  scene.add(pointLight);

  // Attach event listeners
  window.addEventListener('resize', onWindowResize);
  renderer.domElement.addEventListener('click', onCanvasClick);
  renderer.domElement.addEventListener('mousemove', onCanvasHover);

  createLegend();
  loadData();

  // Single Toggle Button for (Un)Select All
  document.getElementById('toggleSelect').addEventListener('click', () => {
    const checkboxes = document.querySelectorAll('#partyFilters input[type="checkbox"]');
    let allSelected = true;
    checkboxes.forEach((checkbox) => {
      if(checkbox.id !== "toggleNodeTitles" && !checkbox.checked) {
        allSelected = false;
      }
    });
    if (allSelected) {
      // Unselect all
      checkboxes.forEach((checkbox) => {
        if(checkbox.id !== "toggleNodeTitles") checkbox.checked = false;
      });
      document.getElementById('toggleSelect').innerText = "Select All";
    } else {
      // Select all
      checkboxes.forEach((checkbox) => {
        if(checkbox.id !== "toggleNodeTitles") checkbox.checked = true;
      });
      document.getElementById('toggleSelect').innerText = "Unselect All";
    }
    updatePartyFilter();
  });
  
  // Toggle for showing all node titles
  document.getElementById('toggleNodeTitles').addEventListener('change', (e) => {
    showAllTitles = e.target.checked;
    if (!showAllTitles) {
      // Remove all existing node labels if toggle is off
      for (let id in nodeLabels) {
        let label = nodeLabels[id];
        if(label.parentNode) label.parentNode.removeChild(label);
      }
      nodeLabels = {};
    }
  });
}

// -----------------
// Data loading functions
// -----------------
function loadData() {
  d3.csv("Data/sampled_nodes_test_edgebundling.csv").then(data => {
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
    metalness: 0.1,
    roughness: 0.6,
    emissive: new THREE.Color(0x000000),
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

// -----------------
// Optimized edge loading using THREE.LineSegments
// -----------------
function loadEdges() {
  const edgeFile = useBundledEdges ? "bundled_output_dijkstra.csv" : "Data/sampled_edges_test_edgebundling.csv";
  d3.csv(edgeFile).then(data => {
    // Remove existing edge segments if any
    if (edgeSegments) {
      scene.remove(edgeSegments);
    }
    edgeMeta = [];
    
    // First pass: count total segments
    let totalSegments = 0;
    data.forEach(d => {
      const source = d.source.trim(), target = d.target.trim();
      if (!sampledNodes.has(source) || !sampledNodes.has(target)) return;
      const points = parsePoints(d.points);
      if (points.length < 2) return;
      totalSegments += (points.length - 1);
    });
    
    // Preallocate typed arrays for positions, colors, and alpha values.
    const positions = new Float32Array(totalSegments * 2 * 3); // 2 vertices per segment, 3 coordinates each
    const colorsArray = new Float32Array(totalSegments * 2 * 3);
    const alphas = new Float32Array(totalSegments * 2);
    
    let segmentIndex = 0;
    data.forEach(d => {
      const source = d.source.trim(), target = d.target.trim();
      if (!sampledNodes.has(source) || !sampledNodes.has(target)) return;
      const points = parsePoints(d.points);
      if (points.length < 2) return;
      
      const sourceNode = nodes[source];
      const partyColor = partyColors[sourceNode.userData.party] || new THREE.Color(0xFFFFFF);
      const edgeColors = createEdgeColors(points, partyColor);
      
      for (let i = 0; i < points.length - 1; i++) {
        const posOffset = segmentIndex * 2 * 3;
        // First vertex of the segment
        positions[posOffset]     = points[i].x;
        positions[posOffset + 1] = points[i].y;
        positions[posOffset + 2] = points[i].z;
        // Second vertex of the segment
        positions[posOffset + 3] = points[i + 1].x;
        positions[posOffset + 4] = points[i + 1].y;
        positions[posOffset + 5] = points[i + 1].z;
        
        // Colors for each vertex (using computed gradient)
        colorsArray[posOffset]     = edgeColors[3 * i];
        colorsArray[posOffset + 1] = edgeColors[3 * i + 1];
        colorsArray[posOffset + 2] = edgeColors[3 * i + 2];
        colorsArray[posOffset + 3] = edgeColors[3 * (i + 1)];
        colorsArray[posOffset + 4] = edgeColors[3 * (i + 1) + 1];
        colorsArray[posOffset + 5] = edgeColors[3 * (i + 1) + 2];
        
        // Determine initial alpha based on party filter (initially all parties are selected)
        const partySource = nodes[source].userData.party;
        const partyTarget = nodes[target].userData.party;
        let initialAlpha = (selectedParties.has(partySource) && selectedParties.has(partyTarget)) ? 1.0 : 0.1;
        const alphaOffset = segmentIndex * 2;
        alphas[alphaOffset]     = initialAlpha;
        alphas[alphaOffset + 1] = initialAlpha;
        
        // Save meta for this segment (each segment inherits the edge’s source and target)
        edgeMeta.push({
          source: source,
          target: target,
          partySource: partySource,
          partyTarget: partyTarget
        });
        
        segmentIndex++;
      }
    });
    
    // Create BufferGeometry for the combined line segments
    const geometry = new THREE.BufferGeometry();
    const positionAttr = new THREE.BufferAttribute(positions, 3);
    positionAttr.setUsage(THREE.StaticDrawUsage);
    geometry.setAttribute('position', positionAttr);
    
    const colorAttr = new THREE.BufferAttribute(colorsArray, 3);
    colorAttr.setUsage(THREE.StaticDrawUsage);
    geometry.setAttribute('color', colorAttr);
    
    const alphaAttr = new THREE.BufferAttribute(alphas, 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('alpha', alphaAttr);
    
    // Create a single material; note that we modify its shader to use the per-vertex alpha attribute.
    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 1.0,
      linewidth: useBundledEdges ? 0.1 : 0.1,
      depthTest: true
    });
    
    edgeMaterial.onBeforeCompile = function (shader) {
      // Add the alpha attribute and pass it to the fragment shader
      shader.vertexShader = 'attribute float alpha;\nvarying float vAlpha;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <color_vertex>',
        `#include <color_vertex>
          vAlpha = alpha;`
      );
      shader.fragmentShader = 'varying float vAlpha;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
        'gl_FragColor = vec4( outgoingLight, diffuseColor.a * vAlpha );'
      );
    };
    
    edgeSegments = new THREE.LineSegments(geometry, edgeMaterial);
    scene.add(edgeSegments);
    
  }).catch(console.error);
}

// -----------------
// Helper functions
// -----------------
function parsePoints(pointsString) {
  return pointsString?.split('|').map(p => {
    const coords = p.split(';').map(parseFloat);
    return coords.length === 3 ? new THREE.Vector3(...coords) : null;
  }).filter(p => p !== null) || [];
}

function createEdgeColors(points, baseColor) {
  const colors = [];
  const colorStart = baseColor.clone().multiplyScalar(1.5);
  const colorEnd = baseColor.clone().multiplyScalar(0.3);
  
  for (let i = 0; i < points.length; i++) {
    const color = colorStart.clone().lerp(colorEnd, i / points.length);
    colors.push(color.r, color.g, color.b);
  }
  return colors.flat();
}

// -----------------
// Interaction handlers
// -----------------
function onCanvasClick(event) {
  mouse.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0 && intersects[0].object instanceof THREE.Mesh) {
    // Toggle selection: if already selected, then unselect.
    if (selectedNode === intersects[0].object) {
      selectedNode = null;
      resetEdgesOpacity();
      hideNodeTitle();
    } else {
      selectedNode = intersects[0].object;
      onNodeClick(selectedNode);
    }
  } else {
    selectedNode = null;
    resetEdgesOpacity();
    hideNodeTitle();
  }
}

function hideNodeTitle() {
  const titleDiv = document.getElementById('nodeTitle');
  titleDiv.style.display = 'none';
  titleDiv.innerHTML = '';
}

function onCanvasHover(event) {
  if (selectedNode) return;
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
  if (node.material) node.material.emissive.setHex(0x333333);
  const titleDiv = document.getElementById('nodeTitle');
  titleDiv.textContent = node.userData.title;
  titleDiv.style.display = 'block';

  const pos = node.position.clone(); 
  pos.project(camera);
  const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;

  titleDiv.style.left = `${x}px`;
  titleDiv.style.top = `${y}px`;
}

function onNodeHoverEnd() {
  Object.values(nodes).forEach(child => {
    if (child.material) child.material.emissive.setHex(0x000000);
  });
  hideNodeTitle();
}

// When a node is clicked, show only that node and its direct connections.
// Also, the info box (nodeTitle) is moved to the bottom left.
// Updated to display the party information along with the title.
function onNodeClick(node) {
  const selectedId = node.userData.id;
  let connectedNodeIds = new Set();
  
  // Determine connected nodes from the edge metadata
  edgeMeta.forEach(meta => {
    if (meta.source === selectedId) connectedNodeIds.add(meta.target);
    if (meta.target === selectedId) connectedNodeIds.add(meta.source);
  });
  
  for (let id in nodes) {
    if (id === selectedId || connectedNodeIds.has(id)) {
      nodes[id].material.opacity = 1.0;
    } else {
      nodes[id].material.opacity = 0.01;
    }
  }
  
  updateEdgeVisibilityForSelectedNode(selectedId);
  
  const titleDiv = document.getElementById('nodeTitle');
  titleDiv.innerHTML = `
    <div style="font-weight: bold;">${node.userData.title}</div>
    <div>Party: ${node.userData.party}</div>
    <button id="deselectBtn" style="font-size: 10px; margin-top: 5px; cursor: pointer;">Unselect</button>
  `;
  titleDiv.style.display = 'block';
  titleDiv.style.left = "8px";
  titleDiv.style.bottom = "8px";
  titleDiv.style.top = "";
  titleDiv.style.transform = "";
  document.getElementById('deselectBtn').addEventListener('click', () => {
    selectedNode = null;
    resetEdgesOpacity();
    hideNodeTitle();
  });
}

// Update edge visibility when a node is selected
function updateEdgeVisibilityForSelectedNode(selectedId) {
  if (!edgeSegments) return;
  const alphaAttr = edgeSegments.geometry.getAttribute('alpha');
  // Each segment is represented by two vertices.
  for (let i = 0; i < edgeMeta.length; i++) {
    const meta = edgeMeta[i];
    const visible = (meta.source === selectedId || meta.target === selectedId) ? 1.0 : 0.01;
    alphaAttr.array[2 * i] = visible;
    alphaAttr.array[2 * i + 1] = visible;
  }
  alphaAttr.needsUpdate = true;
}

// Update edge visibility based on party filter (when no node is selected)
function updateEdgeVisibilityPartyFilter() {
  if (!edgeSegments) return;
  const alphaAttr = edgeSegments.geometry.getAttribute('alpha');
  for (let i = 0; i < edgeMeta.length; i++) {
    const meta = edgeMeta[i];
    const visible = (selectedParties.has(meta.partySource) && selectedParties.has(meta.partyTarget)) ? 1.0 : 0.01;
    alphaAttr.array[2 * i] = visible;
    alphaAttr.array[2 * i + 1] = visible;
  }
  alphaAttr.needsUpdate = true;
}

// Party filter: only nodes and edges matching the selected parties are visible.
function updatePartyFilter() {
  selectedParties.clear();
  document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
    if (checkbox.id !== "toggleNodeTitles" && checkbox.checked) {
      selectedParties.add(checkbox.value);
    }
  });
  
  for (let id in nodes) {
    const node = nodes[id];
    if (selectedParties.has(node.userData.party)) {
      node.material.opacity = 1.0;
    } else {
      node.material.opacity = 0.01;
    }
  }
  
  // Update edges only if no node is selected
  if (!selectedNode) {
    updateEdgeVisibilityPartyFilter();
  }
}

// Define updateNetworkVisibility to avoid reference errors.
function updateNetworkVisibility() {
  updatePartyFilter();
}

document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
  if (checkbox.id !== "toggleNodeTitles") {
    checkbox.addEventListener('change', updatePartyFilter);
  }
});

// Updated PDF Export using toDataURL
document.getElementById('exportPDF').addEventListener('click', () => {
  const originalSceneBackground = scene.background;
  scene.background = null;

  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  const scaleFactor = 4;

  renderer.setSize(originalWidth * scaleFactor, originalHeight * scaleFactor, false);
  camera.aspect = (originalWidth * scaleFactor) / (originalHeight * scaleFactor);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const canvas = renderer.domElement;
  const pngDataURL = canvas.toDataURL('image/png');

  scene.background = originalSceneBackground;
  renderer.setSize(originalWidth, originalHeight, false);
  camera.aspect = originalWidth / originalHeight;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);

  const pdf = new jspdf.jsPDF('landscape', 'pt', [canvas.width, canvas.height]);
  pdf.addImage(pngDataURL, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save('network-visualization.pdf');

  const a = document.createElement('a');
  a.href = pngDataURL;
  a.download = 'network-visualization.png';
  a.click();
});

// Update labels for all visible nodes if toggle is active.
// Font size is now set based on the node's geometry radius.
function updateNodeLabels() {
  for (let id in nodes) {
    const node = nodes[id];
    if (node.material.opacity > 0) {
      let pos = node.position.clone();
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
      // Determine font size based on the node's geometry radius (scaled by a factor)
      const radius = node.geometry.parameters.radius || 10;
      const fontSize = Math.max(radius * 0.15, 3.5); // ensures a minimum font size of 10px
      if (!nodeLabels[id]) {
        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.color = 'white';
        label.style.pointerEvents = 'none';
        label.innerText = node.userData.title;
        document.body.appendChild(label);
        nodeLabels[id] = label;
      }
      nodeLabels[id].style.left = `${x}px`;
      nodeLabels[id].style.top = `${y}px`;
      nodeLabels[id].style.fontSize = fontSize + "px";
    } else {
      if (nodeLabels[id]) {
        if (nodeLabels[id].parentNode) nodeLabels[id].parentNode.removeChild(nodeLabels[id]);
        delete nodeLabels[id];
      }
    }
  }
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

function updateBoundingBox(x, y, z) {
  boundingBox.minX = Math.min(boundingBox.minX, x);
  boundingBox.maxX = Math.max(boundingBox.maxX, x);
  boundingBox.minY = Math.min(boundingBox.minY, y);
  boundingBox.maxY = Math.max(boundingBox.maxY, y);
  boundingBox.minZ = Math.min(boundingBox.minZ, z);
  boundingBox.maxZ = Math.max(boundingBox.maxZ, z);
}

function resetEdgesOpacity() {
  // Reapply party filter visibility when clearing selection.
  updatePartyFilter();
}

// --- New: Search functionality for node titles ---
document.getElementById('searchInput').addEventListener('input', function(event) {
  let query = event.target.value.toLowerCase();
  let suggestionsDiv = document.getElementById('suggestions');
  suggestionsDiv.innerHTML = '';
  if (query.trim() === '') {
    suggestionsDiv.style.display = 'none';
    return;
  }
  let foundNodes = [];
  for (let id in nodes) {
    let title = nodes[id].userData.title.toLowerCase();
    if (title.includes(query)) {
      foundNodes.push(nodes[id]);
    }
  }
  if (foundNodes.length > 0) {
    suggestionsDiv.style.display = 'block';
    foundNodes.forEach(function(node) {
      let suggestion = document.createElement('div');
      suggestion.textContent = node.userData.title;
      suggestion.style.padding = '5px';
      suggestion.style.cursor = 'pointer';
      suggestion.addEventListener('click', function() {
        selectedNode = node;
        onNodeClick(node);
        document.getElementById('searchInput').value = '';
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
      });
      suggestionsDiv.appendChild(suggestion);
    });
  } else {
    suggestionsDiv.style.display = 'none';
  }
});

init();
animate();

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (edgeSegments) {
    edgeSegments.material.opacity = Math.min(edgeSegments.material.opacity + 0.005, 1.0);
  }
  renderer.render(scene, camera);
  if (showAllTitles) {
    updateNodeLabels();
  }
}
