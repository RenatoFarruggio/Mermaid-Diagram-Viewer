import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

const mermaidInput = document.getElementById('mermaidInput');
const mermaidOutput = document.getElementById('mermaidOutput');
const darkModeToggle = document.getElementById('darkModeToggle');

// For tracking SVG pan-zoom instance
let panZoomInstance = null;
// For tracking draggable nodes
let dragContext = null;
// For tracking connection points
let edgeConnections = new Map();

const defaultDiagram = `classDiagram
Animal --o Dog
Animal <|-- Cat
class Animal {
    +String species
    +makeSound()
}
class Dog {
    +bark()
}
class Cat {
    +meow()
}
`;

// Cleanup function for previous event listeners and instances
const cleanup = () => {
    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }
    
    // Remove any existing event listeners for node dragging
    const nodes = document.querySelectorAll('#mermaidOutput g.node');
    nodes.forEach(node => {
        node.removeEventListener('mousedown', handleNodeMouseDown);
    });
    
    // Remove document-level event listeners
    document.removeEventListener('mousemove', handleNodeMouseMove);
    document.removeEventListener('mouseup', handleNodeMouseUp);
    
    // Clear edge connections map
    edgeConnections.clear();
};

// Initialize SVG pan-zoom for panning and zooming
const initializePanZoom = () => {
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Reset instance if exists
    if (panZoomInstance) {
        panZoomInstance.destroy();
    }
    
    // Ensure SVG has proper viewBox
    if (!svg.getAttribute('viewBox')) {
        const bbox = svg.getBBox();
        svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }

    // Panning
    let isPanning = false;
    svg.addEventListener('mousedown', (e) => {
        if (e.button === 2) isPanning = true;
    });
    svg.addEventListener('mouseup', () => isPanning = false);
    svg.addEventListener('mouseleave', () => isPanning = false);
    
    // Create new instance
    panZoomInstance = svgPanZoom(svg, {
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: true,
        center: true,
        minZoom: 0.1,
        maxZoom: 10,
        zoomScaleSensitivity: 0.3,
        mouseWheelZoomEnabled: true,
        dblClickZoomEnabled: false,
        eventsListenerElement: svg.parentNode,
        beforePan: () => isPanning
    });
    
    // Prevent context menu on right-click
    svg.addEventListener('contextmenu', e => {
        e.preventDefault();
        return false;
    });
};

// Make nodes draggable
const makeNodesDraggable = () => {
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Find and analyze all edges
    analyzeEdges(svg);
    
    // Make nodes draggable
    const nodes = svg.querySelectorAll('g.node');
    
    nodes.forEach(node => {
        node.addEventListener('mousedown', handleNodeMouseDown);
        
        // Make sure the whole node is clickable
        const shapes = node.querySelectorAll('rect, circle, ellipse, polygon');
        shapes.forEach(shape => {
            shape.style.pointerEvents = 'all';
        });
    });
    
    // Add document-level event listeners
    document.addEventListener('mousemove', handleNodeMouseMove);
    document.addEventListener('mouseup', handleNodeMouseUp);
};

// Analyze edges and store connection info
function analyzeEdges(svg) {
    edgeConnections.clear(); // Ensure we start fresh
    console.log("--- Analyzing Edges --- Firing analyseEdges ---");
    
    // Get nodes first
    const nodes = svg.querySelectorAll('g.node');
    const nodeMap = new Map();
    console.log(`Found ${nodes.length} potential node elements (g.node)`);
    nodes.forEach((node, index) => {
        const nodeId = node.id;
        if (nodeId) {
            console.log(`  Node ${index}: Found ID: ${nodeId}`);
            nodeMap.set(nodeId, node);
        }
    });
    console.log(`Mapped ${nodeMap.size} nodes based on their IDs.`);

    // Get edge paths - they're direct children of g.edgePaths
    const edgePathsGroup = svg.querySelector('g.edgePaths');
    if (!edgePathsGroup) {
        console.warn("No edgePaths group found in SVG");
        return;
    }

    const edges = edgePathsGroup.querySelectorAll('path');
    console.log(`Found ${edges.length} edge paths`);

    edges.forEach((edge, index) => {
        const edgeId = edge.id;
        console.log(`Analyzing Edge ${index}: ID='${edgeId}'`);

        // Extract source and target from the ID (format: id_Animal_Dog_1)
        const idParts = edgeId.split('_');
        if (idParts.length >= 3) {
            const sourceName = idParts[1]; // e.g., "Animal"
            const targetName = idParts[2]; // e.g., "Dog"

            // Find the corresponding node IDs
            const sourceNodeId = Array.from(nodeMap.keys()).find(id => id.includes(sourceName));
            const targetNodeId = Array.from(nodeMap.keys()).find(id => id.includes(targetName));

            console.log(`  Extracted from ID: ${sourceName} -> ${targetName}`);
            console.log(`  Found node IDs: ${sourceNodeId} -> ${targetNodeId}`);

            if (sourceNodeId && targetNodeId) {
                const sourceNode = nodeMap.get(sourceNodeId);
                const targetNode = nodeMap.get(targetNodeId);

                if (sourceNode && targetNode) {
                    console.log(`  SUCCESS: Linked edge ${edgeId} from ${sourceNodeId} to ${targetNodeId}`);
                    edgeConnections.set(edgeId, {
                        edge: edge,
                        source: sourceNode,
                        target: targetNode,
                        paths: [edge] // The path itself is the main path
                    });
                } else {
                    console.warn(`  WARN: Found source/target IDs (${sourceNodeId}, ${targetNodeId}) for edge ${edgeId}, but couldn't find matching nodes.`);
                }
            } else {
                console.warn(`  WARN: Could not find matching node IDs for edge ${edgeId}`);
            }
        } else {
            console.warn(`  WARN: Edge ID ${edgeId} does not match expected format`);
        }
    });

    console.log(`--- Edge analysis complete. ${edgeConnections.size} connections stored. ---`);
}

// Node dragging handlers
function handleNodeMouseDown(e) {
    // Only respond to left mouse button (button 0)
    if (e.button !== 0) return;
    
    // Prevent SVG pan-zoom from interfering
    e.stopPropagation();
    
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Get current node transform
    const transformAttr = this.getAttribute('transform') || 'translate(0,0)';
    const match = transformAttr.match(/translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/);
    const initialTransform = {
        x: parseFloat(match ? match[1] : 0) || 0,
        y: parseFloat(match ? match[2] : 0) || 0
    };
    
    // Initialize drag context
    dragContext = {
        node: this,
        initialTransform: initialTransform,
        startClientX: e.clientX, // Store initial screen coordinates
        startClientY: e.clientY
    };
    
    // Add a temporary class for styling
    this.classList.add('dragging');
}

function handleNodeMouseMove(e) {
    if (!dragContext) return;
    
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Get the CURRENT SVG's coordinate transformation matrix
    const currentMatrixInverse = svg.getScreenCTM().inverse();
    
    // Convert START client coordinates to CURRENT SVG coordinates
    const startPoint = svg.createSVGPoint();
    startPoint.x = dragContext.startClientX;
    startPoint.y = dragContext.startClientY;
    const svgStartPoint = startPoint.matrixTransform(currentMatrixInverse);
    
    // Convert CURRENT client coordinates to CURRENT SVG coordinates
    const currentPoint = svg.createSVGPoint();
    currentPoint.x = e.clientX;
    currentPoint.y = e.clientY;
    const svgCurrentPoint = currentPoint.matrixTransform(currentMatrixInverse);
    
    // Calculate the delta in the CURRENT SVG coordinate system
    const dx = svgCurrentPoint.x - svgStartPoint.x;
    const dy = svgCurrentPoint.y - svgStartPoint.y;
    
    // Apply the new transform relative to the initial transform
    const newX = dragContext.initialTransform.x + dx;
    const newY = dragContext.initialTransform.y + dy;
    dragContext.node.setAttribute('transform', `translate(${newX},${newY})`);
    
    // Update edges connected to this node
    updateConnectedEdges(dragContext.node);
}

function handleNodeMouseUp() {
    if (dragContext) {
        dragContext.node.classList.remove('dragging');
        // Final update of connected edges
        updateConnectedEdges(dragContext.node);
        // Clear drag context
        dragContext = null;
    }
}

// More robust edge update function
function updateConnectedEdges(node) {
    if (!node || !node.id) return;
    console.log(`Updating edges connected to node: ${node.id}`);

    // Find all edges connected to this node
    edgeConnections.forEach((connection, edgeId) => {
        if (connection.source === node || connection.target === node) {
            console.log(`  -> Updating edge: ${edgeId}`);
            updateEdgePosition(connection);
        }
    });
}

// Helper to get a node's transform values
function getNodeTransform(node) {
    const transformAttr = node.getAttribute('transform') || 'translate(0,0)';
    const match = transformAttr.match(/translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/);
    
    if (match) {
        return {
            x: parseFloat(match[1]) || 0,
            y: parseFloat(match[2]) || 0
        };
    }
    
    return { x: 0, y: 0 };
}

// Helper function to calculate potential connection points on a node's boundary
function getTransformedBoundaryPoints(rect, transform) {
    // Center point
    const center = {
        x: rect.x + rect.width / 2 + transform.x,
        y: rect.y + rect.height / 2 + transform.y
    };
    // Mid-points of the rectangle's sides
    const midTop = { x: center.x, y: rect.y + transform.y };
    const midBottom = { x: center.x, y: rect.y + rect.height + transform.y };
    const midLeft = { x: rect.x + transform.x, y: center.y };
    const midRight = { x: rect.x + rect.width + transform.x, y: center.y };

    return {
        center: center,
        // Use boundary points, plus center as a fallback
        boundaries: [midTop, midBottom, midLeft, midRight, center]
    };
}

// Update edge position based on node positions using boundary points
function updateEdgePosition(connection) {
    const { edge, source, target, paths } = connection;
    if (!edge || !source || !target || !paths || paths.length === 0) {
        console.error("updateEdgePosition: Missing required connection data.", connection);
        return;
    }

    console.log(`  Updating position for edge between ${source.id} and ${target.id}`);

    // Get transforms
    const sourceTransform = getNodeTransform(source);
    const targetTransform = getNodeTransform(target);
    console.log(`    Source Transform:`, sourceTransform);
    console.log(`    Target Transform:`, targetTransform);

    // Get *untransformed* bounding boxes
    const sourceRect = source.getBBox();
    const targetRect = target.getBBox();
    console.log(`    Source BBox:`, sourceRect);
    console.log(`    Target BBox:`, targetRect);

    // Calculate potential connection points on boundaries
    const sourcePoints = getTransformedBoundaryPoints(sourceRect, sourceTransform);
    const targetPoints = getTransformedBoundaryPoints(targetRect, targetTransform);

    // Find the pair of boundary points (one on source, one on target)
    // that are closest to each other.
    let minDistSq = Infinity;
    let closestSourcePoint = sourcePoints.center;
    let closestTargetPoint = targetPoints.center;

    for (const sp of sourcePoints.boundaries) {
        for (const tp of targetPoints.boundaries) {
            const dx = sp.x - tp.x;
            const dy = sp.y - tp.y;
            const distSq = dx * dx + dy * dy;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestSourcePoint = sp;
                closestTargetPoint = tp;
            }
        }
    }
    console.log(`    Closest Points: Source=`, closestSourcePoint, `Target=`, closestTargetPoint);

    // Update the main path (assuming it's the first path element for now)
    // More robust: Identify path by lack of marker attribute?
    const mainPath = paths.find(p => !p.hasAttribute('marker-end') && !p.hasAttribute('marker-start')) || paths[0];
    if (!mainPath) {
        console.error("  Could not find main path element for edge.");
        return;
    }
    const dAttr = `M${closestSourcePoint.x},${closestSourcePoint.y} L${closestTargetPoint.x},${closestTargetPoint.y}`;
    mainPath.setAttribute('d', dAttr);
    console.log(`    Set main path 'd': ${dAttr}`);

    // Update markers (arrowheads, etc.)
    const markerPath = paths.find(p => p.hasAttribute('marker-end') || p.hasAttribute('marker-start'));
    if (markerPath) {
        const dx = closestTargetPoint.x - closestSourcePoint.x;
        const dy = closestTargetPoint.y - closestSourcePoint.y;
        const angle = (dx === 0 && dy === 0) ? 0 : Math.atan2(dy, dx) * (180 / Math.PI);

        // Determine which end the marker is on
        let targetPointForMarker = closestTargetPoint; // Assume marker-end
        if (markerPath.hasAttribute('marker-start')) {
            targetPointForMarker = closestSourcePoint;
             // Adjust angle if marker is at the start (points away from target)
             // angle += 180; // Rotation handles directionality, but position is key
        }

        const markerTransform = `translate(${targetPointForMarker.x}, ${targetPointForMarker.y}) rotate(${angle})`;
        markerPath.setAttribute('transform', markerTransform);
        console.log(`    Set marker path transform: ${markerTransform}`);

    } else {
        console.log("    No marker path found for this edge.");
        // Check if there are other paths that aren't the main one
        const otherPaths = paths.filter(p => p !== mainPath);
        if(otherPaths.length > 0) {
            console.log(`    Note: Found ${otherPaths.length} other path(s) associated with the edge that were not identified as main or marker.`);
        }
    }
}

// Function to render the Mermaid diagram
const renderMermaid = async () => {
    // Clean up previous state
    cleanup();
    
    const definition = mermaidInput.value.trim() || defaultDiagram;
    // Basic validation: Check if it looks like a class diagram
    if (!definition.trim().startsWith('classDiagram')) {
        mermaidOutput.innerHTML = '<p style="color: red;">Invalid input: Must start with "classDiagram"</p>';
        return;
    }

    try {
        // Unique ID for each render to force re-rendering
        const uniqueId = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueId, definition);
        mermaidOutput.innerHTML = svg;
        
        // Initialize pan and zoom
        initializePanZoom();
        
        // Make nodes draggable
        makeNodesDraggable();
    } catch (error) {
        console.error("Mermaid rendering error:", error);
        // Display a user-friendly error message
        mermaidOutput.innerHTML = `<p style="color: red;">Error rendering diagram:</p><pre style="color: red; white-space: pre-wrap;">${error.message || error}</pre>`;
        // Add the invalid definition for context
        const definitionPre = document.createElement('pre');
        definitionPre.style.color = 'orange';
        definitionPre.style.whiteSpace = 'pre-wrap';
        definitionPre.textContent = definition;
        mermaidOutput.appendChild(document.createElement('hr'));
        mermaidOutput.appendChild(document.createTextNode('Attempted Definition:'));
        mermaidOutput.appendChild(definitionPre);
    }
};

// Set default text
mermaidInput.value = defaultDiagram;

// --- Initial Setup ---

// 1. Determine initial theme
let initialTheme = 'default';
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

if (prefersDark) {
    initialTheme = 'dark';
    // Update checkbox and body class if system prefers dark and checkbox isn't already checked
    if (!darkModeToggle.checked) {
        darkModeToggle.checked = true;
        document.body.classList.add('dark-mode');
    }
} else {
    // Ensure body class and checkbox match if system prefers light
    if (darkModeToggle.checked) {
        darkModeToggle.checked = false; // Should ideally not happen if HTML default is unchecked
        document.body.classList.remove('dark-mode');
    }
}

// 2. Initialize Mermaid ONCE with the determined theme
mermaid.initialize({
    startOnLoad: false,
    theme: initialTheme,
    securityLevel: 'loose', // Needed for interactions
    class: {
        // Class diagram specific configs if needed
    }
});

// 3. Initial Render
renderMermaid();

// --- Event Listeners ---

// Re-render on input change (with debounce)
let debounceTimer;
mermaidInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderMermaid, 500); // Wait 500ms after last input
});

// Dark mode toggle (handles re-initialization on change)
darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', darkModeToggle.checked);
    const newTheme = darkModeToggle.checked ? 'dark' : 'default';
    
    // Re-initialize Mermaid with the new theme
    mermaid.initialize({
        startOnLoad: false,
        theme: newTheme,
        securityLevel: 'loose'
    });
    
    renderMermaid(); // Re-render with the new theme
});

// --- Future Enhancements Placeholder ---
// Dragging nodes, panning, zooming will require more complex SVG manipulation
// potentially using libraries like d3.js or svg-pan-zoom. 