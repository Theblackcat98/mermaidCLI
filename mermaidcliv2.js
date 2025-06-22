#!/usr/bin/env node

/**
 * Enhanced CLI Mermaid Visualizer
 * Supports flowcharts, state diagrams, and sequence diagrams with ASCII rendering
 * Usage: node mermaid-cli.js [file.mmd] [options]
 */

const fs = require('fs');
const process = require('process');
const path = require('path');

class MermaidParser {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.participants = [];
    this.nodeCounter = 0;
    this.diagramType = null;
  }

  parse(mermaidText) {
    const lines = mermaidText.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('%%')); // Filter comments

    if (lines.length === 0) {
      throw new Error('Empty diagram content');
    }

    // Detect diagram type
    this.diagramType = this.detectDiagramType(lines[0]);

    if (this.diagramType === 'flowchart') {
      return this.parseFlowchart(lines);
    } else if (this.diagramType === 'stateDiagram') {
      return this.parseStateDiagram(lines);
    } else if (this.diagramType === 'sequenceDiagram') {
      return this.parseSequenceDiagram(lines);
    }

    throw new Error(`Unsupported diagram type: ${this.diagramType}`);
  }

  detectDiagramType(firstLine) {
    const line = firstLine.toLowerCase();
    if (line.includes('graph') || line.includes('flowchart')) {
      return 'flowchart';
    } else if (line.includes('statediagram')) {
      return 'stateDiagram';
    } else if (line.includes('sequencediagram')) {
      return 'sequenceDiagram';
    }
    throw new Error(`Unsupported diagram type: ${firstLine}`);
  }

  parseFlowchart(lines) {
    const direction = this.parseDirection(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      try {
        this.parseFlowchartLine(lines[i]);
      } catch (error) {
        throw new Error(`Error parsing line ${i + 1}: "${lines[i]}" - ${error.message}`);
      }
    }

    if (this.nodes.size === 0) {
      throw new Error('No nodes found in flowchart');
    }

    return {
      type: 'flowchart',
      nodes: this.nodes,
      edges: this.edges,
      direction
    };
  }

  parseStateDiagram(lines) {
    for (let i = 1; i < lines.length; i++) {
      try {
        this.parseStateLine(lines[i]);
      } catch (error) {
        throw new Error(`Error parsing line ${i + 1}: "${lines[i]}" - ${error.message}`);
      }
    }

    if (this.nodes.size === 0) {
      throw new Error('No states found in state diagram');
    }

    return {
      type: 'stateDiagram',
      nodes: this.nodes,
      edges: this.edges,
      direction: 'TD'
    };
  }

  parseSequenceDiagram(lines) {
    for (let i = 1; i < lines.length; i++) {
      try {
        this.parseSequenceLine(lines[i]);
      } catch (error) {
        throw new Error(`Error parsing line ${i + 1}: "${lines[i]}" - ${error.message}`);
      }
    }

    if (this.participants.length === 0) {
      throw new Error('No participants found in sequence diagram');
    }

    return {
      type: 'sequenceDiagram',
      participants: this.participants,
      edges: this.edges
    };
  }

  parseDirection(firstLine) {
    const match = firstLine.match(/(?:graph|flowchart)\s+(\w+)/i);
    return match ? match[1].toUpperCase() : 'TD';
  }

  parseFlowchartLine(line) {
    // Enhanced regex to handle more complex syntax
    const arrowRegex = /([A-Za-z0-9_]+)(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*(-->|---|\.->\.|==>\s*)\s*([A-Za-z0-9_]+)(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?/g;
    let match;
    let hasMatch = false;

    while ((match = arrowRegex.exec(line)) !== null) {
      hasMatch = true;
      const [, fromId, fromLabel, arrow, toId, toLabel] = match;

      this.addNode(fromId, fromLabel);
      this.addNode(toId, toLabel);

      this.edges.push({
        from: fromId,
        to: toId,
        type: arrow
      });
    }

    // Handle standalone node definitions
    if (!hasMatch) {
      const nodeRegex = /([A-Za-z0-9_]+)(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})/;
      const nodeMatch = line.match(nodeRegex);
      if (nodeMatch) {
        const [, nodeId, nodeLabel] = nodeMatch;
        this.addNode(nodeId, nodeLabel);
      }
    }
  }

  parseStateLine(line) {
    const stateRegex = /([A-Za-z0-9_]+)\s*-->\s*([A-Za-z0-9_]+)(?:\s*:\s*(.+))?/;
    const match = line.match(stateRegex);

    if (match) {
      const [, fromState, toState, trigger] = match;

      this.addStateNode(fromState);
      this.addStateNode(toState);

      this.edges.push({
        from: fromState,
        to: toState,
        type: '-->',
        label: trigger || ''
      });
      return;
    }

    const stateDefRegex = /state\s+"([^"]+)"\s+as\s+([A-Za-z0-9_]+)/;
    const defMatch = line.match(stateDefRegex);
    if (defMatch) {
      const [, label, id] = defMatch;
      this.addStateNode(id, label);
    }
  }

  parseSequenceLine(line) {
    const participantRegex = /participant\s+([A-Za-z0-9_]+)(?:\s+as\s+(.+))?/;
    const participantMatch = line.match(participantRegex);

    if (participantMatch) {
      const [, id, label] = participantMatch;
      this.addParticipant(id, label || id);
      return;
    }

    const messageRegex = /([A-Za-z0-9_]+)\s*(->>|-->|-x|--x)\s*([A-Za-z0-9_]+)\s*:\s*(.+)/;
    const messageMatch = line.match(messageRegex);

    if (messageMatch) {
      const [, from, arrow, to, message] = messageMatch;

      this.addParticipant(from);
      this.addParticipant(to);

      this.edges.push({
        from,
        to,
        type: arrow,
        label: message,
        sequence: this.edges.length
      });
    }
  }

  addNode(id, labelMatch) {
    if (!this.nodes.has(id)) {
      let label = id;
      let shape = 'rect';

      if (labelMatch) {
        if (labelMatch.startsWith('[') && labelMatch.endsWith(']')) {
          label = labelMatch.slice(1, -1);
          shape = 'rect';
        } else if (labelMatch.startsWith('(') && labelMatch.endsWith(')')) {
          label = labelMatch.slice(1, -1);
          shape = 'round';
        } else if (labelMatch.startsWith('{') && labelMatch.endsWith('}')) {
          label = labelMatch.slice(1, -1);
          shape = 'rhombus';
        }
      }

      this.nodes.set(id, {
        id,
        label,
        x: 0,
        y: 0,
        width: Math.max(label.length + 2, 6),
        height: 3,
        shape
      });
    }
  }

  addStateNode(id, label) {
    if (!this.nodes.has(id)) {
      const nodeLabel = label || id;
      this.nodes.set(id, {
        id,
        label: nodeLabel,
        x: 0,
        y: 0,
        width: Math.max(nodeLabel.length + 4, 10),
        height: 3,
        shape: 'roundedRect'
      });
    }
  }

  addParticipant(id, label) {
    const participantLabel = label || id;

    if (!this.participants.find(p => p.id === id)) {
      this.participants.push({
        id,
        label: participantLabel,
        x: 0,
        y: 0,
        width: Math.max(participantLabel.length + 2, 8),
        height: 3
      });
    }
  }
}

class SimpleLayoutEngine {
  constructor(nodes, edges, direction = 'TD') {
    this.nodes = nodes;
    this.edges = edges;
    this.direction = direction;
    this.levels = new Map();
  }

  calculateLayout() {
    this.calculateLevels();
    this.positionNodes();
    return this.nodes;
  }

  calculateLevels() {
    const visited = new Set();
    const level = new Map();

    const hasIncoming = new Set();
    this.edges.forEach(edge => hasIncoming.add(edge.to));

    const roots = Array.from(this.nodes.keys()).filter(id => !hasIncoming.has(id));

    if (roots.length === 0) {
      // Handle cycles by picking arbitrary root
      const firstNode = Array.from(this.nodes.keys())[0];
      if (firstNode) roots.push(firstNode);
    }

    const queue = roots.map(id => ({ id, level: 0 }));

    while (queue.length > 0) {
      const { id, level: currentLevel } = queue.shift();

      if (visited.has(id)) continue;
      visited.add(id);

      level.set(id, currentLevel);

      this.edges
        .filter(edge => edge.from === id)
        .forEach(edge => {
          if (!visited.has(edge.to)) {
            queue.push({ id: edge.to, level: currentLevel + 1 });
          }
        });
    }

    // Handle orphaned nodes
    for (const nodeId of this.nodes.keys()) {
      if (!level.has(nodeId)) {
        level.set(nodeId, 0);
      }
    }

    this.levels = level;
  }

  positionNodes() {
    const levelGroups = new Map();

    for (const [nodeId, level] of this.levels) {
      if (!levelGroups.has(level)) {
        levelGroups.set(level, []);
      }
      levelGroups.get(level).push(nodeId);
    }

    const nodeSpacingX = 15;
    const nodeSpacingY = 8;

    for (const [level, nodeIds] of levelGroups) {
      const totalWidth = (nodeIds.length - 1) * nodeSpacingX;
      const startX = Math.max(5, Math.floor(totalWidth / 2));

      nodeIds.forEach((nodeId, index) => {
        const node = this.nodes.get(nodeId);

        if (this.direction === 'LR') {
          node.x = level * nodeSpacingX + 5;
          node.y = index * nodeSpacingY + 2;
        } else {
          node.x = startX + index * nodeSpacingX;
          node.y = level * nodeSpacingY + 2;
        }

        node.x = Math.max(0, node.x);
        node.y = Math.max(0, node.y);
      });
    }
  }
}

class ASCIIRenderer {
  constructor(nodes, edges, direction = 'TD') {
    this.nodes = nodes;
    this.edges = edges;
    this.direction = direction;
    this.canvas = [];
    this.width = 0;
    this.height = 0;
  }

  render() {
    this.calculateCanvasSize();
    this.initializeCanvas();
    this.renderNodes();
    this.renderEdges();
    return this.canvasToString();
  }

  calculateCanvasSize() {
    let maxX = 0, maxY = 0;

    for (const node of this.nodes.values()) {
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }

    this.width = Math.max(maxX + 5, 40);
    this.height = Math.max(maxY + 5, 20);
  }

  initializeCanvas() {
    this.canvas = Array(this.height).fill().map(() => Array(this.width).fill(' '));
  }

  renderNodes() {
    for (const node of this.nodes.values()) {
      switch (node.shape) {
        case 'round':
          this.drawRoundedBox(node.x, node.y, node.width, node.height, node.label);
          break;
        case 'rhombus':
          this.drawDiamond(node.x, node.y, node.width, node.height, node.label);
          break;
        case 'roundedRect':
          this.drawRoundedRect(node.x, node.y, node.width, node.height, node.label);
          break;
        default:
          this.drawBox(node.x, node.y, node.width, node.height, node.label);
      }
    }
  }

  drawBox(x, y, width, height, label) {
    for (let i = 0; i < width; i++) {
      this.setChar(x + i, y, '-');
      this.setChar(x + i, y + height - 1, '-');
    }

    for (let i = 0; i < height; i++) {
      this.setChar(x, y + i, '|');
      this.setChar(x + width - 1, y + i, '|');
    }

    this.setChar(x, y, '+');
    this.setChar(x + width - 1, y, '+');
    this.setChar(x, y + height - 1, '+');
    this.setChar(x + width - 1, y + height - 1, '+');

    this.drawLabel(x, y, width, height, label);
  }

  drawRoundedBox(x, y, width, height, label) {
    for (let i = 1; i < width - 1; i++) {
      this.setChar(x + i, y, '-');
      this.setChar(x + i, y + height - 1, '-');
    }

    for (let i = 1; i < height - 1; i++) {
      this.setChar(x, y + i, '|');
      this.setChar(x + width - 1, y + i, '|');
    }

    this.setChar(x, y, '(');
    this.setChar(x + width - 1, y, ')');
    this.setChar(x, y + height - 1, '(');
    this.setChar(x + width - 1, y + height - 1, ')');

    this.drawLabel(x, y, width, height, label);
  }

  drawRoundedRect(x, y, width, height, label) {
    for (let i = 1; i < width - 1; i++) {
      this.setChar(x + i, y, '-');
      this.setChar(x + i, y + height - 1, '-');
    }

    for (let i = 1; i < height - 1; i++) {
      this.setChar(x, y + i, '|');
      this.setChar(x + width - 1, y + i, '|');
    }

    this.setChar(x, y, '/');
    this.setChar(x + width - 1, y, '\\');
    this.setChar(x, y + height - 1, '\\');
    this.setChar(x + width - 1, y + height - 1, '/');

    this.drawLabel(x, y, width, height, label);
  }

  drawDiamond(x, y, width, height, label) {
    const centerX = x + Math.floor(width / 2);
    const centerY = y + Math.floor(height / 2);

    // Simple diamond approximation
    this.setChar(centerX, y, '/');
    this.setChar(centerX, y + height - 1, '\\');
    this.setChar(x, centerY, '<');
    this.setChar(x + width - 1, centerY, '>');

    this.drawLabel(x, y, width, height, label);
  }

  drawLabel(x, y, width, height, label) {
    const labelY = y + Math.floor(height / 2);
    const labelX = x + Math.floor((width - label.length) / 2);

    for (let i = 0; i < label.length && i < width - 2; i++) {
      this.setChar(labelX + i, labelY, label[i]);
    }
  }

  renderEdges() {
    for (const edge of this.edges) {
      this.drawArrow(edge.from, edge.to);
    }
  }

  drawArrow(fromId, toId) {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);

    if (!fromNode || !toNode) return;

    const fromX = fromNode.x + Math.floor(fromNode.width / 2);
    const fromY = fromNode.y + fromNode.height;
    const toX = toNode.x + Math.floor(toNode.width / 2);
    const toY = toNode.y;

    if (this.direction === 'TD') {
      if (fromX === toX) {
        for (let y = fromY; y < toY; y++) {
          this.setChar(fromX, y, '|');
        }
        if (toY > fromY) {
          this.setChar(toX, toY - 1, 'v');
        }
      } else {
        const midY = fromY + Math.floor((toY - fromY) / 2);

        for (let y = fromY; y <= midY; y++) {
          this.setChar(fromX, y, '|');
        }

        const minX = Math.min(fromX, toX);
        const maxX = Math.max(fromX, toX);
        for (let x = minX; x <= maxX; x++) {
          this.setChar(x, midY, '-');
        }

        for (let y = midY; y < toY; y++) {
          this.setChar(toX, y, '|');
        }

        if (fromX !== toX) {
          this.setChar(fromX, midY, '+');
          this.setChar(toX, midY, '+');
        }

        this.setChar(toX, toY - 1, 'v');
      }
    }
  }

  setChar(x, y, char) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.canvas[y][x] = char;
    }
  }

  canvasToString() {
    return this.canvas.map(row => row.join('')).join('\n');
  }
}

// Sequence diagram classes remain the same...
class SequenceLayoutEngine {
  constructor(participants, messages) {
    this.participants = participants;
    this.messages = messages;
    this.messageHeight = 4;
  }

  calculateLayout() {
    let currentX = 5;
    for (const participant of this.participants) {
      participant.x = currentX;
      participant.y = 2;
      currentX += participant.width + 15;
    }

    let currentY = 8;
    for (const message of this.messages) {
      message.y = currentY;
      currentY += this.messageHeight;
    }

    return { participants: this.participants, messages: this.messages };
  }
}

class SequenceRenderer {
  constructor(participants, messages) {
    this.participants = participants;
    this.messages = messages;
    this.canvas = [];
    this.width = 0;
    this.height = 0;
  }

  render() {
    this.calculateCanvasSize();
    this.initializeCanvas();
    this.renderParticipants();
    this.renderLifelines();
    this.renderMessages();
    return this.canvasToString();
  }

  calculateCanvasSize() {
    let maxX = 0;
    let maxY = 10;

    for (const participant of this.participants) {
      maxX = Math.max(maxX, participant.x + participant.width);
    }

    if (this.messages.length > 0) {
      maxY = Math.max(maxY, this.messages[this.messages.length - 1].y + 10);
    }

    this.width = Math.max(maxX + 10, 50);
    this.height = Math.max(maxY, 20);
  }

  initializeCanvas() {
    this.canvas = Array(this.height).fill().map(() => Array(this.width).fill(' '));
  }

  renderParticipants() {
    for (const participant of this.participants) {
      this.drawBox(participant.x, participant.y, participant.width, participant.height, participant.label);
    }
  }

  renderLifelines() {
    for (const participant of this.participants) {
      const centerX = participant.x + Math.floor(participant.width / 2);
      const startY = participant.y + participant.height;
      const endY = this.height - 2;

      for (let y = startY; y < endY; y++) {
        this.setChar(centerX, y, '|');
      }
    }
  }

  renderMessages() {
    for (const message of this.messages) {
      this.drawMessage(message);
    }
  }

  drawMessage(message) {
    const fromParticipant = this.participants.find(p => p.id === message.from);
    const toParticipant = this.participants.find(p => p.id === message.to);

    if (!fromParticipant || !toParticipant) return;

    const fromX = fromParticipant.x + Math.floor(fromParticipant.width / 2);
    const toX = toParticipant.x + Math.floor(toParticipant.width / 2);
    const y = message.y;

    const minX = Math.min(fromX, toX);
    const maxX = Math.max(fromX, toX);

    for (let x = minX; x <= maxX; x++) {
      this.setChar(x, y, '-');
    }

    if (message.type === '->>') {
      this.setChar(toX, y, '>');
    } else if (message.type === '-x' || message.type === '--x') {
      this.setChar(toX, y, 'X');
    } else {
      this.setChar(toX, y, '>');
    }

    const labelX = Math.min(fromX, toX) + Math.floor(Math.abs(toX - fromX) / 2) - Math.floor(message.label.length / 2);
    const labelY = y - 1;

    for (let i = 0; i < message.label.length; i++) {
      this.setChar(labelX + i, labelY, message.label[i]);
    }
  }

  drawBox(x, y, width, height, label) {
    for (let i = 0; i < width; i++) {
      this.setChar(x + i, y, '-');
      this.setChar(x + i, y + height - 1, '-');
    }

    for (let i = 0; i < height; i++) {
      this.setChar(x, y + i, '|');
      this.setChar(x + width - 1, y + i, '|');
    }

    this.setChar(x, y, '+');
    this.setChar(x + width - 1, y, '+');
    this.setChar(x, y + height - 1, '+');
    this.setChar(x + width - 1, y + height - 1, '+');

    const labelY = y + Math.floor(height / 2);
    const labelX = x + Math.floor((width - label.length) / 2);

    for (let i = 0; i < label.length && i < width - 2; i++) {
      this.setChar(labelX + i, labelY, label[i]);
    }
  }

  setChar(x, y, char) {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.canvas[y][x] = char;
    }
  }

  canvasToString() {
    return this.canvas.map(row => row.join('')).join('\n');
  }
}

class MermaidCLI {
  constructor() {
    this.parser = new MermaidParser();
    this.options = {
      verbose: false,
      output: null
    };
  }

  async run() {
    try {
      this.parseArgs();
      const input = await this.getInput();

      if (!input.trim()) {
        throw new Error('No input provided');
      }

      if (this.options.verbose) {
        console.error('Parsing Mermaid diagram...');
      }

      const parsed = this.parser.parse(input);
      let output;

      if (parsed.type === 'sequenceDiagram') {
        if (this.options.verbose) {
          console.error(`Found sequence diagram with ${parsed.participants.length} participants and ${parsed.edges.length} messages`);
        }

        const layoutEngine = new SequenceLayoutEngine(parsed.participants, parsed.edges);
        const layout = layoutEngine.calculateLayout();
        const renderer = new SequenceRenderer(layout.participants, layout.messages);
        output = renderer.render();
      } else {
        if (this.options.verbose) {
          console.error(`Found ${parsed.type} with ${parsed.nodes.size} nodes and ${parsed.edges.length} edges`);
        }

        const layoutEngine = new SimpleLayoutEngine(
          parsed.nodes,
          parsed.edges,
          parsed.direction
        );

        const positionedNodes = layoutEngine.calculateLayout();

        const renderer = new ASCIIRenderer(
          positionedNodes,
          parsed.edges,
          parsed.direction
        );

        output = renderer.render();
      }

      if (this.options.output) {
        fs.writeFileSync(this.options.output, output);
        if (this.options.verbose) {
          console.error(`Output written to ${this.options.output}`);
        }
      } else {
        console.log(output);
      }

    } catch (error) {
      console.error('Error:', error.message);
      if (this.options.verbose) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  parseArgs() {
    const args = process.argv.slice(2);

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg === '--verbose' || arg === '-v') {
        this.options.verbose = true;
      } else if (arg === '--output' || arg === '-o') {
        this.options.output = args[++i];
      } else if (arg === '--help' || arg === '-h') {
        this.showHelp();
        process.exit(0);
      } else if (!arg.startsWith('-')) {
        this.options.inputFile = arg;
      }
    }
  }

  // Previous code goes here (all the existing code up to line 616)

  showHelp() {
    console.log(`
Mermaid CLI Visualizer (Enhanced)
Supports: Flowcharts, State Diagrams, Sequence Diagrams

Usage:
  node mermaid-cli.js [options] [file.mmd]

Options:
  -h, --help       Show this help message
  -v, --verbose    Enable verbose output
  -o, --output     Output file (default: stdout)

Examples:
  node mermaid-cli.js diagram.mmd
  echo "graph TD; A-->B" | node mermaid-cli.js
  node mermaid-cli.js -v -o output.txt diagram.mmd

Supported Mermaid Syntax:

Flowcharts:
  graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Process]
    B -->|No| D[End]

State Diagrams:
  stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still

Sequence Diagrams:
  sequenceDiagram
    participant A as Alice
    participant B as Bob
    A->>B: Hello Bob!
    B-->>A: Hello Alice!
    A-xB: Goodbye Bob!
`);
  }

  async getInput() {
    if (this.options.inputFile) {
      if (!fs.existsSync(this.options.inputFile)) {
        throw new Error(`Input file not found: ${this.options.inputFile}`);
      }
      return fs.readFileSync(this.options.inputFile, 'utf8');
    }

    // Read from stdin
    return new Promise((resolve, reject) => {
      let input = '';

      process.stdin.setEncoding('utf8');

      process.stdin.on('readable', () => {
        const chunk = process.stdin.read();
        if (chunk !== null) {
          input += chunk;
        }
      });

      process.stdin.on('end', () => {
        resolve(input);
      });

      process.stdin.on('error', (error) => {
        reject(error);
      });

      // Handle case where no input is piped
      setTimeout(() => {
        if (input === '' && process.stdin.isTTY) {
          reject(new Error('No input file specified and no data piped to stdin. Use --help for usage information.'));
        }
      }, 100);
    });
  }
}

// Main execution
if (require.main === module) {
  const cli = new MermaidCLI();
  cli.run();
}

module.exports = { MermaidParser, SimpleLayoutEngine, ASCIIRenderer, SequenceLayoutEngine, SequenceRenderer, MermaidCLI };
