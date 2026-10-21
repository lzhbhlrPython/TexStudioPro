export type SchematicMode = 'circuit' | 'logic' | 'structure';

export interface SchematicNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  label: string;
  value: string;
}

export interface SchematicEdge {
  id: string;
  from: string;
  to: string;
  order: 1 | 2 | 3;
}

interface Template {
  name: string;
  nodes: Array<[string, number, number, string]>;
  edges: Array<[number, number, 1 | 2 | 3]>;
}

export const configs = {
  circuit: {
    package: 'circuitikz',
    palette: [
      ['battery', 'Battery'], ['resistor', 'Resistor'], ['capacitor', 'Capacitor'],
      ['inductor', 'Inductor'], ['diode', 'Diode'], ['led', 'LED'],
      ['switch', 'Switch'], ['lamp', 'Lamp'], ['vsource', 'Voltage source'],
      ['isource', 'Current source'], ['ammeter', 'Ammeter'], ['voltmeter', 'Voltmeter'],
      ['potentiometer', 'Potentiometer'], ['ground', 'Ground'],
    ],
    templates: [
      { name: 'Series loop', nodes: [['battery', 80, 170, 'V'], ['resistor', 310, 170, 'R1'], ['resistor', 500, 170, 'R2']], edges: [[0, 1, 1], [1, 2, 1], [2, 0, 1]] },
      { name: 'RC circuit', nodes: [['vsource', 80, 170, 'V'], ['resistor', 320, 170, 'R'], ['capacitor', 500, 170, 'C']], edges: [[0, 1, 1], [1, 2, 1], [2, 0, 1]] },
      { name: 'Parallel pair', nodes: [['battery', 80, 180, 'V'], ['resistor', 330, 100, 'R1'], ['resistor', 330, 260, 'R2']], edges: [[0, 1, 1], [0, 2, 1], [1, 0, 1], [2, 0, 1]] },
    ] as Template[],
  },
  logic: {
    package: 'circuitikz',
    palette: [
      ['input', 'Input'], ['and', 'AND'], ['or', 'OR'], ['not', 'NOT'],
      ['xor', 'XOR'], ['nand', 'NAND'], ['nor', 'NOR'], ['xnor', 'XNOR'],
      ['output', 'Output'],
    ],
    templates: [
      { name: 'AND gate', nodes: [['input', 70, 110, 'A'], ['input', 70, 250, 'B'], ['and', 350, 180, 'AND'], ['output', 560, 180, 'Y']], edges: [[0, 2, 1], [1, 2, 1], [2, 3, 1]] },
      { name: 'Half adder', nodes: [['input', 50, 80, 'A'], ['input', 50, 170, 'B'], ['xor', 300, 80, 'XOR'], ['and', 300, 220, 'AND'], ['output', 520, 80, 'S'], ['output', 520, 220, 'C']], edges: [[0, 2, 1], [1, 2, 1], [0, 3, 1], [1, 3, 1], [2, 4, 1], [3, 5, 1]] },
    ] as Template[],
  },
  structure: {
    package: 'chemfig',
    palette: [
      ['CH3', 'CH₃'], ['CH2', 'CH₂'], ['CH', 'CH'], ['C', 'C'], ['O', 'O'], ['OH', 'OH'],
      ['N', 'N'], ['NH2', 'NH₂'], ['H', 'H'], ['Cl', 'Cl'], ['Br', 'Br'], ['benzene', 'Benzene'],
    ],
    templates: [
      { name: 'Ethanol', nodes: [['CH3', 100, 180, 'CH3'], ['CH2', 340, 180, 'CH2'], ['OH', 500, 180, 'OH']], edges: [[0, 1, 1], [1, 2, 1]] },
      { name: 'Acetic acid', nodes: [['CH3', 80, 180, 'CH3'], ['C', 300, 180, 'C'], ['O', 480, 110, 'O'], ['OH', 480, 250, 'OH']], edges: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] },
    ] as Template[],
  },
} as const;

const CIRCUIT_STYLE: Record<string, string> = {
  battery: 'battery1', vsource: 'vsource', isource: 'isource', resistor: 'R',
  capacitor: 'capacitor', inductor: 'inductor', diode: 'D', led: 'led',
  switch: 'closing switch', lamp: 'lamp', ammeter: 'ammeter', voltmeter: 'voltmeter',
  potentiometer: 'potentiometer', ground: 'ground',
};

const LOGIC_PORTS: Record<string, string> = {
  and: 'and port', or: 'or port', not: 'not port', xor: 'xor port',
  nand: 'nand port', nor: 'nor port', xnor: 'xnor port', buffer: 'buffer port',
};

export const nextId = (prefix: string) => `${prefix}${crypto.randomUUID().replaceAll('-', '')}`;

export function nodeLabel(kind: string): string {
  if (kind === 'input') return 'A';
  if (kind === 'output') return 'Y';
  if (kind === 'battery' || kind === 'vsource') return 'V';
  if (kind === 'resistor') return 'R';
  if (kind === 'capacitor') return 'C';
  if (kind === 'inductor') return 'L';
  if (kind === 'ground') return 'GND';
  return kind;
}

function cleanLabel(label: string): string {
  return label.replace(/_/g, '\\_').replace(/%/g, '\\%');
}

export function generateSchematic(mode: SchematicMode, nodes: SchematicNode[], edges: SchematicEdge[]): string {
    if (mode === 'circuit') {
      const lines = ['\\begin{circuitikz}[american]'];
      for (const node of nodes) {
        const x = (node.x / 40).toFixed(2);
        const y = ((300 - node.y) / 40).toFixed(2);
        const style = CIRCUIT_STYLE[node.kind] || 'R';
        if (node.kind === 'ground') {
          lines.push(`  \\draw (${x},${y}) node[ground] {};`);
        } else {
          const value = node.value ? `=${node.value}` : '';
          lines.push(`  \\draw (${x},${y}) to[${style}, l=$${cleanLabel(node.label)}${value}$] (${(Number(x) + 2).toFixed(2)},${y});`);
        }
      }
      for (const edge of edges) {
        const from = nodes.find((node) => node.id === edge.from);
        const to = nodes.find((node) => node.id === edge.to);
        if (from && to) {
          const x1 = (from.x / 40 + 2).toFixed(2);
          const y1 = ((300 - from.y) / 40).toFixed(2);
          const x2 = (to.x / 40).toFixed(2);
          const y2 = ((300 - to.y) / 40).toFixed(2);
          if (to.x <= from.x) {
              lines.push(`  \\draw (${x1},${y1}) -- (${x1},${((300 - (Math.max(from.y, to.y) + 86)) / 40).toFixed(2)}) -- (${x2},${((300 - (Math.max(from.y, to.y) + 86)) / 40).toFixed(2)}) -- (${x2},${y2});`);
          } else {
            lines.push(`  \\draw (${x1},${y1}) -- (${x2},${y2});`);
          }
        }
      }
      lines.push('\\end{circuitikz}');
      return lines.join('\n');
    }
    if (mode === 'logic') {
      const lines = ['\\begin{circuitikz}'];
      for (const node of nodes) {
        const name = node.id;
        const x = (node.x / 40).toFixed(2);
        const y = ((300 - node.y) / 40).toFixed(2);
        if (node.kind === 'input' || node.kind === 'output') {
          lines.push(`  \\node (${name}) at (${x},${y}) {$${cleanLabel(node.label)}$};`);
        } else {
          const port = LOGIC_PORTS[node.kind] || 'and port';
          lines.push(`  \\node[${port}] (${name}) at (${x},${y}) {};`);
        }
      }
      const usedInputs = new Map<string, number>();
      for (const edge of edges) {
        const to = nodes.find((node) => node.id === edge.to);
        if (!to) continue;
        if (to.kind === 'input' || to.kind === 'output') {
          lines.push(`  \\draw (${edge.from}) -- (${edge.to});`);
        } else if (to.kind === 'not' || to.kind === 'buffer') {
          lines.push(`  \\draw (${edge.from}) -- (${edge.to}.in);`);
        } else {
          const index = (usedInputs.get(edge.to) || 0) + 1;
          usedInputs.set(edge.to, index);
          lines.push(`  \\draw (${edge.from}) -- (${edge.to}.in ${Math.min(2, index)});`);
        }
      }
      lines.push('\\end{circuitikz}');
      return lines.join('\n');
    }

    const label = (node: SchematicNode) => node.kind === 'benzene' ? '*6(======)' : cleanLabel(node.label.replace(/_/g, '\\_')).replace(/([A-Za-z])(\d+)/g, '$1_$2');
    const adjacency = new Map<string, Array<{ to: string; order: number }>>();
    for (const node of nodes) adjacency.set(node.id, []);
    for (const edge of edges) {
      adjacency.get(edge.from)?.push({ to: edge.to, order: edge.order });
      adjacency.get(edge.to)?.push({ to: edge.from, order: edge.order });
    }
    const visited = new Set<string>();
    const walk = (id: string, parent: string | null): string => {
      visited.add(id);
      const node = nodes.find((item) => item.id === id);
      if (!node) return '';
      const children = (adjacency.get(id) || []).filter((item) => item.to !== parent && !visited.has(item.to));
      if (!children.length) return label(node);
      const first = children[0];
      const bond = first.order === 2 ? '=' : first.order === 3 ? '~' : '-';
      let result = label(node) + bond + walk(first.to, id);
      for (const child of children.slice(1)) {
        const branchBond = child.order === 2 ? '=' : child.order === 3 ? '~' : '-';
        result += `(-[::60]${branchBond}${walk(child.to, id)})`;
      }
      return result;
    };
    const components: string[] = [];
    for (const node of [...nodes].sort((a, b) => a.x - b.x)) {
      if (visited.has(node.id)) continue;
      const component = walk(node.id, null);
      if (component) components.push(component);
    }
    return `\\chemfig{${components.join(' + ')}}`;
}


export interface SchematicSnapshot { nodes: SchematicNode[]; edges: SchematicEdge[] }

/** Storage is user data: validate before rendering or generating TeX. */
export function restoreSchematic(value: unknown, mode: SchematicMode): SchematicSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot = value as SchematicSnapshot;
  if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return null;
  const kinds = new Set<string>(configs[mode].palette.map(([kind]) => kind));
  const ids = new Set<string>();
  for (const node of snapshot.nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id) || !kinds.has(node.kind)
      || !Number.isFinite(node.x) || !Number.isFinite(node.y)
      || node.x < 0 || node.y < 0 || typeof node.label !== 'string' || typeof node.value !== 'string') return null;
    ids.add(node.id);
  }
  const edgeIds = new Set<string>();
  for (const edge of snapshot.edges) {
    if (!edge || typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id)
      || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to || ![1, 2, 3].includes(edge.order)) return null;
    edgeIds.add(edge.id);
  }
  return snapshot;
}
