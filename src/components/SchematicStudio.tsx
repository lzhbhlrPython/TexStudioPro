import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlignJustify, ArrowDownToLine, Atom, Battery, CircuitBoard, Cpu, FlaskConical,
  Gauge, GitBranch, Hexagon, Lightbulb, Loader2, LogIn, LogOut, Minus, Plus, Redo2,
  RotateCcw, ToggleLeft, Trash2, Undo2, Waves, X, Zap,
} from 'lucide-react';
import { useI18n } from '../i18n';

export type SchematicMode = 'circuit' | 'logic' | 'structure';

interface SchematicNode {
  id: string;
  kind: string;
  x: number;
  y: number;
  label: string;
  value: string;
}

interface SchematicEdge {
  id: string;
  from: string;
  to: string;
  order: 1 | 2 | 3;
}

interface Props {
  open: boolean;
  mode: SchematicMode;
  projectRoot: string | null;
  filePath: string | null;
  onClose: () => void;
  onInsert: (code: string, packageName: string) => void;
}

interface Template {
  name: string;
  nodes: Array<[string, number, number, string]>;
  edges: Array<[number, number, 1 | 2 | 3]>;
}

const configs = {
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
      { name: 'Series loop', nodes: [['battery', 80, 170, 'V'], ['resistor', 310, 170, 'R1'], ['resistor', 540, 170, 'R2']], edges: [[0, 1, 1], [1, 2, 1]] },
      { name: 'RC circuit', nodes: [['vsource', 80, 170, 'V'], ['resistor', 320, 170, 'R'], ['capacitor', 560, 170, 'C']], edges: [[0, 1, 1], [1, 2, 1]] },
      { name: 'Parallel pair', nodes: [['battery', 80, 180, 'V'], ['resistor', 330, 100, 'R1'], ['resistor', 330, 260, 'R2']], edges: [[0, 1, 1], [0, 2, 1]] },
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
      { name: 'AND gate', nodes: [['input', 70, 110, 'A'], ['input', 70, 250, 'B'], ['and', 350, 180, 'AND'], ['output', 640, 180, 'Y']], edges: [[0, 2, 1], [1, 2, 1], [2, 3, 1]] },
      { name: 'Half adder', nodes: [['input', 50, 80, 'A'], ['input', 50, 170, 'B'], ['xor', 300, 80, 'XOR'], ['and', 300, 220, 'AND'], ['output', 600, 80, 'S'], ['output', 600, 220, 'C']], edges: [[0, 2, 1], [1, 2, 1], [0, 3, 1], [1, 3, 1], [2, 4, 1], [3, 5, 1]] },
    ] as Template[],
  },
  structure: {
    package: 'chemfig',
    palette: [
      ['CH3', 'CH₃'], ['CH2', 'CH₂'], ['CH', 'CH'], ['C', 'C'], ['O', 'O'], ['OH', 'OH'],
      ['N', 'N'], ['NH2', 'NH₂'], ['H', 'H'], ['Cl', 'Cl'], ['Br', 'Br'], ['benzene', 'Benzene'],
    ],
    templates: [
      { name: 'Ethanol', nodes: [['CH3', 100, 180, 'CH3'], ['CH2', 340, 180, 'CH2'], ['OH', 580, 180, 'OH']], edges: [[0, 1, 1], [1, 2, 1]] },
      { name: 'Acetic acid', nodes: [['CH3', 80, 180, 'CH3'], ['C', 300, 180, 'C'], ['O', 520, 110, 'O'], ['OH', 520, 250, 'OH']], edges: [[0, 1, 1], [1, 2, 2], [1, 3, 1]] },
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

let nodeCounter = 10;
const nextId = (prefix: string) => `${prefix}${++nodeCounter}`;

function nodeLabel(kind: string): string {
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

function NodeIcon({ kind }: { kind: string }) {
  if (kind === 'battery' || kind === 'vsource') return <Battery size={13} />;
  if (kind === 'resistor' || kind === 'potentiometer') return <Activity size={13} />;
  if (kind === 'capacitor') return <AlignJustify size={13} />;
  if (kind === 'inductor') return <Waves size={13} />;
  if (kind === 'diode' || kind === 'led') return <Zap size={13} />;
  if (kind === 'switch') return <ToggleLeft size={13} />;
  if (kind === 'lamp') return <Lightbulb size={13} />;
  if (kind === 'ammeter' || kind === 'voltmeter') return <Gauge size={13} />;
  if (kind === 'ground') return <ArrowDownToLine size={13} />;
  if (kind === 'input') return <LogIn size={12} />;
  if (kind === 'output') return <LogOut size={12} />;
  if (kind === 'benzene') return <Hexagon size={13} />;
  if (kind === 'C' || kind === 'CH3' || kind === 'CH2' || kind === 'CH') return <Atom size={13} />;
  if (kind === 'and' || kind === 'or' || kind === 'not' || kind === 'xor' || kind === 'nand' || kind === 'nor' || kind === 'xnor') return <Cpu size={13} />;
  return <CircuitBoard size={13} />;
}

export function SchematicStudio({ open, mode, projectRoot, filePath, onClose, onInsert }: Props) {
  const { t } = useI18n();
  const config = configs[mode];
  const [nodes, setNodes] = useState<SchematicNode[]>([]);
  const [edges, setEdges] = useState<SchematicEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [template, setTemplate] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [history, setHistory] = useState<Array<{ nodes: SchematicNode[]; edges: SchematicEdge[] }>>([]);
  const [future, setFuture] = useState<Array<{ nodes: SchematicNode[]; edges: SchematicEdge[] }>>([]);
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number; startNodes: SchematicNode[] } | null>(null);
  const storageKey = projectRoot ? `texpro.schematic.${mode}.${projectRoot}` : '';

  const commit = (nextNodes: SchematicNode[], nextEdges: SchematicEdge[]) => {
    setHistory((current) => [...current.slice(-39), { nodes, edges }]);
    setFuture([]);
    setNodes(nextNodes);
    setEdges(nextEdges);
  };

  const loadTemplate = (index: number) => {
    const selectedTemplate = config.templates[index];
    if (!selectedTemplate) return;
    const nextNodes: SchematicNode[] = selectedTemplate.nodes.map(([kind, x, y, label]) => ({
      id: nextId('n'), kind, x, y, label, value: '',
    }));
    const nextEdges: SchematicEdge[] = selectedTemplate.edges.map(([from, to, order]) => ({
      id: nextId('e'), from: nextNodes[from].id, to: nextNodes[to].id, order,
    }));
    commit(nextNodes, nextEdges);
    setSelectedNode(nextNodes[0]?.id ?? null);
    setSelectedEdge(null);
  };

  useEffect(() => {
    if (!open) return;
    let nextNodes: SchematicNode[] | null = null;
    let nextEdges: SchematicEdge[] | null = null;
    if (storageKey) {
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
        if (saved?.nodes && saved?.edges) {
          nextNodes = saved.nodes;
          nextEdges = saved.edges;
        }
      } catch { /* ignore */ }
    }
    if (!nextNodes || !nextEdges) {
      const first = config.templates[0];
      nextNodes = first.nodes.map(([kind, x, y, label]) => ({ id: nextId('n'), kind, x, y, label, value: '' }));
      nextEdges = first.edges.map(([from, to, order]) => ({ id: nextId('e'), from: nextNodes![from].id, to: nextNodes![to].id, order }));
    }
    setNodes(nextNodes);
    setEdges(nextEdges);
    setSelectedNode(nextNodes[0]?.id ?? null);
    setSelectedEdge(null);
    setPending(null);
    setPreview(null);
    setPreviewError('');
    setHistory([]);
    setFuture([]);
  }, [open, mode]);

  useEffect(() => {
    if (!open || !storageKey) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify({ nodes, edges }));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [open, storageKey, nodes, edges]);

  useEffect(() => {
    if (!open) return;
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault(); redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); removeSelected();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [open, history, future, selectedNode, selectedEdge, nodes, edges]);

  const undo = () => {
    if (!history.length) return;
    const previous = history[history.length - 1];
    setFuture((current) => [{ nodes, edges }, ...current].slice(0, 40));
    setHistory((current) => current.slice(0, -1));
    setNodes(previous.nodes);
    setEdges(previous.edges);
  };
  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((current) => [...current.slice(-39), { nodes, edges }]);
    setFuture((current) => current.slice(1));
    setNodes(next.nodes);
    setEdges(next.edges);
  };

  const code = useMemo(() => {
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
          lines.push(`  \\draw (${x1},${y1}) -- (${x2},${y2});`);
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
  }, [nodes, edges, mode]);

  useEffect(() => {
    if (!open || !projectRoot || !filePath || !code.trim()) return;
    let cancelled = false;
    setPreviewBusy(true);
    const timer = window.setTimeout(async () => {
      try {
        const result = await window.texpro.renderTikz({ projectRoot, filePath, source: code });
        if (cancelled) return;
        setPreview(result.ok ? result.svgPath || null : null);
        setPreviewError(result.ok ? '' : result.error || 'Preview failed');
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    }, 650);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [open, projectRoot, filePath, code]);

  if (!open) return null;

  const selected = nodes.find((node) => node.id === selectedNode);
  const selectedConnection = edges.find((edge) => edge.id === selectedEdge);

  const addNode = (kind: string, x = 260, y = 150) => {
    const id = nextId('n');
    commit([...nodes, { id, kind, x, y, label: nodeLabel(kind), value: '' }], edges);
    setSelectedNode(id);
    setSelectedEdge(null);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const kind = event.dataTransfer.getData('text/plain');
    if (!kind) return;
    const rect = event.currentTarget.getBoundingClientRect();
    addNode(kind, (event.clientX - rect.left - 45) / zoom, (event.clientY - rect.top - 20) / zoom);
  };

  const startDrag = (event: React.PointerEvent, node: SchematicNode) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      id: node.id,
      offsetX: (event.clientX - rect.left) / zoom,
      offsetY: (event.clientY - rect.top) / zoom,
      startNodes: nodes,
    };
    setSelectedNode(node.id);
    setSelectedEdge(null);
  };
  const moveDrag = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const canvas = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setNodes((current) => current.map((node) => node.id === drag.id ? {
      ...node,
      x: Math.max(10, Math.round((event.clientX - canvas.left - drag.offsetX * zoom) / 10) * 10),
      y: Math.max(10, Math.round((event.clientY - canvas.top - drag.offsetY * zoom) / 10) * 10),
    } : node));
  };
  const endDrag = () => {
    if (dragRef.current) {
      setHistory((current) => [...current.slice(-39), { nodes: dragRef.current!.startNodes, edges }]);
      setFuture([]);
    }
    dragRef.current = null;
  };

  const removeSelected = () => {
    if (selectedEdge) {
      commit(nodes, edges.filter((edge) => edge.id !== selectedEdge));
      setSelectedEdge(null);
      return;
    }
    if (!selectedNode) return;
    commit(nodes.filter((node) => node.id !== selectedNode), edges.filter((edge) => edge.from !== selectedNode && edge.to !== selectedNode));
    setSelectedNode(null);
  };

  const connect = (id: string) => {
    if (!pending) { setPending(id); return; }
    if (pending === id) { setPending(null); return; }
    commit(nodes, [...edges, { id: nextId('e'), from: pending, to: id, order: 1 }]);
    setPending(null);
  };

  const updateSelected = (patch: Partial<SchematicNode>) => {
    if (!selectedNode) return;
    commit(nodes.map((node) => node.id === selectedNode ? { ...node, ...patch } : node), edges);
  };

  const title = mode === 'circuit' ? t('Circuit studio') : mode === 'logic' ? t('Logic studio') : t('Structure studio');
  const Icon = mode === 'circuit' ? CircuitBoard : mode === 'logic' ? GitBranch : FlaskConical;

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="schematic-studio" data-testid={`${mode}-studio`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Icon size={18} /></div>
            <div><span className="modal-eyebrow">{t('Visual diagram')}</span><h2>{title}</h2></div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{config.package}</span>
            <button className="icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </header>

        <div className="schematic-toolbar">
          <select value={template} onChange={(event) => { setTemplate(Number(event.target.value)); loadTemplate(Number(event.target.value)); }}>
            {config.templates.map((item, index) => <option key={item.name} value={index}>{t(item.name)}</option>)}
          </select>
          <span className="toolbar-sep" />
          <button className="icon-btn" onClick={undo} disabled={!history.length} title={t('Undo')}><Undo2 size={13} /></button>
          <button className="icon-btn" onClick={redo} disabled={!future.length} title={t('Redo')}><Redo2 size={13} /></button>
          <button className="icon-btn" onClick={() => loadTemplate(template)} title={t('Reset')}><RotateCcw size={13} /></button>
          <span className="toolbar-sep" />
          <button className="icon-btn" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} title={t('Zoom out')}><Minus size={13} /></button>
          <span className="zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" onClick={() => setZoom((value) => Math.min(1.6, value + 0.1))} title={t('Zoom in')}><Plus size={13} /></button>
          <span className="spacer" />
          <button className="danger-btn" onClick={removeSelected} disabled={!selectedNode && !selectedEdge}><Trash2 size={12} /> {t('Delete')}</button>
        </div>

        <div className="schematic-body">
          <aside className="schematic-palette">
            <div className="pane-label"><Plus size={12} /> {t('Components')}</div>
            <div className="schematic-palette-list">
              {config.palette.map(([kind, label]) => (
                <button key={kind} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', kind)} onClick={() => addNode(kind)}>
                  <span className="palette-label"><NodeIcon kind={kind} /> {t(label)}</span><small>{kind}</small>
                </button>
              ))}
            </div>
            <p className="schematic-hint">{t('Drag onto the canvas. Click two nodes to connect them.')}</p>
          </aside>

          <div className="schematic-canvas" onDrop={onDrop} onDragOver={(event) => event.preventDefault()} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
            <div className="schematic-canvas-inner" style={{ transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
              <svg className="schematic-wires">
                {edges.map((edge) => {
                  const from = nodes.find((node) => node.id === edge.from);
                  const to = nodes.find((node) => node.id === edge.to);
                  if (!from || !to) return null;
                  const x1 = from.x + 110;
                  const y1 = from.y + 22;
                  const x2 = to.x;
                  const y2 = to.y + 22;
                  const mid = (x1 + x2) / 2;
                  return (
                    <g key={edge.id} className={selectedEdge === edge.id ? 'selected' : ''} onClick={() => { setSelectedEdge(edge.id); setSelectedNode(null); }}>
                      <path className="wire-hit" d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} />
                      <path d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} />
                    </g>
                  );
                })}
              </svg>
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className={`schematic-node ${selectedNode === node.id ? 'selected' : ''} ${pending === node.id ? 'pending' : ''} kind-${node.kind}`}
                  style={{ left: node.x, top: node.y }}
                  onPointerDown={(event) => startDrag(event, node)}
                  onDoubleClick={() => connect(node.id)}
                >
                  <span className="schematic-port left" onPointerDown={(event) => { event.stopPropagation(); connect(node.id); }} />
                  <span className="schematic-node-icon"><NodeIcon kind={node.kind} /></span>
                  <span className="schematic-node-copy"><strong>{node.label}</strong><small>{node.kind}</small></span>
                  <span className="schematic-port right" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); connect(node.id); }} />
                </div>
              ))}
            </div>
          </div>

          <aside className="schematic-preview">
            <div className="pane-label">{t('Inspector')}</div>
            {selected ? (
              <div className="schematic-inspector">
                <label className="workshop-field"><span>{t('Label')}</span><input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
                <label className="workshop-field"><span>{t('Element')}</span><input value={selected.kind} readOnly /></label>
                <label className="workshop-field"><span>{t('Value')}</span><input value={selected.value} onChange={(event) => updateSelected({ value: event.target.value })} placeholder="10 kΩ" /></label>
                <p className="schematic-hint">{t('Drag the node on canvas. Connect by clicking ports.')}</p>
                <button className="secondary-btn" onClick={() => {
                  const id = nextId('n');
                  commit([...nodes, { ...selected, id, x: selected.x + 30, y: selected.y + 30 }], edges);
                  setSelectedNode(id);
                }}>{t('Duplicate')}</button>
              </div>
            ) : selectedConnection ? (
              <div className="schematic-inspector">
                <label className="workshop-field"><span>{t('Bond order')}</span>
                  <select value={selectedConnection.order} onChange={(event) => {
                    const order = Number(event.target.value) as 1 | 2 | 3;
                    commit(nodes, edges.map((edge) => edge.id === selectedConnection.id ? { ...edge, order } : edge));
                  }}>
                    <option value={1}>{t('Single')}</option><option value={2}>{t('Double')}</option><option value={3}>{t('Triple')}</option>
                  </select>
                </label>
              </div>
            ) : <div className="schematic-empty"><CircuitBoard size={20} /><strong>{t('Select a node or wire')}</strong><span>{nodes.length} {t('nodes')} · {edges.length} {t('wires')}</span></div>}
            <div className="pane-label">{t('Preview')}</div>
            <div className="schematic-preview-canvas">
              {previewBusy && <div className="schematic-loading"><Loader2 size={16} className="spin" /><span>{t('Typesetting preview…')}</span></div>}
              {!previewBusy && preview && <img src={preview} alt="diagram preview" />}
              {!previewBusy && !preview && <span>{previewError || t('Preview will appear here.')}</span>}
            </div>
            <div className="pane-label">{t('Generated LaTeX')}</div>
            <pre className="schematic-code">{code}</pre>
          </aside>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Visual structure, editable LaTeX output.')}</span>
          <div className="spacer" />
          <button className="secondary-btn" onClick={onClose}>{t('Cancel')}</button>
          <button className="primary-btn" onClick={() => { onInsert(code, config.package); onClose(); }}>{t('Insert diagram')}</button>
        </footer>
      </section>
    </div>
  );
}
