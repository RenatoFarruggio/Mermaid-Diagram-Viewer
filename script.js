import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';

const mermaidInput = document.getElementById('mermaidInput');
const mermaidOutput = document.getElementById('mermaidOutput');
const darkModeToggle = document.getElementById('darkModeToggle');

const defaultDiagram = `classDiagram
Animal <|-- Dog
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

// Function to render the Mermaid diagram
const renderMermaid = async () => {
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
    // securityLevel: 'loose', // Might be needed depending on content, but start stricter
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
        theme: darkModeToggle.checked ? 'dark' : 'default'
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
            theme: 'dark'
        });
        renderMermaid(); // Re-render if theme changed on load
    }
} else {
    // Ensure default theme if not dark mode preference
     mermaid.initialize({
        startOnLoad: false,
        theme: 'default'
    });
    renderMermaid();
}

// --- Future Enhancements Placeholder ---
// Dragging nodes, panning, zooming will require more complex SVG manipulation
// potentially using libraries like d3.js or svg-pan-zoom. 