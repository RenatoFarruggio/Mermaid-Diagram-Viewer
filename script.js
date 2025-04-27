import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

const mermaidInput = document.getElementById('mermaidInput');
const mermaidOutput = document.getElementById('mermaidOutput');
const darkModeToggle = document.getElementById('darkModeToggle');
const curveToggle = document.getElementById('curveToggle');

// State variable for edge style
let useCurvedEdges = curveToggle.checked;

// For tracking SVG pan-zoom instance
let panZoomInstance = null;
// For tracking draggable nodes
let dragContext = null;
// For tracking connection points
let edgeConnections = new Map();

const defaultDiagram = `classDiagram
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
    Animal --o Dog : has
    Animal <|-- Cat : is
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
function initializePanZoom() {
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) {
        console.error("[PanZoom Debug] SVG element not found for pan/zoom.");
        return;
    }

    // Reset instance if exists
    if (panZoomInstance) {
        panZoomInstance.destroy();
        panZoomInstance = null;
    }

    // Panning state - needs to be accessible by the listener
    let isPanning = false;

    svg.addEventListener('mousedown', (e) => {
        // Handle LEFT clicks for node dragging, MIDDLE clicks for panning
        if (e.button === 0) { // Left mouse button
            const targetNode = e.target.closest('g.node');
            if (targetNode) {
                // Left-clicked on a node, initiate drag
                isPanning = false; // Ensure panning is disabled
                handleNodeMouseDown(e, targetNode); // Manually call handler
            } else {
                // Left-clicked on background, do nothing
                isPanning = false;
            }
        } else if (e.button === 1) { // Middle mouse button
            isPanning = true;
            e.preventDefault(); // Prevent default middle-click scroll behavior
        } else {
            // Other clicks (right) should not interfere
            isPanning = false;
        }
    });

    svg.addEventListener('mouseup', (e) => {
        if (e.button === 1 && isPanning) { // Middle mouse button release
            isPanning = false;
        }
        // Note: Node drag mouseup (left-click) is handled by the document listener
    });

    svg.addEventListener('mouseleave', () => {
         if (isPanning) {
             isPanning = false;
         }
         // Note: Node drag mouseup is handled by the document listener
    });

    // Create new instance, using the isPanning flag in beforePan
    const panZoomOptions = {
        zoomEnabled: true,
        controlIconsEnabled: false,
        center: true,
        minZoom: 0.05,
        maxZoom: 1,
        zoomScaleSensitivity: 0.3,
        mouseWheelZoomEnabled: true,
        dblClickZoomEnabled: false,
        beforePan: () => isPanning,
        onZoom: function(newZoom) {
            if (panZoomInstance) {
                const currentPan = panZoomInstance.getPan();
            }
        },
        onPan: function(newPan) {
            if (panZoomInstance) {
                const currentZoom = panZoomInstance.getZoom();
            }
        }
    };

    panZoomInstance = svgPanZoom(svg, panZoomOptions);

    // Force center and fit once the pan-zoom is initialized
    setTimeout(() => {
        if (panZoomInstance) {
            panZoomInstance.center();
            const initialZoomLevel = 0.2;
            panZoomInstance.zoom(initialZoomLevel);
        }
    }, 150);
}

// Make nodes draggable
const makeNodesDraggable = () => {
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Find and analyze all edges
    analyzeEdges(svg);
    
    // Make sure the whole node is clickable
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach(node => {
        const shapes = node.querySelectorAll('rect, circle, ellipse, polygon');
        shapes.forEach(shape => {
            shape.style.pointerEvents = 'all';
        });
    });
    
    // Add document-level event listeners for move/up during drag
    document.addEventListener('mousemove', handleNodeMouseMove);
    document.addEventListener('mouseup', handleNodeMouseUp);
};

// Analyze edges and store connection info
function analyzeEdges(svg) {
    edgeConnections.clear();

    // Get nodes first
    const nodes = svg.querySelectorAll('g.node');
    const nodeMap = new Map();
    nodes.forEach((node, index) => {
        const nodeId = node.id;
        if (nodeId) {
            nodeMap.set(nodeId, node);
        }
    });

    // Get edge paths - they're direct children of g.edgePaths
    const edgePathsGroup = svg.querySelector('g.edgePaths');
    const edges = edgePathsGroup ? Array.from(edgePathsGroup.querySelectorAll('path')) : [];

    // Get edge labels - they're direct children of g.edgeLabels
    const edgeLabelsGroup = svg.querySelector('g.edgeLabels');
    const labels = edgeLabelsGroup ? Array.from(edgeLabelsGroup.querySelectorAll('g.edgeLabel')) : [];

    edges.forEach((edge, index) => {
        // Use index as a fallback if ID is missing, important for map key
        const edgeId = edge.id || `edge-index-${index}`;

        // Extract source and target from the ID if possible (format: id_Animal_Dog_1)
        const idParts = edge.id ? edge.id.split('_') : [];
        let sourceName = `unknownSource-${index}`;
        let targetName = `unknownTarget-${index}`;

        if (idParts.length >= 3) {
            sourceName = idParts[1]; // e.g., "Animal"
            targetName = idParts[2]; // e.g., "Dog"
        }

        // Find the corresponding node IDs - This part needs the names
        const sourceNodeId = Array.from(nodeMap.keys()).find(id => id && id.includes(sourceName));
        const targetNodeId = Array.from(nodeMap.keys()).find(id => id && id.includes(targetName));

        // Associate label based on index
        let correspondingLabel = null;
        if (index < labels.length) {
            correspondingLabel = labels[index];
        }

        if (sourceNodeId && targetNodeId) {
            const sourceNode = nodeMap.get(sourceNodeId);
            const targetNode = nodeMap.get(targetNodeId);

            if (sourceNode && targetNode) {
                const originalD = edge.getAttribute('d');
                const markerEnd = edge.getAttribute('marker-end');
                const markerStart = edge.getAttribute('marker-start');

                edgeConnections.set(edgeId, { // Use the potentially generated edgeId as key
                    edge: edge,
                    source: sourceNode,
                    target: targetNode,
                    label: correspondingLabel, // Store the label found by index
                    originalD: originalD,
                    markerEnd: markerEnd,
                    markerStart: markerStart,
                    initialSourcePos: getNodeCenterPosition(sourceNode),
                    initialTargetPos: getNodeCenterPosition(targetNode)
                });
            }
        }
    });
}

// Helper to get the center position of a node
function getNodeCenterPosition(node) {
    const bbox = node.getBBox();
    const transform = getNodeTransform(node);
    
    return {
        x: bbox.x + bbox.width / 2 + transform.x,
        y: bbox.y + bbox.height / 2 + transform.y
    };
}

// Helper to get the rectangle for a node (with transform applied)
function getNodeRect(node) {
    const bbox = node.getBBox();
    const transform = getNodeTransform(node);
    
    return {
        x: bbox.x + transform.x,
        y: bbox.y + transform.y,
        width: bbox.width,
        height: bbox.height,
        centerX: bbox.x + bbox.width / 2 + transform.x,
        centerY: bbox.y + bbox.height / 2 + transform.y,
        left: bbox.x + transform.x,
        right: bbox.x + bbox.width + transform.x,
        top: bbox.y + transform.y,
        bottom: bbox.y + bbox.height + transform.y
    };
}

// Find intersection of a line with a rectangle 
function findIntersection(rect, fromX, fromY, toX, toY) {
    // Calculate direction vector
    const dx = toX - fromX;
    const dy = toY - fromY;
    
    // For points inside the rectangle, we still want to find the border intersection
    // in the direction of the target point
    if (fromX >= rect.left && fromX <= rect.right && 
        fromY >= rect.top && fromY <= rect.bottom) {
        
        // Initialize for closest intersection
        let minDist = Infinity;
        let closestPoint = null;
        
        // Check each edge for intersection with the ray extending from inside to outside
        
        // Left edge: x = rect.left
        if (dx < 0) { // Only check if ray is going left
            const t = (rect.left - fromX) / dx;
            const y = fromY + t * dy;
            if (y >= rect.top && y <= rect.bottom) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: rect.left, y: y };
                }
            }
        }
        
        // Right edge: x = rect.right
        if (dx > 0) { // Only check if ray is going right
            const t = (rect.right - fromX) / dx;
            const y = fromY + t * dy;
            if (y >= rect.top && y <= rect.bottom) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: rect.right, y: y };
                }
            }
        }
        
        // Top edge: y = rect.top
        if (dy < 0) { // Only check if ray is going up
            const t = (rect.top - fromY) / dy;
            const x = fromX + t * dx;
            if (x >= rect.left && x <= rect.right) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: x, y: rect.top };
                }
            }
        }
        
        // Bottom edge: y = rect.bottom
        if (dy > 0) { // Only check if ray is going down
            const t = (rect.bottom - fromY) / dy;
            const x = fromX + t * dx;
            if (x >= rect.left && x <= rect.right) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: x, y: rect.bottom };
                }
            }
        }
        
        if (closestPoint) {
            return closestPoint;
        }
    }
    
    // For points outside the rectangle, find the closest intersection with any edge
    // Temporary variables for intersection
    let minDist = Infinity;
    let closestPoint = null;
    
    // Check intersection with left edge
    if (dx !== 0) {
        const t = (rect.left - fromX) / dx;
        if (t >= 0 && t <= 1) {
            const y = fromY + t * dy;
            if (y >= rect.top && y <= rect.bottom) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: rect.left, y: y };
                }
            }
        }
    }
    
    // Check intersection with right edge
    if (dx !== 0) {
        const t = (rect.right - fromX) / dx;
        if (t >= 0 && t <= 1) {
            const y = fromY + t * dy;
            if (y >= rect.top && y <= rect.bottom) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: rect.right, y: y };
                }
            }
        }
    }
    
    // Check intersection with top edge
    if (dy !== 0) {
        const t = (rect.top - fromY) / dy;
        if (t >= 0 && t <= 1) {
            const x = fromX + t * dx;
            if (x >= rect.left && x <= rect.right) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: x, y: rect.top };
                }
            }
        }
    }
    
    // Check intersection with bottom edge
    if (dy !== 0) {
        const t = (rect.bottom - fromY) / dy;
        if (t >= 0 && t <= 1) {
            const x = fromX + t * dx;
            if (x >= rect.left && x <= rect.right) {
                const dist = t * Math.sqrt(dx * dx + dy * dy);
                if (dist < minDist) {
                    minDist = dist;
                    closestPoint = { x: x, y: rect.bottom };
                }
            }
        }
    }
    
    if (closestPoint) {
        return closestPoint;
    } else {
        // If no intersection is found, use the center of the closest edge
        const leftDist = Math.abs(rect.left - fromX);
        const rightDist = Math.abs(rect.right - fromX);
        const topDist = Math.abs(rect.top - fromY);
        const bottomDist = Math.abs(rect.bottom - fromY);
        
        // Find closest edge
        const minEdgeDist = Math.min(leftDist, rightDist, topDist, bottomDist);
        
        if (minEdgeDist === leftDist) {
            return { x: rect.left, y: Math.max(rect.top, Math.min(rect.bottom, fromY)) };
        } else if (minEdgeDist === rightDist) {
            return { x: rect.right, y: Math.max(rect.top, Math.min(rect.bottom, fromY)) };
        } else if (minEdgeDist === topDist) {
            return { x: Math.max(rect.left, Math.min(rect.right, fromX)), y: rect.top };
        } else {
            return { x: Math.max(rect.left, Math.min(rect.right, fromX)), y: rect.bottom };
        }
    }
}

// Node dragging handlers
function handleNodeMouseDown(e, node) {
    // Prevent the default context menu when right-clicking on a node
    e.preventDefault();
    // Prevent SVG pan-zoom from interfering when starting a node drag
    e.stopPropagation();

    const svg = mermaidOutput.querySelector('svg');
    const viewport = svg ? svg.querySelector('g.svg-pan-zoom_viewport') : null;
    if (!svg || !viewport) {
        console.error("SVG or viewport group not found!");
        return;
    }
    
    // Get current node transform
    const transformAttr = node.getAttribute('transform') || 'translate(0,0)';
    const match = transformAttr.match(/translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/);
    const initialTransform = {
        x: parseFloat(match ? match[1] : 0) || 0,
        y: parseFloat(match ? match[2] : 0) || 0
    };

    // Get CTM of the viewport group
    const ctmInverse = viewport.getScreenCTM().inverse();
    
    // Initialize drag context
    dragContext = {
        node: node,
        initialTransform: initialTransform,
        startClientX: e.clientX, // Store starting SCREEN coordinates
        startClientY: e.clientY  // Store starting SCREEN coordinates
    };
    
    // Add a temporary class for styling
    node.classList.add('dragging');
}

function handleNodeMouseMove(e) {
    if (!dragContext) return;
    
    const svg = mermaidOutput.querySelector('svg');
    const viewport = svg ? svg.querySelector('g.svg-pan-zoom_viewport') : null;
    if (!svg || !viewport) {
        return;
    }
    
    // Calculate delta in client (screen) coordinates
    const deltaClientX = e.clientX - dragContext.startClientX;
    const deltaClientY = e.clientY - dragContext.startClientY;
    
    // Get the inverse of the VIEWPORT's screen CTM
    const ctmInverse = viewport.getScreenCTM().inverse();
    
    // Transform the screen delta vector into an SVG delta vector
    // Use the linear part of the inverse matrix (a, b, c, d) for scaling
    const deltaSvgX = ctmInverse.a * deltaClientX + ctmInverse.c * deltaClientY;
    const deltaSvgY = ctmInverse.b * deltaClientX + ctmInverse.d * deltaClientY;

    // Apply the scaled SVG delta to the initial transform
    const newX = dragContext.initialTransform.x + deltaSvgX;
    const newY = dragContext.initialTransform.y + deltaSvgY;

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
    
    // Find all edges connected to this node
    edgeConnections.forEach((connection, edgeId) => {
        if (connection.source === node || connection.target === node) {
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

// Update edge position based on node positions using transforms
function updateEdgePosition(connection) {
    const { edge, source, target, originalD, initialSourcePos, initialTargetPos, markerStart, markerEnd, label } = connection;
    
    if (!edge || !source || !target) {
        return;
    }

    // Get current source and target positions & rectangles
    const sourceCenter = getNodeCenterPosition(source);
    const targetCenter = getNodeCenterPosition(target);
    const sourceRect = getNodeRect(source);
    const targetRect = getNodeRect(target);
    
    // Find intersection points
    const sourceIntersection = findIntersection(sourceRect, sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y);
    const targetIntersection = findIntersection(targetRect, targetCenter.x, targetCenter.y, sourceCenter.x, sourceCenter.y);
    
    let pathStart = sourceIntersection || sourceCenter;
    let pathEnd = targetIntersection || targetCenter;
    
    const hasStartArrow = markerStart && markerStart.length > 0;
    const hasEndArrow = markerEnd && markerEnd.length > 0;
    
    // Calculate direct vector (used for both straight and curved logic)
    const dx = pathEnd.x - pathStart.x;
    const dy = pathEnd.y - pathStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    let newPath;
    let labelX, labelY;
    let labelBBox = { width: 10, height: 5 }; // Default/fallback
    if (label) {
        try {
            labelBBox = label.getBBox();
        } catch (e) { /* Ignore error */ }
    }

    // --- Conditional Path and Label Logic ---
    if (useCurvedEdges && length > 0) { // Apply curve logic
        const midX = (pathStart.x + pathEnd.x) / 2;
        const midY = (pathStart.y + pathEnd.y) / 2;
        
        const standardPerpX = -dy;
        const standardPerpY = dx;

        let perpX, perpY;
        const isMoreVertical = Math.abs(dy) >= Math.abs(dx);
        let useStandardPerp = true;

        if (dx >= 0 && dy < 0) { 
            if (isMoreVertical) useStandardPerp = false;
        } else if (dx >= 0 && dy >= 0) { 
            if (!isMoreVertical) useStandardPerp = false;
        } else if (dx < 0 && dy >= 0) { 
            if (isMoreVertical) useStandardPerp = false;
        } else { 
            if (!isMoreVertical) useStandardPerp = false;
        }
        
        if (useStandardPerp) {
            perpX = -standardPerpX; 
            perpY = -standardPerpY;
        } else {
            perpX = standardPerpX; 
            perpY = standardPerpY; 
        }

        const perpLength = Math.sqrt(perpX * perpX + perpY * perpY);
        const normPerpX = perpLength === 0 ? 0 : perpX / perpLength;
        const normPerpY = perpLength === 0 ? 0 : perpY / perpLength;
        
        const curveFactor = 0.15; 
        const minOffset = 5;
        const maxOffset = 50;
        const curveOffset = Math.max(minOffset, Math.min(maxOffset, length * curveFactor));

        const controlX = midX + normPerpX * curveOffset;
        const controlY = midY + normPerpY * curveOffset;

        // Adjust endpoints for arrows along the curve
        if (length > 10) {
            const regularOffset = 5;
            const arrowTipOffset = 20;

            const dxStartCtrl = controlX - pathStart.x;
            const dyStartCtrl = controlY - pathStart.y;
            const lenStartCtrl = Math.sqrt(dxStartCtrl * dxStartCtrl + dyStartCtrl * dyStartCtrl);
            const unitStartX = lenStartCtrl === 0 ? 0 : dxStartCtrl / lenStartCtrl;
            const unitStartY = lenStartCtrl === 0 ? 0 : dyStartCtrl / lenStartCtrl;
            
            pathStart = {
                x: pathStart.x + unitStartX * (hasStartArrow ? arrowTipOffset : regularOffset),
                y: pathStart.y + unitStartY * (hasStartArrow ? arrowTipOffset : regularOffset)
            };

            const dxCtrlEnd = pathEnd.x - controlX;
            const dyCtrlEnd = pathEnd.y - controlY;
            const lenCtrlEnd = Math.sqrt(dxCtrlEnd * dxCtrlEnd + dyCtrlEnd * dyCtrlEnd);
            const unitEndX = lenCtrlEnd === 0 ? 0 : dxCtrlEnd / lenCtrlEnd;
            const unitEndY = lenCtrlEnd === 0 ? 0 : dyCtrlEnd / lenCtrlEnd;
            
            pathEnd = {
                x: pathEnd.x - unitEndX * (hasEndArrow ? arrowTipOffset : regularOffset),
                y: pathEnd.y - unitEndY * (hasEndArrow ? arrowTipOffset : regularOffset)
            };
        }
        
        newPath = `M${pathStart.x},${pathStart.y} Q${controlX},${controlY} ${pathEnd.x},${pathEnd.y}`;

        // Label position for curve
        if (label) {
            const labelOffsetX = normPerpX * (labelBBox.height / 2 + 2); 
            const labelOffsetY = normPerpY * (labelBBox.height / 2 + 2); 
            labelX = controlX + labelOffsetX - labelBBox.width / 2;
            labelY = controlY + labelOffsetY; 
        }

    } else { // Apply straight line logic
        // Adjust endpoints for arrows along the straight line
        if (length > 10) {
            const regularOffset = 5;
            const arrowTipOffset = 20;
            const unitX = dx / length;
            const unitY = dy / length;

            pathStart = {
                x: pathStart.x + unitX * (hasStartArrow ? arrowTipOffset : regularOffset),
                y: pathStart.y + unitY * (hasStartArrow ? arrowTipOffset : regularOffset)
            };
            pathEnd = {
                x: pathEnd.x - unitX * (hasEndArrow ? arrowTipOffset : regularOffset),
                y: pathEnd.y - unitY * (hasEndArrow ? arrowTipOffset : regularOffset)
            };
        }
        
        newPath = `M${pathStart.x},${pathStart.y} L${pathEnd.x},${pathEnd.y}`;
        
        // Label position for straight line (midpoint)
        if (label) {
            const midX = (pathStart.x + pathEnd.x) / 2;
            const midY = (pathStart.y + pathEnd.y) / 2;
            labelX = midX - labelBBox.width / 2;
            labelY = midY; // Place vertically centered on the line
        }
    }
    
    edge.setAttribute('d', newPath);

    // Update Label Position
    if (label) {
        label.setAttribute('transform', `translate(${labelX}, ${labelY})`);
    } 
}

// Helper function to redraw all edges based on current setting
function redrawAllEdges() {
    edgeConnections.forEach(connection => {
        updateEdgePosition(connection);
    });
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
        darkModeToggle.checked = false;
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

// Curve toggle handler
curveToggle.addEventListener('change', () => {
    useCurvedEdges = curveToggle.checked;
    redrawAllEdges(); // Update existing edges
});
