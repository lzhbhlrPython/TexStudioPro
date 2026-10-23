import { useEffect, useMemo, useState } from 'react';
import { Network, RefreshCw, X } from 'lucide-react';
import { basename } from '../lib/latex';
import { useI18n } from '../i18n';

interface GraphNode {
  id: string;
  type: 'file' | 'label' | 'citation';
  label: string;
  file: string;
  line: number;
  orphan?: boolean;
}

interface GraphEdge {
  from: string;
  to: string;
  type: string;
}

interface Props {
  open: boolean;
  projectRoot: string | null;
  onClose: () => void;
  onOpen: (file: string, line: number) => void;
}

const WIDTH = 960;
const HEIGHT = 620;
const COLUMNS: Record<GraphNode['type'], number> = { file: 150, label: 480, citation: 810 };

export function ProjectGraph({ open, projectRoot, onClose, onOpen }: Props) {
  const { t } = useI18n();
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState({ file: true, label: true, citation: true });

  const load = async () => {
    if (!projectRoot) return;
    setLoading(true);
    try {
      const graph = await window.texpro.projectGraph(projectRoot);
      setNodes(graph.nodes);
      setEdges(graph.edges);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, projectRoot]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    for (const type of ['file', 'label', 'citation'] as const) {
      const group = nodes.filter((node) => node.type === type);
      group.forEach((node, index) => {
        map.set(node.id, {
          x: COLUMNS[type],
          y: 76 + ((index + 1) * (HEIGHT - 132)) / (group.length + 1),
        });
      });
    }
    return map;
  }, [nodes]);

  if (!open) return null;
  const visible = (node: GraphNode) => filter[node.type];

  return (
    <div className="modal-scrim" onMouseDown={onClose}>
      <section className="graph-studio" data-testid="project-graph" onMouseDown={(event) => event.stopPropagation()}>
        <header className="studio-header">
          <div className="studio-heading">
            <div className="studio-icon"><Network size={18} /></div>
            <div>
              <span className="modal-eyebrow">{t('Project structure')}</span>
              <h2>{t('Citation & label graph')}</h2>
            </div>
          </div>
          <div className="studio-header-actions">
            <span className="studio-engine ok">{nodes.length} {t('nodes')} · {edges.length} {t('edges')}</span>
            <button className="secondary-btn" onClick={() => void load()} disabled={loading}><RefreshCw size={12} className={loading ? 'spin' : ''} /> {t('Re-scan')}</button>
            <button className="icon-btn" onClick={onClose} aria-label={t('Close')}><X size={16} /></button>
          </div>
        </header>

        <div className="graph-body">
          <aside className="graph-legend">
            {(['file', 'label', 'citation'] as const).map((type) => (
              <label key={type} className="chart-check">
                <input type="checkbox" checked={filter[type]} onChange={(event) => setFilter({ ...filter, [type]: event.target.checked })} />
                <i className={`graph-dot ${type}`} /> {t(type === 'file' ? 'Files' : type === 'label' ? 'Labels' : 'Citations')}
              </label>
            ))}
            <p>{t('Click a node to jump to its source. Orphan labels are marked in amber.')}</p>
          </aside>
          <div className="graph-canvas">
            <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('Citation & label graph')}>
              {edges.map((edge, index) => {
                const from = positions.get(edge.from);
                const to = positions.get(edge.to);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${edge.from}-${edge.to}-${index}`}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    className={`graph-edge ${edge.type}`}
                  />
                );
              })}
              {nodes.filter(visible).map((node) => {
                const position = positions.get(node.id);
                if (!position) return null;
                return (
                  <g
                    key={node.id}
                    className={`graph-node ${node.type} ${node.orphan ? 'orphan' : ''}`}
                    transform={`translate(${position.x},${position.y})`}
                    onClick={() => onOpen(node.file, node.line)}
                  >
                    <circle r={node.type === 'file' ? 8 : 6} />
                    <text x={node.type === 'citation' ? -10 : 11} textAnchor={node.type === 'citation' ? 'end' : 'start'}>
                      {node.type === 'file' ? basename(node.file) : node.label}
                    </text>
                    <title>{node.type === 'file' ? node.file : `${node.label} · ${basename(node.file)}:${node.line}`}</title>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <footer className="studio-footer">
          <span className="studio-hint">{t('Graph is built from \\label, \\ref, \\cite and \\input/\\include relationships.')}</span>
          <div className="spacer" />
          <button className="primary-btn" onClick={onClose}>{t('Done')}</button>
        </footer>
      </section>
    </div>
  );
}
