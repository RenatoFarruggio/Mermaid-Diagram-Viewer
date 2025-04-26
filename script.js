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
    if (!svg) return;
    
    // Reset instance if exists
    if (panZoomInstance) {
        panZoomInstance.destroy();
    }
    
    // Get the SVG dimensions and parent container dimensions
    const svgBBox = svg.getBBox();
    const containerWidth = mermaidOutput.clientWidth;
    const containerHeight = mermaidOutput.clientHeight;
    
    // Calculate center point of the diagram
    const centerX = svgBBox.x + svgBBox.width / 2;
    const centerY = svgBBox.y + svgBBox.height / 2;
    
    // Set an explicit viewBox centered on the diagram
    const viewBoxWidth = Math.max(svgBBox.width * 1.1, containerWidth);
    const viewBoxHeight = Math.max(svgBBox.height * 1.1, containerHeight);
    const viewBoxX = centerX - viewBoxWidth / 2;
    const viewBoxY = centerY - viewBoxHeight / 2;
    
    // Apply the centered viewBox
    svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);

    // Panning state - needs to be accessible by the listener
    let isPanning = false;

    svg.addEventListener('mousedown', (e) => {
        // Handle RIGHT clicks only for panning or node dragging
        if (e.button === 2) {
            const targetNode = e.target.closest('g.node');
            if (targetNode) {
                // Right-clicked on a node, initiate drag
                isPanning = false; // Ensure panning is disabled
                handleNodeMouseDown(e, targetNode); // Manually call handler
            } else {
                // Right-clicked on background, allow panning
                isPanning = true;
            }
        } else {
            // Other clicks (left/middle) should not interfere
            isPanning = false;
        }
    });
    
    svg.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
        }
        // Note: Node drag mouseup is handled by the document listener
    });
    
    svg.addEventListener('mouseleave', () => {
         if (isPanning) {
             isPanning = false;
         }
         // Note: Node drag mouseup is handled by the document listener
    });

    // Create new instance, using the isPanning flag in beforePan
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
        beforePan: () => isPanning // Control panning based on our flag
    });
    
    // Force center and fit once the pan-zoom is initialized
    setTimeout(() => {
        if (panZoomInstance) {
            panZoomInstance.center();
            panZoomInstance.fit();
        }
    }, 100);
    
    // Prevent the default context menu on the SVG element for all right-clicks
    svg.addEventListener('contextmenu', e => {
        e.preventDefault();
        return false;
    });
}

// Make nodes draggable
const makeNodesDraggable = () => {
    const svg = mermaidOutput.querySelector('svg');
    if (!svg) return;
    
    // Find and analyze all edges
    analyzeEdges(svg);
    
    // Nodes are handled by the central SVG listener now.
    // Just ensure shapes within nodes are clickable.
    const nodes = svg.querySelectorAll('g.node');
    nodes.forEach(node => {
        // node.addEventListener('mousedown', handleNodeMouseDown); // REMOVED THIS
        
        // Make sure the whole node is clickable
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
    edgeConnections.clear(); // Ensure we start fresh
    // console.log("--- Analyzing Edges --- Firing analyseEdges ---");

    // Get nodes first
    const nodes = svg.querySelectorAll('g.node');
    const nodeMap = new Map();
    // console.log(`Found ${nodes.length} potential node elements (g.node)`);
    nodes.forEach((node, index) => {
        const nodeId = node.id;
        if (nodeId) {
            // console.log(`  Node ${index}: Found ID: ${nodeId}`);
            nodeMap.set(nodeId, node);
        } else {
            // console.warn(`  Node ${index}: Missing ID.`);
        }
    });
    // console.log(`Mapped ${nodeMap.size} nodes based on their IDs.`);

    // Get edge paths - they're direct children of g.edgePaths
    const edgePathsGroup = svg.querySelector('g.edgePaths');
    const edges = edgePathsGroup ? Array.from(edgePathsGroup.querySelectorAll('path')) : []; // Get as array
    // console.log(`Found ${edges.length} edge paths`);

    // Get edge labels - they're direct children of g.edgeLabels
    const edgeLabelsGroup = svg.querySelector('g.edgeLabels');
    const labels = edgeLabelsGroup ? Array.from(edgeLabelsGroup.querySelectorAll('g.edgeLabel')) : []; // Get as array
    // console.log(`Found ${labels.length} edge labels`);

    // Basic sanity check for order-based matching
    if (edges.length !== labels.length && labels.length > 0) {
        console.warn(`WARN: Mismatch between edge path count (${edges.length}) and edge label count (${labels.length}). Label association by order might be incorrect.`);
        // We'll still try, but it might fail for some edges
    }

    edges.forEach((edge, index) => {
        // Use index as a fallback if ID is missing, important for map key
        const edgeId = edge.id || `edge-index-${index}`;
        // console.log(`Analyzing Edge ${index}: ID='${edge.id || '(no id)'}' (Using map key: ${edgeId})`);

        // Extract source and target from the ID if possible (format: id_Animal_Dog_1)
        const idParts = edge.id ? edge.id.split('_') : [];
        let sourceName = `unknownSource-${index}`;
        let targetName = `unknownTarget-${index}`;

        if (idParts.length >= 3) {
            sourceName = idParts[1]; // e.g., "Animal"
            targetName = idParts[2]; // e.g., "Dog"
            // console.log(`  Extracted from ID: ${sourceName} -> ${targetName}`);
        } else {
            // console.warn(`  WARN: Could not extract source/target names from edge ID '${edge.id}'. Node lookup might fail.`);
        }

        // Find the corresponding node IDs - This part needs the names
        // If names couldn't be extracted, node lookup will likely fail here
        const sourceNodeId = Array.from(nodeMap.keys()).find(id => id && id.includes(sourceName));
        const targetNodeId = Array.from(nodeMap.keys()).find(id => id && id.includes(targetName));
        // console.log(`  Attempting node lookup for: ${sourceName} -> ${targetName}`);
        // console.log(`  Found node IDs: ${sourceNodeId || 'Not Found'} -> ${targetNodeId || 'Not Found'}`);

        // --- Associate label based on index ---
        let correspondingLabel = null;
        if (index < labels.length) {
            correspondingLabel = labels[index];
            // const labelId = correspondingLabel.id || `label-index-${index}`; // Use index if ID missing
            // console.log(`  Associated label index ${index} (ID: '${correspondingLabel.id || '(no id)'}')`);
        } else {
            // console.warn(`  WARN: No corresponding label found at index ${index} for edge ${edgeId}`);
        }
        // --- End label association ---


        if (sourceNodeId && targetNodeId) {
            const sourceNode = nodeMap.get(sourceNodeId);
            const targetNode = nodeMap.get(targetNodeId);

            if (sourceNode && targetNode) {
                // console.log(`  SUCCESS: Linked edge ${edgeId} from ${sourceNodeId} to ${targetNodeId}`);

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
            } else {
                 // console.warn(`  WARN: Found node IDs (${sourceNodeId}, ${targetNodeId}) but couldn't retrieve nodes from map.`);
            }
        } else {
            // console.warn(`  WARN: Could not find matching node IDs for edge ${edgeId} (Names: ${sourceName}, ${targetName})`);
            // Still store edge info even if nodes aren't found? Maybe not useful without nodes.
            // Let's only store if nodes are found.
        }
    });

    // console.log(`--- Edge analysis complete. ${edgeConnections.size} connections stored. ---`);
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
    // console.log(`Finding intersection: From (${fromX}, ${fromY}) to (${toX}, ${toY}) with rect (${rect.left}, ${rect.top}, ${rect.right}, ${rect.bottom})`);
    
    // Calculate direction vector
    const dx = toX - fromX;
    const dy = toY - fromY;
    
    // For points inside the rectangle, we still want to find the border intersection
    // in the direction of the target point
    if (fromX >= rect.left && fromX <= rect.right && 
        fromY >= rect.top && fromY <= rect.bottom) {
        // console.log("  Source point is inside rectangle, finding border intersection");
        
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
            // console.log(`  Found border intersection at (${closestPoint.x}, ${closestPoint.y})`);
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
                    // console.log(`  Found intersection with left edge at (${rect.left}, ${y}), dist=${dist}`);
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
                    // console.log(`  Found intersection with right edge at (${rect.right}, ${y}), dist=${dist}`);
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
                    // console.log(`  Found intersection with top edge at (${x}, ${rect.top}), dist=${dist}`);
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
                    // console.log(`  Found intersection with bottom edge at (${x}, ${rect.bottom}), dist=${dist}`);
                }
            }
        }
    }
    
    if (closestPoint) {
        // console.log(`  Closest intersection point: (${closestPoint.x}, ${closestPoint.y}), dist=${minDist}`);
        return closestPoint;
    } else {
        // console.log("  No intersection found with rectangle");
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
    // Right-click check is done in the caller (SVG listener)
    
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
    
    // console.log('[Drag Start]', { // Removed log
    //     nodeId: node.id,
    //     clientX: e.clientX, clientY: e.clientY,
    //     viewportCTMInverse: ctmInverse,
    //     initialTransform: initialTransform
    // });

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
        // console.error("SVG or viewport group not found during move!"); // Keep error for potential future issues?
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

    // console.log('[Drag Move]', { // Removed log
    //     nodeId: dragContext.node.id,
    //     clientX: e.clientX, clientY: e.clientY,
    //     deltaClient: { x: deltaClientX, y: deltaClientY },
    //     viewportCTMInverse: ctmInverse,
    //     deltaSvg: { x: deltaSvgX, y: deltaSvgY },
    //     initialTransform: dragContext.initialTransform,
    //     newTransform: { x: newX, y: newY }
    // });

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
    // console.log(`Updating edges connected to node: ${node.id}`);
    
    // Find all edges connected to this node
    edgeConnections.forEach((connection, edgeId) => {
        if (connection.source === node || connection.target === node) {
            // console.log(`  -> Updating edge: ${edgeId}`);
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
    
    if (!edge || !source || !target || !originalD) {
        // console.error("updateEdgePosition: Missing required connection data."); // Keep error?
        return;
    }

    // console.log(`  Updating position for edge between ${source.id} and ${target.id}`);
    // console.log(`  Edge has markerStart: ${markerStart || 'none'}, markerEnd: ${markerEnd || 'none'}`);

    // Get current source and target positions
    const sourceCenter = getNodeCenterPosition(source);
    const targetCenter = getNodeCenterPosition(target);
    
    // Get current node rectangles with transforms applied
    const sourceRect = getNodeRect(source);
    const targetRect = getNodeRect(target);
    
    // console.log("Source rect:", sourceRect);
    // console.log("Target rect:", targetRect);
    
    // Find intersection points with rectangle edges
    const sourceIntersection = findIntersection(sourceRect, sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y);
    const targetIntersection = findIntersection(targetRect, targetCenter.x, targetCenter.y, sourceCenter.x, sourceCenter.y);
    
    // If we couldn't find intersections, use the centers
    let pathStart = sourceIntersection || sourceCenter;
    let pathEnd = targetIntersection || targetCenter;
    
    // console.log("Original source intersection:", pathStart);
    // console.log("Original target intersection:", pathEnd);
    
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
        
        // console.log("Adjusted path start:", pathStart);
        // console.log("Adjusted path end:", pathEnd);
    }
    
    // Update the edge's path (always from source to target)
    const newPath = `M${pathStart.x},${pathStart.y} L${pathEnd.x},${pathEnd.y}`;
    edge.setAttribute('d', newPath);
    // console.log(`    Set edge path to: ${newPath}`);

    // --- Update Label Position ---
    if (label) {
        // Calculate the midpoint of the *adjusted* edge segment
        const midX = (pathStart.x + pathEnd.x) / 2;
        const midY = (pathStart.y + pathEnd.y) / 2;

        // Get the label's bounding box to help center it
        // Note: getBBox() might not work perfectly if the label itself has transforms.
        // If labels are complex, this might need adjustment.
        let labelBBox = { width: 0, height: 0 };
        try {
             // Need to handle potential errors if the element isn't rendered correctly yet
             labelBBox = label.getBBox();
        } catch (e) {
            // console.warn(`Could not get BBox for label ${label.id}: ${e.message}`); // Keep warning?
            // Use a default small size or skip positioning if BBox fails
            labelBBox = { width: 10, height: 5 }; // Fallback estimate
        }

        // Apply translate transform to the label group
        // Center the label based on its bounding box
        const labelX = midX - labelBBox.width / 2;
        const labelY = midY; // Place vertically centered on the line

        label.setAttribute('transform', `translate(${labelX}, ${labelY})`);
        // console.log(`    Set label ${label.id} transform to: translate(${labelX}, ${labelY})`);
    } else {
        // console.log(`    No label found for edge ${edge.id} to update.`);
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
        // console.error("Mermaid rendering error:", error); // Keep error?
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
// Removed placeholder comment

// console.log statements removed from the script. 