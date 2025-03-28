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
  
  // For the node title toggle
  let showAllTitles = false;
  let nodeLabels = {};
  
  function makeShiny(color) {
    const shinyColor = color.clone();
    shinyColor.offsetHSL(0, 0, 1);
    return shinyColor;
  }
  
  // Initialize application
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
        renderer.setPixelRatio(window.devicePixelRatio);
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
    controls.dampingFactor = 0.05;
    controls.minDistance = 50;
    controls.maxDistance = 100000;
  
    scene.add(new THREE.AmbientLight("#ffffff"));
  
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 10, 10);
    scene.add(directionalLight);
  
    const pointLight = new THREE.PointLight(0xffffff, 1);
    pointLight.position.set(-10, -10, 10);
    scene.add(pointLight);
  
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasHover);
    window.addEventListener('resize', onWindowResize);
  
    createLegend();
    loadData();
  
    // Party filter buttons
    document.getElementById('selectAll').addEventListener('click', () => {
        document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
            if(checkbox.id !== "toggleNodeTitles") checkbox.checked = true;
        });
        updatePartyFilter();
    });
    document.getElementById('unselectAll').addEventListener('click', () => {
        document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
            if(checkbox.id !== "toggleNodeTitles") checkbox.checked = false;
        });
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
  
  // Data loading functions
  function loadData() {
    d3.csv("sampled_nodes_test_edgebundling.csv").then(data => {
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
        roughness: 0.4,
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
  
  // Edge management
  function loadEdges() {
    const edgeFile = useBundledEdges ? "bundled_output_dijkstra.csv" : "sampled_edges_test_edgebundling.csv";
    
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
    scene.children.forEach(child => {
        if (child instanceof THREE.Mesh && child.material) {
            child.material.emissive.setHex(0x000000);
        }
    });
    hideNodeTitle();
  }
  
  // When a node is clicked, show only that node and its direct connections.
  function onNodeClick(node) {
    const selectedId = node.userData.id;
    let connectedNodeIds = new Set();
    
    scene.children.forEach(child => {
        if(child instanceof THREE.Line){
           if(child.userData.source === selectedId) {
               connectedNodeIds.add(child.userData.target);
           }
           if(child.userData.target === selectedId) {
               connectedNodeIds.add(child.userData.source);
           }
        }
    });
    
    for(let id in nodes){
        if(id === selectedId || connectedNodeIds.has(id)){
           nodes[id].material.opacity = 1.0;
        } else {
           nodes[id].material.opacity = 0.0;
        }
    }
    
    scene.children.forEach(child => {
        if(child instanceof THREE.Line){
           if(child.userData.source === selectedId || child.userData.target === selectedId) {
               child.material.opacity = 1.0;
           } else {
               child.material.opacity = 0.0;
           }
        }
    });
    
    const titleDiv = document.getElementById('nodeTitle');
    titleDiv.innerHTML = `${node.userData.title} <button id="deselectBtn" style="font-size: 16px; margin-left: 10px; cursor: pointer;">Unselect</button>`;
    titleDiv.style.display = 'block';
    titleDiv.style.left = `50%`;
    titleDiv.style.top = `50px`;
    titleDiv.style.transform = "translateX(-50%)";
    document.getElementById('deselectBtn').addEventListener('click', () => {
        selectedNode = null;
        resetEdgesOpacity();
        hideNodeTitle();
    });
  }
  
  function resetEdgesOpacity() {
    // Reapply party filter visibility when clearing selection.
    updateNetworkVisibility();
  }
  
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
            <div style="width: 12px; height: 12px; background: ${colorHex}; margin-right: 5px; border: 1px solid #000;"></div>
            <span>${party}</span>
        `;
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
            node.material.opacity = 0.0;
        }
    }
    
    scene.children.forEach(child => {
        if (child instanceof THREE.Line) {
            const sourceParty = nodes[child.userData.source].userData.party;
            const targetParty = nodes[child.userData.target].userData.party;
            
            if (selectedParties.has(sourceParty) && selectedParties.has(targetParty)) {
                child.material.opacity = 1.0;
            } else {
                child.material.opacity = 0.0;
            }
        }
    });
  }
  
  // Define updateNetworkVisibility to avoid reference errors.
  function updateNetworkVisibility() {
    updatePartyFilter();
  }
  
  document.querySelectorAll('#partyFilters input[type="checkbox"]').forEach(checkbox => {
    if(checkbox.id !== "toggleNodeTitles"){
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
  
  // Update labels for all visible nodes if toggle is active. The font size is now set based on the node's size.
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
            const fontSize = Math.max(radius * 0.1, 5); // ensures a minimum font size of 10px
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
  
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    edgeMaterials.forEach(mat => mat.opacity = Math.min(mat.opacity + 0.005, 1.0));
    renderer.render(scene, camera);
    if (showAllTitles) {
        updateNodeLabels();
    }
  }
  
  init();
  animate();
  