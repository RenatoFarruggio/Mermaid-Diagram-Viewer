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
                    
                    // Store the original path data for later use
                    const originalD = edge.getAttribute('d');
                    const markerEnd = edge.getAttribute('marker-end');
                    const markerStart = edge.getAttribute('marker-start');
                    
                    edgeConnections.set(edgeId, {
                        edge: edge,
                        source: sourceNode,
                        target: targetNode,
                        originalD: originalD,
                        markerEnd: markerEnd,
                        markerStart: markerStart,
                        // Initial positions for reference
                        initialSourcePos: getNodeCenterPosition(sourceNode),
                        initialTargetPos: getNodeCenterPosition(targetNode)
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
    console.log(`Finding intersection: From (${fromX}, ${fromY}) to (${toX}, ${toY}) with rect (${rect.left}, ${rect.top}, ${rect.right}, ${rect.bottom})`);
    
    // Calculate direction vector
    const dx = toX - fromX;
    const dy = toY - fromY;
    
    // For points inside the rectangle, we still want to find the border intersection
    // in the direction of the target point
    if (fromX >= rect.left && fromX <= rect.right && 
        fromY >= rect.top && fromY <= rect.bottom) {
        console.log("  Source point is inside rectangle, finding border intersection");
        
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
            console.log(`  Found border intersection at (${closestPoint.x}, ${closestPoint.y})`);
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
                    console.log(`  Found intersection with left edge at (${rect.left}, ${y}), dist=${dist}`);
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
                    console.log(`  Found intersection with right edge at (${rect.right}, ${y}), dist=${dist}`);
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
                    console.log(`  Found intersection with top edge at (${x}, ${rect.top}), dist=${dist}`);
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
                    console.log(`  Found intersection with bottom edge at (${x}, ${rect.bottom}), dist=${dist}`);
                }
            }
        }
    }
    
    if (closestPoint) {
        console.log(`  Closest intersection point: (${closestPoint.x}, ${closestPoint.y}), dist=${minDist}`);
        return closestPoint;
    } else {
        console.log("  No intersection found with rectangle");
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

// Update edge position based on node positions using transforms
function updateEdgePosition(connection) {
    const { edge, source, target, originalD, initialSourcePos, initialTargetPos, markerStart, markerEnd } = connection;
    
    if (!edge || !source || !target || !originalD) {
        console.error("updateEdgePosition: Missing required connection data.");
        return;
    }

    console.log(`  Updating position for edge between ${source.id} and ${target.id}`);
    console.log(`  Edge has markerStart: ${markerStart || 'none'}, markerEnd: ${markerEnd || 'none'}`);

    // Get current source and target positions
    const sourceCenter = getNodeCenterPosition(source);
    const targetCenter = getNodeCenterPosition(target);
    
    // Get current node rectangles with transforms applied
    const sourceRect = getNodeRect(source);
    const targetRect = getNodeRect(target);
    
    console.log("Source rect:", sourceRect);
    console.log("Target rect:", targetRect);
    
    // Find intersection points with rectangle edges
    const sourceIntersection = findIntersection(sourceRect, sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y);
    const targetIntersection = findIntersection(targetRect, targetCenter.x, targetCenter.y, sourceCenter.x, sourceCenter.y);
    
    // If we couldn't find intersections, use the centers
    let pathStart = sourceIntersection || sourceCenter;
    let pathEnd = targetIntersection || targetCenter;
    
    console.log("Original source intersection:", pathStart);
    console.log("Original target intersection:", pathEnd);
    
    // Determine which end needs extra offset for arrow visibility
    const hasStartArrow = markerStart && markerStart.length > 0;
    const hasEndArrow = markerEnd && markerEnd.length > 0;
    
    // Calculate direction vector
    const dx = pathEnd.x - pathStart.x;
    const dy = pathEnd.y - pathStart.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    // Only add offset if the points aren't too close together
    if (length > 10) {
        // Unit vector in the direction of the line
        const unitX = dx / length;
        const unitY = dy / length;
        
        // Use different offsets for start and end
        const regularOffset = 5;     // Regular offset (non-arrow end)
        const arrowTipOffset = 20;   // Arrow tip needs more space to be fully visible
        
        // Apply offset to start point - bigger offset if there's a start arrow
        pathStart = {
            x: pathStart.x + unitX * (hasStartArrow ? arrowTipOffset : regularOffset),
            y: pathStart.y + unitY * (hasStartArrow ? arrowTipOffset : regularOffset)
        };
        
        // Apply offset to end point - bigger offset if there's an end arrow
        pathEnd = {
            x: pathEnd.x - unitX * (hasEndArrow ? arrowTipOffset : regularOffset),
            y: pathEnd.y - unitY * (hasEndArrow ? arrowTipOffset : regularOffset)
        };
        
        console.log("Adjusted path start:", pathStart);
        console.log("Adjusted path end:", pathEnd);
    }
    
    // Update the edge's path (always from source to target)
    const newPath = `M${pathStart.x},${pathStart.y} L${pathEnd.x},${pathEnd.y}`;
    edge.setAttribute('d', newPath);
    console.log(`    Set edge path to: ${newPath}`);
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