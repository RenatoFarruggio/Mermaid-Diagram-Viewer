# Mermaid Class Diagram Viewer

An interactive viewer for Mermaid class diagrams that allows you to rearrange nodes by dragging them.

## Features

- Display Mermaid class diagrams
- Drag and rearrange nodes interactively
- Pan across the diagram with middle-click + drag
- Zoom in/out with mouse wheel
- Toggle between curved and straight edges
- Switch between light and dark mode

## Demo

Try it online: [Mermaid Class Diagram Viewer](https://renatofarruggio.github.io/Mermaid-Diagram-Viewer/)

## Usage

1. Write your Mermaid class diagram syntax in the text area
2. Interact with the rendered diagram:
   - Left-click and drag on a class node to move it
   - Middle-click and drag on the background to pan
   - Use the mouse wheel to zoom in/out
   - Toggle dark mode and curved edges using the checkboxes

## Example

The viewer comes with a simple example diagram to get you started:

```
classDiagram
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
```

## License

[MIT License](LICENSE)