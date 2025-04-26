import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

const mermaidInput = document.getElementById('mermaidInput');
const mermaidOutput = document.getElementById('mermaidOutput');
const darkModeToggle = document.getElementById('darkModeToggle');

// For tracking SVG pan-zoom instance
let panZoomInstance = null;
// For tracking draggable nodes
let isDragging = false;
let currentNode = null;
let startX = 0;
let startY = 0;
let transform = null;
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
        beforePan: function(oldPan, newPan) {
            // Only allow panning when right mouse button is pressed
            return window.event && window.event.buttons === 2 ? newPan : oldPan;
        }
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
    const edges = svg.querySelectorAll('g.edgePath');
    const nodes = svg.querySelectorAll('g.node');
    
    // Create a map of node IDs to node elements
    const nodeMap = new Map();
    nodes.forEach(node => {
        const classes = node.getAttribute('class').split(' ');
        // Find class that might contain node ID
        for (const cls of classes) {
            if (cls.includes('classId-')) {
                nodeMap.set(cls, node);
                break;
            }
        }
    });
    
    // Analyze edge paths to find connection points
    edges.forEach(edge => {
        const edgeId = edge.id;
        const paths = edge.querySelectorAll('path');
        
        if (paths.length > 0) {
            // Try to find connected nodes
            const classes = edge.getAttribute('class').split(' ');
            const sourceNodeClass = classes.find(cls => cls.includes('classId-') && cls.includes('from'));
            const targetNodeClass = classes.find(cls => cls.includes('classId-') && cls.includes('to'));
            
            // Extract just the classId part
            const sourceNodeId = sourceNodeClass ? sourceNodeClass.split('-from-')[0] : null;
            const targetNodeId = targetNodeClass ? targetNodeClass.split('-to-')[0] : null;
            
            if (sourceNodeId && targetNodeId) {
                const sourceNode = nodeMap.get(sourceNodeId);
                const targetNode = nodeMap.get(targetNodeId);
                
                if (sourceNode && targetNode) {
                    // Store connection info
                    edgeConnections.set(edgeId, {
                        edge: edge,
                        source: sourceNode,
                        target: targetNode,
                        paths: Array.from(paths)
                    });
                }
            }
        }
    });
}

// Node dragging handlers
function handleNodeMouseDown(e) {
    // Only respond to left mouse button (button 0)
    if (e.button !== 0) return;
    
    // Prevent SVG pan-zoom from interfering
    e.stopPropagation();
    isDragging = true;
    currentNode = this;
    
    // Find existing transform or create default one
    const transformAttr = currentNode.getAttribute('transform') || 'translate(0,0)';
    const match = transformAttr.match(/translate\(\s*([^,)]+)(?:,\s*([^)]+))?\)/);
    
    if (match) {
        transform = {
            x: parseFloat(match[1]) || 0,
            y: parseFloat(match[2]) || 0
        };
    } else {
        transform = { x: 0, y: 0 };
    }
    
    // Store starting point
    startX = e.clientX;
    startY = e.clientY;
    
    // Add a temporary class for styling
    currentNode.classList.add('dragging');
}

function handleNodeMouseMove(e) {
    if (!isDragging || !currentNode) return;
    
    // Calculate the new position
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // Get zoom factor to adjust the movement
    const zoomLevel = panZoomInstance ? panZoomInstance.getZoom() : 1;
    
    // Calculate new transformed position
    const newX = transform.x + dx / zoomLevel;
    const newY = transform.y + dy / zoomLevel;
    
    // Apply the transform
    currentNode.setAttribute('transform', `translate(${newX},${newY})`);
    
    // Update edges connected to this node
    updateConnectedEdges(currentNode);
}

function handleNodeMouseUp() {
    if (currentNode) {
        currentNode.classList.remove('dragging');
        
        // Final update of connected edges
        updateConnectedEdges(currentNode);
    }
    
    isDragging = false;
    currentNode = null;
}

// More robust edge update function
function updateConnectedEdges(node) {
    if (!node) return;
    
    // Find all edges connected to this node
    edgeConnections.forEach((connection, edgeId) => {
        if (connection.source === node || connection.target === node) {
            updateEdgePosition(connection);
        }
    });
}

// Update edge position based on node positions
function updateEdgePosition(connection) {
    const { edge, source, target, paths } = connection;
    if (!edge || !source || !target || !paths || paths.length === 0) return;
    
    // Get source and target positions
    const sourceRect = source.getBBox();
    const targetRect = target.getBBox();
    
    // Get transforms
    const sourceTransform = getNodeTransform(source);
    const targetTransform = getNodeTransform(target);
    
    // Calculate centers
    const sourceCenter = {
        x: sourceRect.x + sourceRect.width / 2 + sourceTransform.x,
        y: sourceRect.y + sourceRect.height / 2 + sourceTransform.y
    };
    
    const targetCenter = {
        x: targetRect.x + targetRect.width / 2 + targetTransform.x,
        y: targetRect.y + targetRect.height / 2 + targetTransform.y
    };
    
    // Update the main path
    if (paths.length > 0) {
        const mainPath = paths[0]; // Usually the first path is the main one
        
        // For simplicity, create a straight line between centers
        // A more complex implementation would consider the shape boundaries
        const dAttr = `M${sourceCenter.x},${sourceCenter.y} L${targetCenter.x},${targetCenter.y}`;
        mainPath.setAttribute('d', dAttr);
        
        // If there are marker paths (arrowheads), update those too
        if (paths.length > 1) {
            for (let i = 1; i < paths.length; i++) {
                // This is a simple approach - ideally you'd calculate proper arrowhead positions
                paths[i].setAttribute('transform', `translate(${targetCenter.x},${targetCenter.y})`);
            }
        }
    }
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

// Set default text and initial render
mermaidInput.value = defaultDiagram;

// Initialize Mermaid
mermaid.initialize({
    startOnLoad: false, // We'll render manually
    theme: document.body.classList.contains('dark-mode') ? 'dark' : 'default',
    securityLevel: 'loose', // Needed for certain interactions with SVG
    class: {
        // Potentially configure class diagram specifics if needed
    }
});

// Initial render
renderMermaid();

// Re-render on input change (with debounce)
let debounceTimer;
mermaidInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderMermaid, 500); // Wait 500ms after last input
});

// Dark mode toggle
darkModeToggle.addEventListener('change', () => {
    document.body.classList.toggle('dark-mode', darkModeToggle.checked);
    // Re-initialize Mermaid with the new theme and re-render
    mermaid.initialize({
        startOnLoad: false,
        theme: darkModeToggle.checked ? 'dark' : 'default',
        securityLevel: 'loose'
    });
    renderMermaid(); // Re-render with the new theme
});

// Apply initial dark mode based on system preference (optional)
if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    if (!darkModeToggle.checked) {
        darkModeToggle.checked = true;
        document.body.classList.add('dark-mode');
        // Initial theme setting if dark mode is preferred
        mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            securityLevel: 'loose'
        });
        renderMermaid(); // Re-render if theme changed on load
    }
} else {
    // Ensure default theme if not dark mode preference
     mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
    });
    renderMermaid();
}

// --- Future Enhancements Placeholder ---
// Dragging nodes, panning, zooming will require more complex SVG manipulation
// potentially using libraries like d3.js or svg-pan-zoom. 